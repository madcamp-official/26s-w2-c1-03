import { HttpException } from '@nestjs/common';
import { ErrorCodeDefinition } from './error-code';

/**
 * 도메인 커스텀 예외의 공통 베이스. 각 도메인은 이 클래스를 그대로 쓰거나
 * 상속해 `TripNotFoundException` 같은 이름 있는 예외를 만든다.
 */
export class BusinessException extends HttpException {
  readonly code: string;

  constructor(errorCode: ErrorCodeDefinition, message?: string) {
    super(message ?? errorCode.message, errorCode.status);
    this.code = errorCode.code;
  }
}
