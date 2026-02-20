import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../../../common/entities/abstract.entity';
import { AnnouncementRun } from './announcement-run.entity';

export enum AnnouncementDeliveryStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED_RETRYABLE = 'FAILED_RETRYABLE',
  FAILED_PERMANENT = 'FAILED_PERMANENT',
  UNKNOWN = 'UNKNOWN',
}

@Entity('announcement_deliveries')
@Index('idx_announcement_deliveries_run_status_nextAttemptAt', [
  'runId',
  'status',
  'nextAttemptAt',
])
@Index('idx_announcement_deliveries_run_lockExpiresAt', ['runId', 'lockExpiresAt'])
@Index('uq_announcement_deliveries_run_telegram', ['runId', 'telegramId'], {
  unique: true,
})
export class AnnouncementDelivery extends AbstractEntity {
  @ManyToOne(() => AnnouncementRun, (run) => run.deliveries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'runId' })
  run: AnnouncementRun;

  @Column({ type: 'int' })
  runId: number;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 64 })
  telegramId: string;

  @Column({
    type: 'enum',
    enum: AnnouncementDeliveryStatus,
    default: AnnouncementDeliveryStatus.PENDING,
  })
  status: AnnouncementDeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'datetime', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'bigint', nullable: true })
  telegramMessageId: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  lastError: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lockToken: string | null;

  @Column({ type: 'datetime', nullable: true })
  lockExpiresAt: Date | null;
}

