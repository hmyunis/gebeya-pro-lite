import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdjustMerchantPointsDto {
  @IsInt()
  delta: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
