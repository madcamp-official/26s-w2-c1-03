import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * request.user를 { userId }(AuthenticatedUser)로 채운다. 아직 이 가드로 보호할 실제
 * 비즈니스 라우트가 없어(그건 Phase 5부터) 여기서 전역 등록하지 않는다 — 이후 Phase가
 * 자신의 컨트롤러/라우트에 @UseGuards(JwtAuthGuard)로 개별 적용한다.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
