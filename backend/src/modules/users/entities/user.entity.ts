import { Entity, Column, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities/abstract.entity';

export enum UserRole {
  ADMIN = 'admin',
  MERCHANT = 'merchant',
}

@Entity('users')
export class User extends AbstractEntity {
  // Telegram ID is unique and crucial for login
  @Index({ unique: true })
  @Column({ type: 'bigint', nullable: true })
  telegramId: string | null;

  // Optional username used for password-based login (case-insensitive; store normalized/lowercase)
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, nullable: true })
  loginUsername: string | null;

  // Password hash for local login. Never select by default.
  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash: string | null;

  @Column({ type: 'int', default: 0, select: false })
  passwordLoginFailedAttempts: number;

  @Column({ type: 'datetime', nullable: true, select: false })
  passwordLoginLockedUntil: Date | null;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  username: string; // Telegram handle (e.g., @john_doe)

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.MERCHANT,
  })
  role: UserRole;

  @Column({ default: false })
  isBanned: boolean;

  @Column({ default: false })
  isReviewBlocked: boolean;

  @Column({ type: 'int', default: 0 })
  loyaltyPoints: number;
}
