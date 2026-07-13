import { HttpStatus } from '@nestjs/common';
import { ErrorCodeDefinition } from '../../common/exceptions/error-code';

export const ScheduleErrorCode = {
  /** selectedPlaceIds 중 존재하지 않는(또는 조회 불가한) place가 섞여 있음. */
  SELECTED_PLACES_INVALID: {
    code: 'SELECTED_PLACES_INVALID',
    status: HttpStatus.BAD_REQUEST,
    message: '선택한 장소 중 존재하지 않는 장소가 있습니다.',
  },
  /** 수동 추가/이동 입력 오류 — placeId·customName 중 정확히 하나가 아니거나 dayNumber가 여행 일수 밖. */
  SCHEDULE_PLACE_INPUT_INVALID: {
    code: 'SCHEDULE_PLACE_INPUT_INVALID',
    status: HttpStatus.BAD_REQUEST,
    message: '장소 추가/이동 입력이 올바르지 않습니다.',
  },
  /** tripPlaceId가 해당 트립의 스케줄에 존재하지 않음. */
  TRIP_PLACE_NOT_FOUND: {
    code: 'TRIP_PLACE_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: '스케줄에서 해당 장소를 찾을 수 없습니다.',
  },
  /** OpenAI 호출 실패(네트워크/타임아웃/빈 응답/파싱 실패) — plan.md §9.4. */
  OPENAI_REQUEST_FAILED: {
    code: 'OPENAI_REQUEST_FAILED',
    status: HttpStatus.BAD_GATEWAY,
    message: 'AI 여행 계획 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;
