import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';
import { User } from '../../users/entities/user.entity';
import { RecordPhoto } from './record-photo.entity';

export enum TravelRecordStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

/**
 * 한 여행당 사용자 1인 1기록(동행자 각자 자신의 기록 작성 가능, ERD 주석).
 * API 명세서 §4 비공개 원칙: 작성자 본인만 조회/수정/삭제 가능.
 */
@Entity('travel_records')
@Index(['tripId', 'userId'], { unique: true })
export class TravelRecord {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid')
  tripId: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 100, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 20, default: TravelRecordStatus.DRAFT })
  status: TravelRecordStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => RecordPhoto, (photo) => photo.record)
  photos: RecordPhoto[];
}
