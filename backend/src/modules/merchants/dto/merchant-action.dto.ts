import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MerchantActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
