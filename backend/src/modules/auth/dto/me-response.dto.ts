export class MeResponseDto {
  userId: number;
  role: string;
  firstName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  loginUsername?: string | null;
  hasTelegram?: boolean;
}
