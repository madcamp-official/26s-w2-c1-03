import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { TravelRecord } from './travel-record.entity';

export enum RecordPhotoRefStatus {
  PENDING = 'pending',
  UPLOADED = 'uploaded',
  RECOMMENDED = 'recommended',
  DISCARDED = 'discarded',
}

/**
 * 사진 파이프라인의 임시 참조(API 명세서 §4 photos/metadata~finalize 구간).
 * 사진 실물은 여기 저장하지 않는다(로컬 임시 디스크 pass-through만, §8.3) — 이
 * 테이블은 텍스트 메타데이터와 진행 상태만 추적한다. finalize에서 최종 선택된
 * 것만 record_photos로 옮겨지고, 이 행 자체는(선택/미선택 관계없이) 폐기된다.
 */
@Entity('record_photo_refs')
@Index(['recordId', 'localId'], { unique: true })
export class RecordPhotoRef {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid')
  recordId: string;

  @ManyToOne(() => TravelRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'record_id' })
  record: TravelRecord;

  @Column({ type: 'varchar', length: 200 })
  localId: string;

  @Column({ type: 'timestamptz', nullable: true })
  takenAt: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  locationName: string | null;

  @Column({ type: 'varchar', length: 20, default: RecordPhotoRefStatus.PENDING })
  status: RecordPhotoRefStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
