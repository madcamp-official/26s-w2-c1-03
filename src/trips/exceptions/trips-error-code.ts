import { HttpStatus } from '@nestjs/common';
import { ErrorCodeDefinition } from '../../common/exceptions/error-code';

export const TripsErrorCode = {
  TRIP_NOT_FOUND: {
    code: 'TRIP_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '여행을 찾을 수 없습니다.',
  },
  TRIP_FORBIDDEN: {
    code: 'TRIP_FORBIDDEN',
    status: HttpStatus.FORBIDDEN,
    message: '이 여행에 대한 권한이 없습니다.',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
