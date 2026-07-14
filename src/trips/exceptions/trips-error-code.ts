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
  INVITE_LINK_NOT_FOUND: {
    code: 'INVITE_LINK_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '유효하지 않은 초대 링크입니다.',
  },
  INVITE_LINK_EXPIRED: {
    code: 'INVITE_LINK_EXPIRED',
    status: HttpStatus.GONE,
    message: '만료된 초대 링크입니다.',
  },
  MEMBER_NOT_FOUND: {
    code: 'MEMBER_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '해당 참여자를 찾을 수 없습니다.',
  },
  LAST_OWNER_CANNOT_LEAVE: {
    code: 'LAST_OWNER_CANNOT_LEAVE',
    status: HttpStatus.CONFLICT,
    message: '여행의 마지막 owner는 역할을 내려놓거나 나갈 수 없습니다.',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
