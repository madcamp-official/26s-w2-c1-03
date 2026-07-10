import { HttpStatus } from '@nestjs/common';

export interface ErrorCodeDefinition {
  readonly code: string;
  readonly status: HttpStatus;
  readonly message: string;
}

/**
 * 도메인에 속하지 않는 공통 에러 코드. 도메인별 에러(TRIP_NOT_FOUND 등)는
 * 각 도메인 모듈(trips/records/...)에서 이 타입을 따르는 자체 상수를 정의해
 * BusinessException에 넘긴다 — common은 형식만 강제하고 목록을 소유하지 않는다.
 */
export const CommonErrorCode = {
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    status: HttpStatus.BAD_REQUEST,
    message: '요청 값이 올바르지 않습니다.',
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    status: HttpStatus.UNAUTHORIZED,
    message: '인증이 필요합니다.',
  },
  FORBIDDEN: {
    code: 'FORBIDDEN',
    status: HttpStatus.FORBIDDEN,
    message: '접근 권한이 없습니다.',
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '요청한 리소스를 찾을 수 없습니다.',
  },
  CONFLICT: {
    code: 'CONFLICT',
    status: HttpStatus.CONFLICT,
    message: '이미 존재하거나 충돌하는 요청입니다.',
  },
  INTERNAL_SERVER_ERROR: {
    code: 'INTERNAL_SERVER_ERROR',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: '서버 내부 오류가 발생했습니다.',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
