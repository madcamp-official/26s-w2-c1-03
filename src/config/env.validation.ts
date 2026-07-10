import * as Joi from 'joi';

/**
 * Phase 2 시점에는 서버 구동에 필요한 최소 항목만 검증한다.
 * DATABASE_URL, JWT 관련 값, OPENAI_API_KEY 등은 각 기능이 실제로 추가되는
 * Phase(3, 4, 8, 11 등)에서 이 스키마에 이어 붙인다.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('local', 'test', 'production').default('local'),
  PORT: Joi.number().port().default(3000),
});
