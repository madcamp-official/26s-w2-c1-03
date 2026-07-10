import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';
import { User } from '../../users/entities/user.entity';

/** AI 계획 생성/수정 요청 이력. 추후 개인화 추천 모델 학습 데이터로 활용 가능(ERD 주석). */
@Entity('ai_plan_requests')
export class AiPlanRequest {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid')
  tripId: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column('uuid')
  requestedBy: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by' })
  requester: User;

  @Column({ type: 'text' })
  promptText: string;

  @Column({ type: 'text', nullable: true })
  responseSummary: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
