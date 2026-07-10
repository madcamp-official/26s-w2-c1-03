import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { SocialAccount } from './entities/social-account.entity';
import { UserDevice } from './entities/user-device.entity';

/**
 * Phase 3 시점에는 Entity/Repository만 노출한다. Controller/Service(회원가입,
 * 프로필 수정 등)는 Phase 5에서 추가된다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, SocialAccount, UserDevice])],
  exports: [TypeOrmModule],
})
export class UsersModule {}
