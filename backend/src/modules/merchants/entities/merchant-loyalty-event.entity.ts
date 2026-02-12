import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../../../common/entities/abstract.entity';
import { User } from '../../users/entities/user.entity';

@Entity('merchant_loyalty_events')
export class MerchantLoyaltyEvent extends AbstractEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchantId' })
  merchant: User;

  @Index('idx_merchant_loyalty_events_merchantId')
  @Column({ type: 'int' })
  merchantId: number;

  @Index('uq_merchant_loyalty_events_eventKey', { unique: true })
  @Column({ type: 'varchar', length: 191, nullable: true })
  eventKey: string | null;

  @Column({ type: 'varchar', length: 64 })
  eventType: string;

  @Column({ type: 'int' })
  pointsDelta: number;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, string | number | boolean | null> | null;
}
