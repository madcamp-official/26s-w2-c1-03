import { ConfigService } from '@nestjs/config';

/**
 * OpenAI 연동 설정을 한 곳에서 읽어(plan.md §9.1 "API Key는 OPENAI_API_KEY 환경변수로
 * 주입하고 코드/설정에 하드코딩하지 않는다") 각 AI 클라이언트가 재사용한다. Phase 8은
 * 스케줄 생성만 쓰지만, Phase 11(사진 선별)도 같은 apiKey/baseUrl을 공유하게 된다.
 */
export interface OpenAiConfig {
  apiKey: string;
  baseUrl: string;
  scheduleModel: string;
}

export function loadOpenAiConfig(configService: ConfigService): OpenAiConfig {
  return {
    apiKey: configService.getOrThrow<string>('OPENAI_API_KEY'),
    baseUrl: configService.getOrThrow<string>('OPENAI_BASE_URL'),
    scheduleModel: configService.getOrThrow<string>('OPENAI_SCHEDULE_MODEL'),
  };
}
