import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AbstractEntity } from '../../../common/entities/abstract.entity';
import { Ad } from './ad.entity';
import { User } from '../../users/entities/user.entity';

@Unique('uq_ad_comments_adId_userId', ['adId', 'userId'])
@Entity('ad_comments')
export class AdComment extends AbstractEntity {
  @ManyToOne(() => Ad, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'adId' })
  ad: Ad;

  @Index('idx_ad_comments_adId')
  @Column({ type: 'int' })
  adId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index('idx_ad_comments_userId')
  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'tinyint', unsigned: true })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ default: false })
  isEdited: boolean;

  @Column({ type: 'datetime', nullable: true })
  editedAt: Date | null;
}
