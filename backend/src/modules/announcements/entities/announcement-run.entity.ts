import { Column, Entity, Index, OneToMany } from 'typeorm';
import { AbstractEntity } from '../../../common/entities/abstract.entity';
import { AnnouncementDelivery } from './announcement-delivery.entity';

export enum AnnouncementTarget {
  ALL = 'all',
  USERS = 'users',
  BOT_SUBSCRIBERS = 'bot_subscribers',
  ACTIVE_BOT_SUBSCRIBERS = 'active_bot_subscribers',
}

export enum AnnouncementKind {
  ANNOUNCEMENT = 'announcement',
  NEWS = 'news',
  PROMOTION = 'promotion',
}

export enum AnnouncementRunStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  COMPLETED_WITH_ERRORS = 'COMPLETED_WITH_ERRORS',
  CANCELLED = 'CANCELLED',
}

@Entity('announcement_runs')
@Index('idx_announcement_runs_status_createdAt', ['status', 'createdAt'])
@Index('idx_announcement_runs_finishedAt', ['finishedAt'])
export class AnnouncementRun extends AbstractEntity {
  @Column({
    type: 'enum',
    enum: AnnouncementRunStatus,
    default: AnnouncementRunStatus.QUEUED,
  })
  status: AnnouncementRunStatus;

  @Column({
    type: 'enum',
    enum: AnnouncementTarget,
    default: AnnouncementTarget.ALL,
  })
  target: AnnouncementTarget;

  @Column({
    type: 'enum',
    enum: AnnouncementKind,
    default: AnnouncementKind.ANNOUNCEMENT,
  })
  kind: AnnouncementKind;

  @Column({ type: 'simple-json', nullable: true })
  targetUserIds: number[] | null;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'simple-json', nullable: true })
  imagePaths: string[] | null;

  @Column({ type: 'int', nullable: true })
  requestedByUserId: number | null;

  @Column({ type: 'int', default: 0 })
  totalRecipients: number;

  @Column({ type: 'int', default: 0 })
  pendingCount: number;

  @Column({ type: 'int', default: 0 })
  sentCount: number;

  @Column({ type: 'int', default: 0 })
  failedCount: number;

  @Column({ type: 'int', default: 0 })
  unknownCount: number;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastHeartbeatAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lockToken: string | null;

  @Column({ type: 'datetime', nullable: true })
  lockExpiresAt: Date | null;

  @OneToMany(() => AnnouncementDelivery, (delivery) => delivery.run)
  deliveries: AnnouncementDelivery[];
}
