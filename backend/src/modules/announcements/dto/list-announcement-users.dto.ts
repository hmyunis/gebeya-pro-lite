import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListAnnouncementUsersDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  page?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  limit?: string;
}
