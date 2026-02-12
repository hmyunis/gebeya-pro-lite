import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { User, UserRole } from '../users/entities/user.entity';
import { TelegramLoginDto } from './dto/telegram-login.dto';
import { PasswordLoginDto } from './dto/password-login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  isValidLoginUsername,
  normalizeLoginUsername,
  verifyPassword,
} from './password-hash';

@Injectable()
export class AuthService {
  private readonly maxFailedPasswordLogins = 5;
  private readonly passwordLockDurationMs = 15 * 60 * 1000; // 15 minutes

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateAndLogin(data: TelegramLoginDto) {
    // 1. Verify Request Integrity
    this.verifyTelegramSignature(data);

    // 2. Find or Create User
    // We explicitly cast telegramId to string to match Entity definition
    let user = await this.userRepository.findOne({
      where: { telegramId: data.id.toString() },
    });

    const adminTelegramId =
      this.configService.get<string>('TELEGRAM_ADMIN_ID') ?? '';
    const isAdminTelegram =
      adminTelegramId.length > 0 && adminTelegramId === data.id.toString();

    if (!user) {
      user = this.userRepository.create({
        telegramId: data.id.toString(),
        firstName: data.first_name,
        username: data.username,
        avatarUrl: data.photo_url,
        role: isAdminTelegram ? UserRole.ADMIN : UserRole.MERCHANT,
      });
    } else {
      // Update info in case they changed it on Telegram
      user.firstName = data.first_name;
      user.username = data.username ?? '';
      user.avatarUrl = data.photo_url ?? '';
      if (isAdminTelegram && user.role !== UserRole.ADMIN) {
        user.role = UserRole.ADMIN;
      } else if (!isAdminTelegram && user.role !== UserRole.ADMIN) {
        user.role = UserRole.MERCHANT;
      }
    }

    let seededLoginUsername = false;
    if (!user.loginUsername && data.username) {
      const normalized = normalizeLoginUsername(data.username);
      if (isValidLoginUsername(normalized)) {
        const existing = await this.userRepository.findOne({
          where: { loginUsername: normalized },
        });
        if (!existing) {
          user.loginUsername = normalized;
          seededLoginUsername = true;
        }
      }
    }

    try {
      await this.userRepository.save(user);
    } catch (error) {
      const err = error as { code?: string; errno?: number };
      const isDup = err.code === 'ER_DUP_ENTRY' || err.errno === 1062;

      if (!seededLoginUsername || !isDup) {
        throw error;
      }

      user.loginUsername = null;
      await this.userRepository.save(user);
    }

    if (user.isBanned) {
      throw new UnauthorizedException('User is banned');
    }

    // 3. Generate JWT
    const payload = { sub: user.id, role: user.role };
    const token = this.jwtService.sign(payload);

    return { user, token };
  }

  async loginWithPassword(dto: PasswordLoginDto) {
    const pepper = this.configService.get<string>('PASSWORD_PEPPER') ?? '';
    const username = normalizeLoginUsername(dto.username);

    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect([
        'user.passwordHash',
        'user.passwordLoginFailedAttempts',
        'user.passwordLoginLockedUntil',
      ])
      .where('user.loginUsername = :username', { username })
      .getOne();

    if (!user) {
      await verifyPassword(dto.password, DUMMY_PASSWORD_HASH, pepper);
      throw new UnauthorizedException('Invalid username or password');
    }

    if (
      user.passwordLoginLockedUntil &&
      user.passwordLoginLockedUntil.getTime() > Date.now()
    ) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (user.isBanned) {
      throw new UnauthorizedException('User is banned');
    }

    if (user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException(
        'Only admins can set or use password authentication',
      );
    }

    const storedHash = user.passwordHash;
    const passwordOk = storedHash
      ? await verifyPassword(dto.password, storedHash, pepper)
      : await verifyPassword(dto.password, DUMMY_PASSWORD_HASH, pepper);

    if (!passwordOk) {
      user.passwordLoginFailedAttempts =
        (user.passwordLoginFailedAttempts ?? 0) + 1;

      if (user.passwordLoginFailedAttempts >= this.maxFailedPasswordLogins) {
        user.passwordLoginFailedAttempts = 0;
        user.passwordLoginLockedUntil = new Date(
          Date.now() + this.passwordLockDurationMs,
        );
      }

      await this.userRepository.save(user);
      throw new UnauthorizedException('Invalid username or password');
    }

    user.passwordLoginFailedAttempts = 0;
    user.passwordLoginLockedUntil = null;
    await this.userRepository.save(user);

    // Re-fetch without passwordHash (select: false) before returning.
    const safeUser = await this.userRepository.findOne({
      where: { id: user.id },
    });
    if (!safeUser) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const payload = { sub: safeUser.id, role: safeUser.role };
    const token = this.jwtService.sign(payload);

    return { user: safeUser, token };
  }

