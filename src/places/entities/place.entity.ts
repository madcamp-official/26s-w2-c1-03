import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum PlaceSource {
  TOURAPI = 'tourapi',
  KAKAO = 'kakao',
  CUSTOM = 'custom',
}

/**
 * TourAPI/Kakao 응답을 캐싱하는 마스터 테이블(ERD 주석). 사용자가 직접 추가한
 * 장소는 source=custom이며 external_id가 없다(unique 인덱스는 NULL을 서로
 * 다른 값으로 취급하므로 custom 여러 건이 충돌하지 않는다).
 */
@Entity('places')
@Index(['source', 'externalId'], { unique: true })
@Index(['areaCode', 'sigunguCode'])
@Index(['latitude', 'longitude'])
export class Place {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column({
    type: 'enum',
    enum: PlaceSource,
    enumName: 'place_source',
    default: PlaceSource.TOURAPI,
  })
  source: PlaceSource;

  @Column({ type: 'varchar', length: 50, nullable: true })
  externalId: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  contentTypeId: string | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address: string | null;

  // TypeORM은 decimal을 정밀도 손실 방지를 위해 문자열로 반환한다.
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  areaCode: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  sigunguCode: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  categoryCode: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  tel: string | null;

  @Column({ type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'text', nullable: true })
  overview: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  syncedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
