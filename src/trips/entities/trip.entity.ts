import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { TripMember } from './trip-member.entity';
import { TripInviteLink } from './trip-invite-link.entity';

export enum TripStatus {
  PLANNING = 'planning',
  ONGOING = 'ongoing',
  COMPLETED = 'completed',
}

/** 여행 생성~기록까지 하나의 라이프사이클을 감싸는 최상위 엔티티(ERD 주석). */
@Entity('trips')
export class Trip {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid')
  ownerId: string;

  // 사용자는 soft delete만 하므로(users.status=withdrawn) RESTRICT로 방어한다.
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  @Column({ type: 'varchar', length: 100 })
  cityName: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  areaCode: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  sigunguCode: string | null;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({
    type: 'enum',
    enum: TripStatus,
    enumName: 'trip_status',
    default: TripStatus.PLANNING,
  })
  status: TripStatus;

  @Column({ type: 'text', nullable: true })
  coverImageUrl: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => TripMember, (member) => member.trip)
  members: TripMember[];

  @OneToMany(() => TripInviteLink, (link) => link.trip)
  inviteLinks: TripInviteLink[];
}
