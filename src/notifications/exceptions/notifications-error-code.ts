import { HttpStatus } from '@nestjs/common';
import { ErrorCodeDefinition } from '../../common/exceptions/error-code';

export const NotificationsErrorCode = {
  NOTIFICATION_NOT_FOUND: {
    code: 'NOTIFICATION_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '알림을 찾을 수 없습니다.',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
