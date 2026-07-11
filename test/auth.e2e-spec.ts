import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuthController } from '../src/auth/auth.controller';
import { GoogleTokenVerifier } from '../src/auth/strategies/google-token-verifier';
import { KakaoTokenVerifier } from '../src/auth/strategies/kakao-token-verifier';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { globalValidationPipeOptions } from '../src/common/pipes/validation-pipe.options';
import { AppModule } from '../src/app.module';

/**
 * 실제 카카오/구글 자격증명 없이 /auth/* 전체 흐름을 검증한다.
 * KakaoTokenVerifier/GoogleTokenVerifier만 fake로 교체하고, 나머지(DB, JWT 서명/검증,
 * rotation, 재사용 탐지)는 실제 로직 + 실제 Postgres로 그대로 실행한다.
 *
 * DATABASE_URL 등은 이 프로세스의 환경변수로 주입한다(로컬 검증용 Postgres를 가리키도록).
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const fakeKakaoVerify = jest.fn();
  const fakeGoogleVerify = jest.fn();

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KakaoTokenVerifier)
      .useValue({ verify: fakeKakaoVerify })
      .overrideProvider(GoogleTokenVerifier)
      .useValue({ verify: fakeGoogleVerify })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(globalValidationPipeOptions));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    // AuthController가 실제로 이 앱에 붙어 있는지(오버라이드가 컨트롤러까지 지워버리지 않았는지) 확인.
    expect(app.get(AuthController)).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "refresh_tokens", "social_accounts", "users" CASCADE');
    fakeKakaoVerify.mockReset();
    fakeGoogleVerify.mockReset();
  });

  it('처음 로그인하면 신규 유저를 만들고 토큰을 발급한다', async () => {
    fakeKakaoVerify.mockResolvedValue({ providerUid: 'kakao-e2e-1', email: 'e2e@test.com' });

    const res = await request(app.getHttpServer())
      .post('/auth/kakao/login')
      .send({ idToken: 'fake-kakao-token' })
      .expect(200);

    expect(res.body.isNewUser).toBe(true);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user.id).toEqual(expect.any(String));
  });

  it('같은 provider_uid로 다시 로그인하면 같은 유저로 로그인된다(isNewUser=false)', async () => {
    fakeGoogleVerify.mockResolvedValue({ providerUid: 'google-e2e-1', email: null });

    const first = await request(app.getHttpServer())
      .post('/auth/google/login')
      .send({ idToken: 'fake-google-token' })
      .expect(200);
    const second = await request(app.getHttpServer())
      .post('/auth/google/login')
      .send({ idToken: 'fake-google-token' })
      .expect(200);

    expect(first.body.isNewUser).toBe(true);
    expect(second.body.isNewUser).toBe(false);
    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it('idToken 없이 로그인하면 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer()).post('/auth/kakao/login').send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('지원하지 않는 provider(apple)면 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/apple/login')
      .send({ idToken: 'x' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refresh는 rotation되고, 이미 회전된 토큰을 재사용하면 401(재사용 탐지로 전체 세션 무효화)', async () => {
    fakeKakaoVerify.mockResolvedValue({ providerUid: 'kakao-e2e-2', email: null });
    const login = await request(app.getHttpServer())
      .post('/auth/kakao/login')
      .send({ idToken: 'fake-token' })
      .expect(200);
    const firstRefreshToken = login.body.refreshToken;

    const refreshed = await request(app.getHttpServer())
      .post('/auth/token/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(firstRefreshToken);

    const reused = await request(app.getHttpServer())
      .post('/auth/token/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(401);
    expect(reused.body.error.code).toBe('TOKEN_INVALID');

    // 재사용 탐지로 해당 유저의 전체 세션이 무효화됐으므로, 방금 정상 발급된 두 번째 refreshToken도 막힌다.
    const secondBlocked = await request(app.getHttpServer())
      .post('/auth/token/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
    expect(secondBlocked.body.error.code).toBe('TOKEN_INVALID');
  });

  it('logout 후 그 refreshToken으로는 재발급받을 수 없다', async () => {
    fakeGoogleVerify.mockResolvedValue({ providerUid: 'google-e2e-2', email: null });
    const login = await request(app.getHttpServer())
      .post('/auth/google/login')
      .send({ idToken: 'fake-token' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    const res = await request(app.getHttpServer())
      .post('/auth/token/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });
});
