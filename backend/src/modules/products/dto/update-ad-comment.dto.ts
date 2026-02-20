import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAdCommentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return '';
    return value.trim();
  })
  comment: string;
}
