import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { NotFoundException } from '@nestjs/common';
import { PhotoPreviewController } from './photo-preview.controller';
import { signPhotoPreviewToken } from './utils/photo-preview-token.util';

function buildConfigService(secret: string) {
  return { getOrThrow: jest.fn().mockReturnValue(secret) } as never;
}

function buildRes() {
  const stream = new PassThrough() as unknown as PassThrough & {
    type: jest.Mock;
    status: jest.Mock;
    headersSent: boolean;
    chunks: Buffer[];
  };
  stream.chunks = [];
  stream.on('data', (chunk: Buffer) => stream.chunks.push(chunk));
  stream.type = jest.fn();
  stream.status = jest.fn().mockReturnThis();
  stream.headersSent = false;
  return stream;
}

describe('PhotoPreviewController', () => {
  const secret = 'test-preview-secret';
  let recordPhotoRefRepository: { findOneBy: jest.Mock };
  let controller: PhotoPreviewController;
  let tempDir: string;

  beforeEach(async () => {
    recordPhotoRefRepository = { findOneBy: jest.fn() };
    controller = new PhotoPreviewController(
      buildConfigService(secret),
      recordPhotoRefRepository as never,
    );
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-preview-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('서명이 유효하지 않으면 NotFoundException을 던지고 DB를 조회하지 않는다', async () => {
    const res = buildRes();

    await expect(
      controller.serve('ref-1', String(Date.now() + 60_000), 'bad-signature', res as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(recordPhotoRefRepository.findOneBy).not.toHaveBeenCalled();
  });

  it('만료된 서명이면 NotFoundException을 던진다', async () => {
    const expiresAt = Date.now() - 1;
    const sig = signPhotoPreviewToken('ref-1', expiresAt, secret);
    const res = buildRes();

    await expect(
      controller.serve('ref-1', String(expiresAt), sig, res as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('서명은 유효해도 photoRef가 없거나 임시파일이 없으면 NotFoundException을 던진다', async () => {
    const expiresAt = Date.now() + 60_000;
    const sig = signPhotoPreviewToken('ref-1', expiresAt, secret);
    recordPhotoRefRepository.findOneBy.mockResolvedValue(null);
    const res = buildRes();

    await expect(
      controller.serve('ref-1', String(expiresAt), sig, res as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('유효한 서명이면 파일을 스트리밍해서 응답한다', async () => {
    const filePath = path.join(tempDir, 'ref-1.jpg');
    await fs.writeFile(filePath, 'jpeg-bytes');
    recordPhotoRefRepository.findOneBy.mockResolvedValue({ id: 'ref-1', tempFilePath: filePath });

    const expiresAt = Date.now() + 60_000;
    const sig = signPhotoPreviewToken('ref-1', expiresAt, secret);
    const res = buildRes();
    const ended = new Promise<void>((resolve) => res.on('end', resolve));

    await controller.serve('ref-1', String(expiresAt), sig, res as never);
    await ended;

    expect(res.type).toHaveBeenCalledWith('image/jpeg');
    expect(Buffer.concat(res.chunks).toString('utf8')).toBe('jpeg-bytes');
  });
});
