import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SocialAccount } from './social-account.entity';
import { UserDevice } from './user-device.entity';

export enum UserStatus {
  ACTIVE = 'active',
  WITHDRAWN = 'withdrawn',
}

@Entity('users')
export class User {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 30 })
  nickname: string;

  @Column({ type: 'text', nullable: true })
  profileImageUrl: string | null;

  @Column({ type: 'varchar', length: 20, default: UserStatus.ACTIVE })
  status: UserStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;

  @OneToMany(() => SocialAccount, (socialAccount) => socialAccount.user)
  socialAccounts: SocialAccount[];

  @OneToMany(() => UserDevice, (device) => device.user)
  devices: UserDevice[];
}
