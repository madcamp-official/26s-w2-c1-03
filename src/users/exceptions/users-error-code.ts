import { HttpStatus } from '@nestjs/common';
import { ErrorCodeDefinition } from '../../common/exceptions/error-code';

export const UsersErrorCode = {
  USER_NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '사용자를 찾을 수 없습니다.',
  },
  DEVICE_NOT_FOUND: {
    code: 'DEVICE_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '등록된 기기를 찾을 수 없습니다.',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
