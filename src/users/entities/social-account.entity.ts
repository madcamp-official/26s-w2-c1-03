import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum SocialProvider {
  KAKAO = 'kakao',
  APPLE = 'apple',
  GOOGLE = 'google',
}

/** 한 사용자가 여러 소셜 계정을 연결할 수 있는 구조로 확장 대비(ERD 주석). */
@Entity('social_accounts')
@Index(['provider', 'providerUid'], { unique: true })
export class SocialAccount {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, (user) => user.socialAccounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: SocialProvider, enumName: 'provider_type' })
  provider: SocialProvider;

  @Column({ type: 'varchar', length: 255 })
  providerUid: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
