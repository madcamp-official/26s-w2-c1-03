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

/**
 * 최종 선택된 사진만 저장(storage_url). AI가 추천했으나 미선택된 사진은 이
 * 테이블에 없다(pass-through 처리, API 명세서 §4·§6). GPS 원본 좌표는 저장하지
 * 않고 지명(location_name)만 남긴다.
 */
@Entity('record_photos')
@Index(['recordId', 'orderIndex'])
export class RecordPhoto {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid')
  recordId: string;

  @ManyToOne(() => TravelRecord, (record) => record.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'record_id' })
  record: TravelRecord;

  @Column({ type: 'text' })
  storageUrl: string;

  @Column({ type: 'timestamptz', nullable: true })
  takenAt: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  locationName: string | null;

  @Column({ type: 'text', nullable: true })
  caption: string | null;

  @Column({ type: 'int', default: 0 })
  orderIndex: number;

  @Column({ type: 'boolean', default: false })
  isCover: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
