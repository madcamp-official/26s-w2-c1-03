import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Phase 4(Auth)의 JwtAuthGuard가 request.user를 채우기 전까지는 undefined다.
 * 이후 auth 모듈이 실제 페이로드 형태를 정의하면 이 타입을 그쪽에서 확장한다.
 */
export interface AuthenticatedUser {
  userId: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    const request = context.switchToHttp().getRequest();
    return request.user;
  },
);
