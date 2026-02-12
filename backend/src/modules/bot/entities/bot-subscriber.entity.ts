import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities/abstract.entity';

@Entity('bot_subscribers')
@Index('idx_bot_subscribers_isActive', ['isActive'])
export class BotSubscriber extends AbstractEntity {
  @Index('idx_bot_subscribers_telegramId', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  telegramId: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 140, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 140, nullable: true })
  lastName: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastSeenAt: Date | null;
}
