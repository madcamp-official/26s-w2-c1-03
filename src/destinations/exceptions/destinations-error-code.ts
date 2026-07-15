import { HttpStatus } from '@nestjs/common';
import { ErrorCodeDefinition } from '../../common/exceptions/error-code';

export const DestinationsErrorCode = {
  DESTINATION_NOT_FOUND: {
    code: 'DESTINATION_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '추천 여행지를 찾을 수 없습니다.',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
