import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '../../../common/entities/abstract.entity';
import { Category } from './category.entity';
import { User } from '../../users/entities/user.entity';

export enum AdStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('ads')
export class Ad extends AbstractEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'varchar', length: 512, nullable: true })
  imageUrl?: string;

  @Column({ type: 'simple-json', nullable: true })
  imageUrls?: string[] | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'enum', enum: AdStatus, default: AdStatus.PENDING })
  status: AdStatus;

  @Column({ type: 'varchar', length: 200, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'simple-json', nullable: true })
  itemDetails?: Record<string, unknown> | null;

  // Reserved for future paid pinning.
  @Column({ default: false })
  isFeatured: boolean;

  @Column({ type: 'text', nullable: true })
  moderationNote: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approvedById' })
  approvedBy: User | null;

  @Index('idx_ads_approvedById')
  @Column({ type: 'int', nullable: true })
  approvedById: number | null;

  @Column({ type: 'datetime', nullable: true })
  approvedAt: Date | null;

  @ManyToOne(() => Category, (category) => category.ads, {
    nullable: true,
  })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column({ type: 'int', nullable: true })
  categoryId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'merchantId' })
  merchant: User | null;

  @Index('idx_ads_merchantId')
  @Column({ type: 'int', nullable: true })
  merchantId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  @Index('idx_ads_createdById')
  @Column({ type: 'int', nullable: true })
  createdById: number | null;
}
