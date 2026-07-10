import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { BusinessException } from '../exceptions/business-exception';
import { CommonErrorCode } from '../exceptions/error-code';

/**
 * API 명세서 §0 에러 포맷 { error: { code, message } }으로 모든 예외를 통일한다.
 * plan.md §12.1 매핑: BusinessException은 자체 코드, 그 외 HttpException(Validation/
 * 인증/인가/404 등)은 상태코드 기반 공통 코드, 나머지 미처리 예외는 500 + 스택은 로그로만.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof BusinessException) {
      response
        .status(exception.getStatus())
        .json({ error: { code: exception.code, message: exception.message } });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: { code: this.codeForStatus(status), message: this.messageOf(exception) },
      });
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: CommonErrorCode.INTERNAL_SERVER_ERROR.code,
        message: CommonErrorCode.INTERNAL_SERVER_ERROR.message,
      },
    });
  }

  private codeForStatus(status: HttpStatus): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return CommonErrorCode.VALIDATION_ERROR.code;
      case HttpStatus.UNAUTHORIZED:
        return CommonErrorCode.UNAUTHORIZED.code;
      case HttpStatus.FORBIDDEN:
        return CommonErrorCode.FORBIDDEN.code;
      case HttpStatus.NOT_FOUND:
        return CommonErrorCode.NOT_FOUND.code;
      case HttpStatus.CONFLICT:
        return CommonErrorCode.CONFLICT.code;
      default:
        return CommonErrorCode.INTERNAL_SERVER_ERROR.code;
    }
  }

  private messageOf(exception: HttpException): string {
    const body = exception.getResponse();
    if (typeof body === 'string') return body;
    const message = (body as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join(', ');
    return message ?? exception.message;
  }
}
