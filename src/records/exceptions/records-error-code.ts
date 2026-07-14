import { HttpStatus } from '@nestjs/common';
import { ErrorCodeDefinition } from '../../common/exceptions/error-code';

export const RecordsErrorCode = {
  RECORD_NOT_FOUND: {
    code: 'RECORD_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '여행 기록을 찾을 수 없습니다.',
  },
  RECORD_FORBIDDEN: {
    code: 'RECORD_FORBIDDEN',
    status: HttpStatus.FORBIDDEN,
    message: '이 기록에 대한 권한이 없습니다.',
  },
  /** OpenAI 사진 선별 호출 실패(네트워크/타임아웃/빈 응답/파싱 실패) — curate() 내부에서
   *  잡아 최신순 폴백으로 대체하므로 이 코드가 컨트롤러까지 올라오는 일은 드물다. */
  PHOTO_AI_REQUEST_FAILED: {
    code: 'PHOTO_AI_REQUEST_FAILED',
    status: HttpStatus.BAD_GATEWAY,
    message: 'AI 사진 선별에 실패했습니다.',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
