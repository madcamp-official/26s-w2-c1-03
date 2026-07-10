import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { BusinessException } from '../exceptions/business-exception';
import { CommonErrorCode } from '../exceptions/error-code';

function createHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  it('BusinessException은 자체 code/message로 응답한다', () => {
    const { host, status, json } = createHost();
    const exception = new BusinessException(CommonErrorCode.CONFLICT, '이미 참여한 여행입니다.');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'CONFLICT', message: '이미 참여한 여행입니다.' },
    });
  });

  it('내장 HttpException(404)은 상태코드 기반 공통 코드로 매핑된다', () => {
    const { host, status, json } = createHost();
    filter.catch(new NotFoundException(), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Not Found' },
    });
  });

  it('ValidationPipe의 필드별 에러 메시지를 하나의 문자열로 합쳐 전달한다', () => {
    const { host, status, json } = createHost();
    filter.catch(
      new BadRequestException(['nickname must be shorter than 30', 'startDate must be a date']),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'nickname must be shorter than 30, startDate must be a date',
      },
    });
  });

  it('미처리 예외는 내부 정보 노출 없이 500으로 응답한다', () => {
    const { host, status, json } = createHost();
    filter.catch(new Error('db connection reset'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_SERVER_ERROR', message: '서버 내부 오류가 발생했습니다.' },
    });
  });
});
