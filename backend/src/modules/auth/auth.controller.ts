import {
  Controller,
  Post,
  Body,
  Res,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { TelegramLoginDto } from './dto/telegram-login.dto';
import { PasswordLoginDto } from './dto/password-login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { MeResponseDto } from './dto/me-response.dto';
import { getAuthCookieOptions } from '../../common/http/cookies';

type AuthenticatedRequest = FastifyRequest & {
  user: {
    userId: number;
    role: string;
  };
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Post('telegram')
  async login(
    @Body() telegramData: TelegramLoginDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { user, token } =
      await this.authService.validateAndLogin(telegramData);

    // Set HttpOnly Cookie
    res.setCookie('jwt', token, getAuthCookieOptions());

    return { user, token };
  }

  @Post('password')
  async loginWithPassword(
    @Body() dto: PasswordLoginDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { user, token } = await this.authService.loginWithPassword(dto);
    res.setCookie('jwt', token, getAuthCookieOptions());

    return { user, token };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('password/set')
  async setPassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SetPasswordDto,
  ) {
    return this.authService.setPasswordForUser(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('telegram/link')
  async linkTelegram(
    @Req() req: AuthenticatedRequest,
    @Body() telegramData: TelegramLoginDto,
  ) {
    return this.authService.linkTelegramToUser(req.user.userId, telegramData);
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: FastifyReply) {
    res.clearCookie('jwt', {
      ...getAuthCookieOptions(),
      maxAge: undefined,
    });
    return { message: 'Logged out' };
  }

  // Test Endpoint to verify Auth is working
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getProfile(@Req() req: AuthenticatedRequest): Promise<MeResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: req.user.userId },
    });
    if (!user) {
      return { userId: req.user.userId, role: req.user.role };
    }
    return {
      userId: user.id,
      role: user.role,
      firstName: user.firstName,
      username: user.username,
      avatarUrl: user.avatarUrl,
      loginUsername: user.loginUsername,
      hasTelegram: Boolean(user.telegramId),
    };
  }
}
