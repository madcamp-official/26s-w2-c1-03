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
import { RecordPhoto } from './record-photo.entity';
import { TravelRecord } from './travel-record.entity';

/**
 * 기록을 Day별로 묶어 보여주는 다이어리 항목(record_id, date) 하나당 제목/본문/
 * 대표사진 하나씩. record_photos(사진 실물+캡션)와는 별개 테이블이다 — 사진은
 * 여러 장 올릴 수 있지만 Day 항목의 대표사진은 사용자가 그중 하나를 직접 고른다.
 */
@Entity('record_day_entries')
@Index(['recordId', 'date'], { unique: true })
export class RecordDayEntry {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid')
  recordId: string;

  @ManyToOne(() => TravelRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'record_id' })
  record: TravelRecord;

  /** 'YYYY-MM-DD' — trips.start_date/end_date와 같은 date 컬럼 관례(문자열로 취급). */
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'uuid', nullable: true })
  photoId: string | null;

  @ManyToOne(() => RecordPhoto, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'photo_id' })
  photo: RecordPhoto | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
