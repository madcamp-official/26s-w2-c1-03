jest.mock('../config/firebase.config', () => ({
  getFirebaseApp: jest.fn().mockReturnValue({}),
}));

const saveMock = jest.fn().mockResolvedValue(undefined);
const deleteMock = jest.fn().mockResolvedValue(undefined);
const fileMock = jest.fn().mockReturnValue({ save: saveMock, delete: deleteMock });
const bucketMock = { name: 'test-bucket', file: fileMock };

jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn().mockReturnValue({ bucket: () => bucketMock }),
}));

import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StorageService({ getOrThrow: jest.fn() } as never);
  });

  it('버킷에 저장하고 Firebase 클라이언트 SDK 형식의 다운로드 URL을 반환한다', async () => {
    const url = await service.uploadPermanent(
      Buffer.from('bytes'),
      'record-photos/r1/p1.jpg',
      'image/jpeg',
    );

    expect(fileMock).toHaveBeenCalledWith('record-photos/r1/p1.jpg');
    expect(saveMock).toHaveBeenCalledWith(
      Buffer.from('bytes'),
      expect.objectContaining({
        contentType: 'image/jpeg',
        metadata: expect.objectContaining({
          metadata: expect.objectContaining({ firebaseStorageDownloadTokens: expect.any(String) }),
        }),
      }),
    );
    expect(url).toContain('https://firebasestorage.googleapis.com/v0/b/test-bucket/o/');
    expect(url).toContain(encodeURIComponent('record-photos/r1/p1.jpg'));
    expect(url).toMatch(/[?&]alt=media&token=/);
  });

  it('deletePermanent는 없어도 에러 없이 버킷 객체를 삭제한다', async () => {
    await service.deletePermanent('record-photos/r1/p1.jpg');

    expect(fileMock).toHaveBeenCalledWith('record-photos/r1/p1.jpg');
    expect(deleteMock).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  describe('extractObjectPath', () => {
    it('uploadPermanent가 만든 URL에서 objectPath를 복원한다', async () => {
      const url = await service.uploadPermanent(
        Buffer.from('bytes'),
        'record-photos/r1/p1.jpg',
        'image/jpeg',
      );

      expect(StorageService.extractObjectPath(url)).toBe('record-photos/r1/p1.jpg');
    });

    it('형식에 맞지 않는 URL이면 null을 반환한다', () => {
      expect(StorageService.extractObjectPath('https://example.com/not-a-firebase-url')).toBeNull();
    });
  });
});
