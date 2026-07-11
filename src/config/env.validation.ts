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
});
