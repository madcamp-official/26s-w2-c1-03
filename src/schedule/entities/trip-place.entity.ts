import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';
import { Place } from '../../places/entities/place.entity';
import { User } from '../../users/entities/user.entity';

/**
 * 여행의 일자별(day_number) 장소 목록과 순서(order_in_day). place_id가 없으면
 * custom_name/custom_address로 사용자 직접 입력 장소를 표현한다(ERD 주석).
 */
@Entity('trip_places')
@Index(['tripId', 'dayNumber', 'orderInDay'])
export class TripPlace {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid')
  tripId: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column('uuid', { nullable: true })
  placeId: string | null;

  // 캐시된 장소가 나중에 정리되어도 이미 세운 계획 항목은 유지한다.
  @ManyToOne(() => Place, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'place_id' })
  place: Place | null;

  @Column({ type: 'int' })
  dayNumber: number;

  @Column({ type: 'int' })
  orderInDay: number;

  /** AI가 배정한 권장 방문 시각('HH:MM'). 수동 추가 항목 등 시간이 없으면 null. */
  @Column({ type: 'varchar', length: 5, nullable: true })
  startTime: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  customName: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  customAddress: string | null;

  @Column({ type: 'text', nullable: true })
  memo: string | null;

  @Column('uuid')
  addedBy: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'added_by' })
  addedByUser: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
