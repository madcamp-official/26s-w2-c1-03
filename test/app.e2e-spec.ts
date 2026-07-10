import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { globalValidationPipeOptions } from '../src/common/pipes/validation-pipe.options';

describe('App bootstrap (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(globalValidationPipeOptions));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health는 200과 상태 정보를 반환한다', async () => {
    const { body } = await request(app.getHttpServer()).get('/health').expect(200);
    expect(body).toEqual({ status: 'ok', service: 'trip-and-end-api' });
  });

  it('존재하지 않는 라우트는 표준 에러 포맷으로 404를 반환한다 (GlobalExceptionFilter 확인)', async () => {
    const { body } = await request(app.getHttpServer()).get('/does-not-exist').expect(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(typeof body.error.message).toBe('string');
  });
});
