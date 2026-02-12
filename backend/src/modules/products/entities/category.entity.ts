import { Entity, Column, OneToMany } from 'typeorm';
import { AbstractEntity } from '../../../common/entities/abstract.entity';
import { Ad } from './ad.entity';

export type CategoryDynamicField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean';
  required?: boolean;
  options?: string[];
};

@Entity('categories')
export class Category extends AbstractEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  thumbnailUrl?: string | null;

  @Column({ type: 'simple-json', nullable: true })
  dynamicFields?: CategoryDynamicField[] | null;

  @OneToMany(() => Ad, (ad) => ad.category)
  ads: Ad[];
}
