import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Trip } from '../../trips/entities/trip.entity';

export enum NotificationType {
  TRIP_END_REMINDER = 'trip_end_reminder',
  TRIP_INVITE = 'trip_invite',
}

@Entity('notification_logs')
export class NotificationLog {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column('uuid', { nullable: true })
  tripId: string | null;

  @ManyToOne(() => Trip, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip | null;

  @Column({ type: 'enum', enum: NotificationType, enumName: 'notification_type' })
  type: NotificationType;

  @CreateDateColumn({ type: 'timestamptz' })
  sentAt: Date;

  // 사용자가 알림을 클릭해 기록 작성을 시작한 시각(ERD 주석).
  @Column({ type: 'timestamptz', nullable: true })
  clickedAt: Date | null;
}
