import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';

export class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(1000)
  content: string;
}

/**
 * POST /trips/{tripId}/schedule/chat — 챗봇 스케줄 편집(Phase 9). 대화는 세션(프론트)
 * 한정이라 서버는 무상태이며, 매 호출마다 프론트가 전체 히스토리를 보낸다(system/tool
 * 메시지는 서버가 내부적으로만 구성해 왕복시키지 않는다).
 */
export class ChatScheduleDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];
}
