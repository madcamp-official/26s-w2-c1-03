import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RecordPhotoRefStatus } from './entities/record-photo-ref.entity';
import { PhotoBufferCleanupService } from './photo-buffer-cleanup.service';

describe('PhotoBufferCleanupService', () => {
  let bufferDir: string;
  let recordPhotoRefRepository: { update: jest.Mock };
  let service: PhotoBufferCleanupService;

  beforeEach(async () => {
    bufferDir = await fs.mkdtemp(path.join(os.tmpdir(), 'record-photo-buffer-cleanup-test-'));
    recordPhotoRefRepository = { update: jest.fn() };

    const configService = {
      getOrThrow: jest.fn((key: string) => (key === 'PHOTO_TEMP_BUFFER_DIR' ? bufferDir : 30)),
    };

    service = new PhotoBufferCleanupService(
      configService as never,
      recordPhotoRefRepository as never,
    );
  });

  afterEach(async () => {
    await fs.rm(bufferDir, { recursive: true, force: true });
  });

  it('버퍼 디렉터리가 아직 없으면 아무 것도 하지 않는다', async () => {
    await fs.rm(bufferDir, { recursive: true, force: true });

    await expect(service.sweepExpiredFiles()).resolves.toBeUndefined();
    expect(recordPhotoRefRepository.update).not.toHaveBeenCalled();
  });

  it('TTL을 넘기지 않은 파일은 지우지 않는다', async () => {
    const filePath = path.join(bufferDir, 'fresh-ref');
    await fs.writeFile(filePath, 'bytes');

    await service.sweepExpiredFiles();

    await expect(fs.access(filePath)).resolves.toBeUndefined();
    expect(recordPhotoRefRepository.update).not.toHaveBeenCalled();
  });

  it('TTL을 넘긴 파일은 삭제하고 해당 photoRef를 DISCARDED로 갱신한다', async () => {
    const filePath = path.join(bufferDir, 'stale-ref');
    await fs.writeFile(filePath, 'bytes');

    // TTL(30분)을 넘긴 것처럼 mtime을 과거로 되돌린다.
    const past = new Date(Date.now() - 60 * 60_000);
    await fs.utimes(filePath, past, past);

    await service.sweepExpiredFiles();

    await expect(fs.access(filePath)).rejects.toThrow();
    expect(recordPhotoRefRepository.update).toHaveBeenCalledWith(
      { tempFilePath: filePath },
      { tempFilePath: null, status: RecordPhotoRefStatus.DISCARDED },
    );
  });
});
