import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

/** 알림 발송 대상 조회에 사용(§notifications). platform: ios/android. */
@Entity('user_devices')
export class UserDevice {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, (user) => user.devices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text' })
  pushToken: string;

  @Column({ type: 'varchar', length: 10 })
  platform: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // 자동 갱신 컬럼이 아니라, 디바이스가 실제로 활성 사용될 때 앱 레이어에서 명시적으로 갱신한다.
  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastActiveAt: Date;
}
