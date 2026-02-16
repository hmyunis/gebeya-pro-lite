import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

export class VisitorEventsQueryDto {
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'from must use YYYY-MM-DD format',
  })
  from?: string;

  @IsOptional()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'to must use YYYY-MM-DD format',
  })
  to?: string;

  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  includeBots?: boolean;

  @IsOptional()
  @IsIn(['page_view', 'ad_preview', 'ad_click'])
  eventType?: 'page_view' | 'ad_preview' | 'ad_click';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Matches(POSITIVE_INTEGER_PATTERN, {
    message: 'page must be a positive integer',
  })
  page?: string;

  @IsOptional()
  @Matches(POSITIVE_INTEGER_PATTERN, {
    message: 'limit must be a positive integer',
  })
  limit?: string;

  @IsOptional()
  @Matches(POSITIVE_INTEGER_PATTERN, {
    message: 'merchantId must be a positive integer',
  })
  merchantId?: string;

  @IsOptional()
  @Matches(POSITIVE_INTEGER_PATTERN, {
    message: 'adId must be a positive integer',
  })
  adId?: string;
}
