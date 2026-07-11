import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * API 명세서 §0 JWT 정책(rotation + 재사용 탐지)을 구현하기 위한 테이블.
 * ERD/마이그레이션(Phase 3)에는 없던 테이블로, Phase 4에서 새로 추가한다.
 *
 * - rotation: 리프레시 시 사용된 행에 revokedAt을 찍고 새 행을 발급한다(행 자체는 지우지 않음).
 * - 재사용 탐지: 제시된 토큰의 해시가 이미 revokedAt이 찍힌 행과 일치하면 "회전된 토큰의 재사용"으로
 *   간주해 해당 userId의 모든 미폐기 토큰을 revoke한다(스펙이 요구하는 건 세션 단위가 아니라
 *   "해당 유저의 전체 세션 무효화"이므로 family/세션 그룹 컬럼 없이 revokedAt만으로 충분하다).
 * - tokenHash: 원문 리프레시 토큰(고엔트로피 랜덤/서명된 JWT)의 SHA-256 해시(hex, 64자).
 *   비밀번호처럼 저엔트로피 값이 아니므로 bcrypt 같은 느린 해시가 아니라 빠른 암호학적 해시로 충분하다.
 */
@Entity('refresh_tokens')
@Index(['tokenHash'], { unique: true })
export class RefreshToken {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
