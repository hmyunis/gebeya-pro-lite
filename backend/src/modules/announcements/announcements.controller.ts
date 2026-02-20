import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import {
  buildPaginationMeta,
  normalizePagination,
} from '../../common/pagination';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import {
  AnnouncementDeliveryFilter,
  ListAnnouncementDeliveriesDto,
} from './dto/list-announcement-deliveries.dto';
import { ListAnnouncementUsersDto } from './dto/list-announcement-users.dto';
import {
  coerceMultipartFieldValue,
  getMultipartParts,
  getRequestBodyRecord,
  readMultipartFileToBuffer,
} from '../../common/multipart';

type AuthenticatedRequest = FastifyRequest & {
  user: {
    userId: number;
    role: UserRole;
  };
};

@Controller('announcements')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  private static readonly MAX_ANNOUNCEMENT_IMAGES = 3;
  private static readonly MAX_ANNOUNCEMENT_IMAGE_BYTES = 10 * 1024 * 1024;
  private static readonly MAX_MULTIPART_FIELDS = 30;

  @Post()
  async queueAnnouncement(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const body: Record<string, unknown> = {};
    const imageBuffers: Buffer[] = [];
    const contentType = String(req.headers['content-type'] ?? '');

    if (contentType.includes('multipart/form-data')) {
      const parts = getMultipartParts(req);
      if (!parts) {
        throw new BadRequestException('Invalid multipart request');
      }

      let fieldCount = 0;
      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname !== 'images') {
            throw new BadRequestException(
              'Announcement files must use the "images" field',
            );
          }
          if (
            imageBuffers.length >=
            AnnouncementsController.MAX_ANNOUNCEMENT_IMAGES
          ) {
            throw new BadRequestException(
              `You can upload at most ${AnnouncementsController.MAX_ANNOUNCEMENT_IMAGES} announcement images`,
            );
          }

          const buffer = await readMultipartFileToBuffer(part, {
            maxBytes: AnnouncementsController.MAX_ANNOUNCEMENT_IMAGE_BYTES,
            allowedMimePrefixes: ['image/'],
            errorLabel: 'Announcement image',
          });
          if (buffer.length > 0) {
            imageBuffers.push(buffer);
          }
          continue;
        }

        fieldCount += 1;
        if (fieldCount > AnnouncementsController.MAX_MULTIPART_FIELDS) {
          throw new BadRequestException('Too many multipart fields');
        }
        body[part.fieldname] = coerceMultipartFieldValue(
          part.value,
          part.fieldname,
        );
      }
    } else {
      Object.assign(body, getRequestBodyRecord(req));
    }

    const dto = plainToInstance(CreateAnnouncementDto, {
      ...body,
      userIds: this.parseUserIdsField(body.userIds),
    });
    const errors = await validate(dto);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    const parsedLimit = Number.parseInt(limit ?? '', 10);
    const take =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;
    const run = await this.announcementsService.queueAnnouncement({
      message: dto.message,
      kind: dto.kind,
      target: dto.target,
      targetUserIds: dto.userIds,
      requestedByUserId: req?.user?.userId,
      limit: take,
      imageBuffers,
    });

    return {
      runId: run.id,
      status: run.status,
      kind: run.kind,
      target: run.target,
      totalRecipients: run.totalRecipients,
      pendingCount: run.pendingCount,
    };
  }

  @Get('runs')
  async listRuns(@Query('page') page?: string, @Query('limit') limit?: string) {
    const { page: safePage, limit: safeLimit } = normalizePagination(
      page,
      limit,
    );
    const { data, total } = await this.announcementsService.listRuns(
      safePage,
      safeLimit,
    );
    return { data, meta: buildPaginationMeta(total, safePage, safeLimit) };
  }

  @Get('runs/:id')
  async getRun(@Param('id', ParseIntPipe) id: number) {
    return this.announcementsService.getRun(id);
  }

  @Get('runs/:id/deliveries')
  async listRunDeliveries(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListAnnouncementDeliveriesDto,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { page: safePage, limit: safeLimit } = normalizePagination(
      page,
      limit,
    );
    const { data, total } = await this.announcementsService.listRunDeliveries({
      runId: id,
      page: safePage,
      limit: safeLimit,
      filter: query.status ?? AnnouncementDeliveryFilter.ALL,
    });
    return { data, meta: buildPaginationMeta(total, safePage, safeLimit) };
  }

  @Post('runs/:id/cancel')
  async cancelRun(@Param('id', ParseIntPipe) id: number) {
    return this.announcementsService.cancelRun(id);
  }

  @Post('runs/:id/repost')
  async repostRun(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const run = await this.announcementsService.repostRun({
      runId: id,
      requestedByUserId: req?.user?.userId,
    });

    return {
      runId: run.id,
      status: run.status,
      kind: run.kind,
      target: run.target,
      totalRecipients: run.totalRecipients,
      pendingCount: run.pendingCount,
    };
  }

  @Delete('runs/:id')
  async deleteRun(@Param('id', ParseIntPipe) id: number) {
    return this.announcementsService.deleteRun(id);
  }

  @Post('runs/:id/requeue-unknown')
  async requeueUnknownDeliveries(@Param('id', ParseIntPipe) id: number) {
    return this.announcementsService.requeueUnknownDeliveries(id);
  }

  @Get('audience/users')
  async listAudienceUsers(
    @Query() query: ListAnnouncementUsersDto,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { page: safePage, limit: safeLimit } = normalizePagination(
      page,
      limit,
    );
    const { data, total } = await this.announcementsService.listAnnouncementUsers(
      {
        page: safePage,
        limit: safeLimit,
        search: query.search,
      },
    );
    return { data, meta: buildPaginationMeta(total, safePage, safeLimit) };
  }

  private parseUserIdsField(rawValue: unknown): number[] | undefined {
    if (Array.isArray(rawValue)) {
      return rawValue
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry));
    }
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }
    if (typeof rawValue === 'number') {
      return Number.isFinite(rawValue) ? [rawValue] : undefined;
    }
    if (typeof rawValue !== 'string') {
      return undefined;
    }

    const trimmed = rawValue.trim();
    if (!trimmed) return undefined;

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry));
      }
    } catch {
      // Fall back to comma-separated input parsing.
    }

    const fromCsv = trimmed
      .split(',')
      .map((entry) => Number.parseInt(entry.trim(), 10))
      .filter((entry) => Number.isFinite(entry));
    return fromCsv.length > 0 ? fromCsv : undefined;
  }
}
