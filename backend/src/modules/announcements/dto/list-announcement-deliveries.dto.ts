import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum AnnouncementDeliveryFilter {
  ALL = 'ALL',
  SENT = 'SENT',
  NOT_SENT = 'NOT_SENT',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
  PENDING = 'PENDING',
}

export class ListAnnouncementDeliveriesDto {
  @IsOptional()
  @IsEnum(AnnouncementDeliveryFilter)
  status?: AnnouncementDeliveryFilter;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  page?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  limit?: string;
}
