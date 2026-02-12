import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities/abstract.entity';

@Entity('visitor_events')
export class VisitorEvent extends AbstractEntity {
  @Index('idx_visitor_events_visitorId')
  @Column({ type: 'varchar', length: 128 })
  visitorId: string;

  @Column({ type: 'varchar', length: 32, default: 'page_view' })
  eventType: string;

  @Index('idx_visitor_events_adId')
  @Column({ type: 'int', nullable: true })
  adId: number | null;

  @Index('idx_visitor_events_merchantId')
  @Column({ type: 'int', nullable: true })
  merchantId: number | null;

  @Index('idx_visitor_events_path')
  @Column({ type: 'varchar', length: 512 })
  path: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  referrer: string | null;

  @Index('idx_visitor_events_referrerHost')
  @Column({ type: 'varchar', length: 255, nullable: true })
  referrerHost: string | null;

  @Index('idx_visitor_events_countryCode')
  @Column({ type: 'char', length: 2, nullable: true })
  countryCode: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  region: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  timezone: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  language: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  ipHash: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({ default: false })
  isBot: boolean;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, string | number | boolean | null> | null;
}
