import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, SocialAccount, UserDevice])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [TypeOrmModule],
})
export class UsersModule {}
