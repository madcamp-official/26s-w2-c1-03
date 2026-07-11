import { HttpStatus } from '@nestjs/common';
import { ErrorCodeDefinition } from '../../common/exceptions/error-code';

/**
 * API 명세서 §1 "실패 처리" 표에 명시된 4개 코드.
 * USER_CANCELLED는 사실상 클라이언트 전용 상태다 — 사용자가 소셜 로그인 화면에서
 * 완료 전에 취소하면 백엔드로 요청 자체가 오지 않는다. 그래도 계약(contract)
 * 완결성을 위해 정의는 해두되, 백엔드가 실제로 이 코드를 던지는 경로는 없다.
 */
export const AuthErrorCode = {
  USER_CANCELLED: {
    code: 'USER_CANCELLED',
    status: HttpStatus.BAD_REQUEST,
    message: '사용자가 로그인을 취소했습니다.',
  },
  NETWORK_ERROR: {
    code: 'NETWORK_ERROR',
    status: HttpStatus.BAD_GATEWAY,
    message: '소셜 로그인 제공자와 통신에 실패했습니다.',
  },
  TOKEN_INVALID: {
    code: 'TOKEN_INVALID',
    status: HttpStatus.UNAUTHORIZED,
    message: '유효하지 않은 토큰입니다.',
  },
  PROVIDER_ERROR: {
    code: 'PROVIDER_ERROR',
    status: HttpStatus.BAD_GATEWAY,
    message: '소셜 로그인 제공자에서 오류가 발생했습니다.',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
