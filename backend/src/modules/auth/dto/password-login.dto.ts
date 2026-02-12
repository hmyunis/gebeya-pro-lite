import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class PasswordLoginDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^@?[A-Za-z0-9][A-Za-z0-9_.-]*$/, {
    message:
      'username may start with "@", and contain only letters, numbers, ".", "_", or "-"',
  })
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
