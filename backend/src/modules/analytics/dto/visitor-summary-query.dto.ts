import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, Matches } from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class VisitorSummaryQueryDto {
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
}
