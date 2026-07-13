import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from './entities/user.entity';
import { SocialAccount } from './entities/social-account.entity';
import { UserDevice } from './entities/user-device.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * AuthModule이 User/SocialAccount 리포지토리 재사용을 위해 이 모듈을 import하므로,
 * 여기서 AuthModule을 다시 import하지 않는다(순환 참조 방지). UsersController는
 * JwtAuthGuard를 클래스 참조로만 가져와 쓴다 — 그 가드는 생성자 의존성이 없는
 * stateless guard라 AuthModule을 모듈 단위로 import하지 않아도 동작한다.
 *
 * RefreshToken은 AuthModule 소유 Entity이지만, 회원 탈퇴 시 남은 세션을 revoke하려면
 * 이 모듈에서도 리포지토리가 필요하다. AuthModule을 통째로 import하는 대신(순환 참조)
 * 같은 Entity를 여기서도 forFeature로 등록한다 — TypeORM은 여러 모듈이 같은 Entity를
 * 각자 등록해도 문제없이 동작한다(둘 다 같은 테이블을 가리키는 별개의 Repository 인스턴스).
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, SocialAccount, UserDevice, RefreshToken])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [TypeOrmModule],
})
export class UsersModule {}