  async setPasswordForUser(userId: number, dto: SetPasswordDto) {
    const pepper = this.configService.get<string>('PASSWORD_PEPPER') ?? '';

    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid session');
    }

    if (user.isBanned) {
      throw new UnauthorizedException('User is banned');
    }

    if (user.passwordHash) {
      if (!dto.currentPassword) {
        throw new BadRequestException('currentPassword is required');
      }

      const currentOk = await verifyPassword(
        dto.currentPassword,
        user.passwordHash,
        pepper,
      );
      if (!currentOk) {
        throw new UnauthorizedException('Invalid current password');
      }

      const newMatchesOld = await verifyPassword(
        dto.newPassword,
        user.passwordHash,
        pepper,
      );
      if (newMatchesOld) {
        throw new BadRequestException(
          'newPassword must be different from current password',
        );
      }
    }

    let desiredUsername: string | null = user.loginUsername ?? null;
    if (dto.username) {
      desiredUsername = normalizeLoginUsername(dto.username);
    } else if (!desiredUsername) {
      const fallback = typeof user.username === 'string' ? user.username : '';
      if (fallback.trim()) {
        desiredUsername = normalizeLoginUsername(fallback);
      }
    }

    if (!desiredUsername || !isValidLoginUsername(desiredUsername)) {
      throw new BadRequestException(
        'A valid username is required to enable password login',
      );
    }

    if (desiredUsername !== user.loginUsername) {
      const existing = await this.userRepository.findOne({
        where: { loginUsername: desiredUsername },
      });
      if (existing && existing.id !== user.id) {
        throw new ConflictException('Username already in use');
      }
    }

    user.loginUsername = desiredUsername;
    user.passwordHash = await hashPassword(dto.newPassword, pepper);
    user.passwordLoginFailedAttempts = 0;
    user.passwordLoginLockedUntil = null;

    await this.userRepository.save(user);

    const safeUser = await this.userRepository.findOne({
      where: { id: user.id },
    });
    if (!safeUser) {
      throw new UnauthorizedException('Invalid session');
    }

    return { user: safeUser };
  }

  async linkTelegramToUser(userId: number, data: TelegramLoginDto) {
    this.verifyTelegramSignature(data);

    const adminTelegramId =
      this.configService.get<string>('TELEGRAM_ADMIN_ID') ?? '';
    const isAdminTelegram =
      adminTelegramId.length > 0 && adminTelegramId === data.id.toString();

    const existing = await this.userRepository.findOne({
      where: { telegramId: data.id.toString() },
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException('Telegram account is already linked');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Invalid session');
    }
    if (user.isBanned) {
      throw new UnauthorizedException('User is banned');
    }

    user.telegramId = data.id.toString();
    user.firstName = data.first_name;
    user.username = data.username ?? '';
    user.avatarUrl = data.photo_url ?? '';
    if (isAdminTelegram && user.role !== UserRole.ADMIN) {
      user.role = UserRole.ADMIN;
    }

    await this.userRepository.save(user);

    const safeUser = await this.userRepository.findOne({
      where: { id: user.id },
    });
    if (!safeUser) {
      throw new UnauthorizedException('Invalid session');
    }
    return { user: safeUser };
  }

  private verifyTelegramSignature(data: TelegramLoginDto) {
    const BOT_TOKEN =
      this.configService.get<string>('TELEGRAM_BOT_TOKEN') || '';

    // Check for replay attacks (5 min expiration)
    const now = Math.floor(Date.now() / 1000);
    if (now - data.auth_date > 300) {
      throw new UnauthorizedException(
        'Login session expired. Please try again.',
      );
    }

    // Create the Check String
    // Logic: Sort keys, remove 'hash', join with \n
    const checkString = Object.keys(data)
      .filter(
        (key) =>
          key !== 'hash' &&
          data[key as keyof TelegramLoginDto] !== undefined &&
          data[key as keyof TelegramLoginDto] !== null,
      )
      .sort()
      .map((key) => `${key}=${String(data[key as keyof TelegramLoginDto])}`)
      .join('\n');

    // Create Secret Key (SHA256 of Bot Token)
    const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();

    // Create HMAC
    const hmac = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    // Compare
    if (hmac !== data.hash) {
      throw new UnauthorizedException('Invalid Telegram hash');
    }
  }
}
