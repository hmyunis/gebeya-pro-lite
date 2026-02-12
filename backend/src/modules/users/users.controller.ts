import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { type FastifyRequest } from 'fastify';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AvatarImageService } from './avatar-image.service';
import {
  assertMultipartRequest,
  getMultipartParts,
  readMultipartFileToBuffer,
} from '../../common/multipart';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

type AuthenticatedRequest = FastifyRequest & {
  user: {
    userId: number;
  };
};

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly avatarImageService: AvatarImageService,
  ) {}

  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    const user = await this.usersService.getMe(req.user.userId);
    return {
      id: user.id,
      role: user.role,
      firstName: user.firstName,
      avatarUrl: user.avatarUrl,
      loginUsername: user.loginUsername,
      telegramUsername: user.username,
      hasTelegram: Boolean(user.telegramId),
    };
  }

  @Patch('me')
  async updateMe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    const user = await this.usersService.updateMe(req.user.userId, dto);
    return {
      id: user.id,
      role: user.role,
      firstName: user.firstName,
      avatarUrl: user.avatarUrl,
      loginUsername: user.loginUsername,
      telegramUsername: user.username,
      hasTelegram: Boolean(user.telegramId),
    };
  }

  @Post('me/avatar')
  async updateAvatar(@Req() req: AuthenticatedRequest) {
    const avatar = await this.parseAvatarFile(req);
    const avatarUrl = await this.avatarImageService.optimizeAndSave(
      avatar.buffer,
    );
    const { user, previousAvatarUrl } = await this.usersService.updateAvatar(
      req.user.userId,
      avatarUrl,
    );

    await this.avatarImageService.deleteAvatar(previousAvatarUrl);

    return {
      id: user.id,
      role: user.role,
      firstName: user.firstName,
      avatarUrl: user.avatarUrl,
      loginUsername: user.loginUsername,
      telegramUsername: user.username,
      hasTelegram: Boolean(user.telegramId),
    };
  }

  private async parseAvatarFile(
    req: AuthenticatedRequest,
  ): Promise<{ buffer: Buffer; filename?: string }> {
    assertMultipartRequest(req);

    const parts = getMultipartParts(req);
    if (!parts) {
      throw new BadRequestException('Invalid multipart request');
    }

    let avatar: { buffer: Buffer; filename?: string } | undefined;
    let avatarCount = 0;
    for await (const part of parts) {
      if (part.type === 'file') {
        const fieldname = part.fieldname ?? '';
        if (fieldname !== 'avatar') {
          throw new BadRequestException(`Unexpected file field "${fieldname}"`);
        }

        avatarCount += 1;
        if (avatarCount > 1) {
          throw new BadRequestException('Only one avatar file is allowed');
        }

        const buffer = await readMultipartFileToBuffer(part, {
          maxBytes: MAX_AVATAR_BYTES,
          allowedMimePrefixes: ['image/'],
          errorLabel: 'Avatar',
        });
        if (buffer.length) {
          avatar = { buffer, filename: part.filename };
        }
      }
    }

    if (!avatar) {
      throw new BadRequestException('Avatar file is required');
    }

    return avatar;
  }
}
