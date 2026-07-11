import { HttpStatus } from '@nestjs/common';
import { ErrorCodeDefinition } from '../../common/exceptions/error-code';

export const PlacesErrorCode = {
  PLACE_NOT_FOUND: {
    code: 'PLACE_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '장소를 찾을 수 없습니다.',
  },
  AREA_CODE_REQUIRED: {
    code: 'AREA_CODE_REQUIRED',
    status: HttpStatus.BAD_REQUEST,
    message: '여행에 지역 코드(areaCode)가 설정되어 있지 않아 후보를 조회할 수 없습니다.',
  },
  TOUR_API_REQUEST_FAILED: {
    code: 'TOUR_API_REQUEST_FAILED',
    status: HttpStatus.BAD_GATEWAY,
    message: 'TourAPI 요청에 실패했습니다.',
  },
  GOOGLE_PLACES_REQUEST_FAILED: {
    code: 'GOOGLE_PLACES_REQUEST_FAILED',
    status: HttpStatus.BAD_GATEWAY,
    message: 'Google Places 요청에 실패했습니다.',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
