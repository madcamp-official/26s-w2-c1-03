import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BusinessException } from '../common/exceptions/business-exception';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserDevice } from './entities/user-device.entity';
import { User, UserStatus } from './entities/user.entity';
import { UsersErrorCode } from './exceptions/users-error-code';

export interface UserProfile {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
  createdAt: Date;
}

export interface DeviceSummary {
  id: string;
  platform: string;
  isActive: boolean;
  lastActiveAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(UserDevice) private readonly deviceRepository: Repository<UserDevice>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.findActiveUser(userId);
    return this.toProfile(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const user = await this.findActiveUser(userId);
    if (dto.nickname !== undefined) {
      user.nickname = dto.nickname;
    }
    if (dto.profileImageUrl !== undefined) {
      user.profileImageUrl = dto.profileImageUrl;
    }
    const saved = await this.userRepository.save(user);
    return this.toProfile(saved);
  }

  async withdraw(userId: string): Promise<void> {
    const user = await this.findActiveUser(userId);
    user.status = UserStatus.WITHDRAWN;
    user.withdrawnAt = new Date();
    await this.userRepository.save(user);
    // 탈퇴 후에도 만료 전까지 재발급 가능한 잔여 세션이 남지 않도록 미폐기 refresh
    // token을 전부 revoke한다(auth.service.ts의 재사용 탐지 시 전체 세션 무효화와 동일 패턴).
    await this.refreshTokenRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /**
   * user_devices에는 (user_id, push_token) unique 제약이 없어 upsert를 애플리케이션
   * 레벨에서 처리한다: 같은 유저·같은 토큰으로 다시 호출하면 기존 행을 갱신(재활성화)하고,
   * 처음 보는 토큰이면 새로 만든다.
   */
  async registerDevice(userId: string, dto: RegisterDeviceDto): Promise<DeviceSummary> {
    const existing = await this.deviceRepository.findOneBy({ userId, pushToken: dto.pushToken });
    const device = existing ?? this.deviceRepository.create({ userId, pushToken: dto.pushToken });

    device.platform = dto.platform;
    device.isActive = true;
    device.lastActiveAt = new Date();

    const saved = await this.deviceRepository.save(device);
    return this.toDeviceSummary(saved);
  }

  async deactivateDevice(userId: string, deviceId: string): Promise<void> {
    const device = await this.deviceRepository.findOneBy({ id: deviceId, userId });
    if (!device) {
      throw new BusinessException(UsersErrorCode.DEVICE_NOT_FOUND);
    }
    device.isActive = false;
    await this.deviceRepository.save(device);
  }

  private async findActiveUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user || user.status === UserStatus.WITHDRAWN) {
      throw new BusinessException(UsersErrorCode.USER_NOT_FOUND);
    }
    return user;
  }

  private toProfile(user: User): UserProfile {
    return {
      id: user.id,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl,
      createdAt: user.createdAt,
    };
  }

  private toDeviceSummary(device: UserDevice): DeviceSummary {
    return {
      id: device.id,
      platform: device.platform,
      isActive: device.isActive,
      lastActiveAt: device.lastActiveAt,
    };
  }
}
