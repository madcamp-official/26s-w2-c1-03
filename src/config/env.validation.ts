import * as Joi from 'joi';

/**
 * Phase 3(DB)에서 DATABASE_URL을 추가했다. JWT/OPENAI_API_KEY 등 나머지 값은
 * 각 기능이 실제로 추가되는 Phase(4, 8, 11 등)에서 이 스키마에 이어 붙인다.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('local', 'test', 'production').default('local'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
});
