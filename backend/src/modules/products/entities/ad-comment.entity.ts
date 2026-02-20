import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { AbstractEntity } from '../../../common/entities/abstract.entity';
import { Ad } from './ad.entity';
import { User } from '../../users/entities/user.entity';

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

  @ManyToOne(() => AdComment, (comment) => comment.replies, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'parentId' })
  parent: AdComment | null;

  @Index('idx_ad_comments_parentId')
  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  @OneToMany(() => AdComment, (comment) => comment.parent)
  replies: AdComment[];

  @Column({ type: 'tinyint', unsigned: true, nullable: true })
  rating: number | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'tinyint', unsigned: true, default: 0 })
  depth: number;

  @Column({ default: false })
  isEdited: boolean;

  @Column({ type: 'datetime', nullable: true })
  editedAt: Date | null;
}
