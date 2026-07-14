import * as Joi from 'joi';

/**
 * Phase 3(DB)에서 DATABASE_URL을 추가했다. Phase 4(Auth)에서 JWT/카카오/구글 값을
 * 추가한다. 애플 로그인은 이번 Phase 범위에서 제외했으므로 .env.example에 자리만
 * 있는 APPLE_* 값은 아직 이 스키마에 넣지 않는다. OPENAI_API_KEY 등 나머지는
 * 각 기능이 실제로 추가되는 Phase(8, 11 등)에서 이어 붙인다.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('local', 'test', 'production').default('local'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),

  // JWT — plan.md §8.1: access 30분 / refresh 30일, 서로 다른 시크릿 권장
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('30m'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  // 소셜 로그인 — 카카오/구글만(애플 제외)
  KAKAO_REST_API_KEY: Joi.string().required(),
  GOOGLE_CLIENT_ID: Joi.string().required(),

  // Phase 2(Common/Config) — main.ts가 실제로 읽어서 적용한다(§16). 미설정 시
  // 전체 origin 허용(로컬 개발 편의), 배포 전엔 실제 프론트 origin으로 채울 것.
  CORS_ORIGIN: Joi.string().optional(),

  // Phase 7(Place 후보 추천) — TourAPI(국내 전용, §areaCode2 확인 완료)
  TOUR_API_SERVICE_KEY: Joi.string().required(),
  TOUR_API_BASE_URL: Joi.string().uri().required(),
  // 관광지 집중률(방문 추이 예측) 빅데이터 서비스 — 같은 공공데이터포털 인증키를 쓰고
  // 서비스 경로만 다르다. 미설정 시 운영 엔드포인트를 기본값으로 사용한다.
  TOUR_API_BIGDATA_BASE_URL: Joi.string()
    .uri()
    .default('https://apis.data.go.kr/B551011/TatsCnctrRateService'),
  // 인기순 정렬용 평점/리뷰수 — Kakao 로컬 API는 이 데이터를 제공하지 않아(카카오 공식
  // 정책) Google Places API (New)로 대체했다.
  GOOGLE_PLACES_API_KEY: Joi.string().required(),

  // Phase 8(AI 여행 계획 생성) — OpenAI. Key는 환경변수로만 주입하고 코드/설정에
  // 하드코딩하지 않는다(plan.md §9.1). BASE_URL/MODEL은 미설정 시 공식 기본값을 쓴다.
  OPENAI_API_KEY: Joi.string().required(),
  OPENAI_BASE_URL: Joi.string().uri().default('https://api.openai.com/v1'),
  OPENAI_SCHEDULE_MODEL: Joi.string().default('gpt-4o-mini'),
  // Phase 11 curate(§3.3) — Vision 입력이 필요해 스케줄용 모델과 분리했다(같은 값이어도 됨).
  OPENAI_PHOTOS_MODEL: Joi.string().default('gpt-4o-mini'),

  // Phase 11(사진 파이프라인) — 로컬 디스크 임시 버퍼(pass-through) 경로와 TTL
  // 강제 삭제 주기(§6, §8.3: 사진 실물은 디스크/DB에 영구 기록하지 않는다).
  PHOTO_TEMP_BUFFER_DIR: Joi.string().default('./tmp/photo-buffer'),
  PHOTO_TEMP_BUFFER_TTL_MINUTES: Joi.number().positive().default(30),
});
