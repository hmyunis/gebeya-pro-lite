import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../../../common/entities/abstract.entity';
import { User } from '../../users/entities/user.entity';

@Entity('merchant_activities')
export class MerchantActivity extends AbstractEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchantId' })
  merchant: User;

  @Index('idx_merchant_activities_merchantId')
  @Column({ type: 'int' })
  merchantId: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actorUserId' })
  actorUser: User | null;

  @Index('idx_merchant_activities_actorUserId')
  @Column({ type: 'int', nullable: true })
  actorUserId: number | null;

  @Column({ type: 'varchar', length: 64 })
  activityType: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', default: 0 })
  pointsDelta: number;

  @Column({ type: 'int', nullable: true })
  pointsBalanceAfter: number | null;

  @Index('uq_merchant_activities_eventKey', { unique: true })
  @Column({ type: 'varchar', length: 191, nullable: true })
  eventKey: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, string | number | boolean | null> | null;
}
