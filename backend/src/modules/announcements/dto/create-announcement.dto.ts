import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  AnnouncementKind,
  AnnouncementTarget,
} from '../entities/announcement-run.entity';

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsEnum(AnnouncementKind)
  kind?: AnnouncementKind;

  @IsOptional()
  @IsEnum(AnnouncementTarget)
  target?: AnnouncementTarget;

  @ValidateIf(
    (dto: CreateAnnouncementDto) => dto.target === AnnouncementTarget.USERS,
  )
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5000)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  userIds?: number[];
}

