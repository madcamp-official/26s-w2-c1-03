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
} as const satisfies Record<string, ErrorCodeDefinition>;
