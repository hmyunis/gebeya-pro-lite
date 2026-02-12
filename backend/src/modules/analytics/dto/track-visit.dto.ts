import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class TrackVisitDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  visitorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  language?: string;

  @IsOptional()
  @IsString()
  @IsIn(['page_view', 'ad_preview', 'ad_click'])
  eventType?: 'page_view' | 'ad_preview' | 'ad_click';

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
