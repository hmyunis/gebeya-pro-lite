import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Req,
  UseGuards,
  BadRequestException,
  ParseIntPipe,
  Query,
  Body,
} from '@nestjs/common';
import { type FastifyRequest } from 'fastify';
import { AdsService } from './ads.service';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';
import { CreateAdCommentDto } from './dto/create-ad-comment.dto';
import { UpdateAdCommentDto } from './dto/update-ad-comment.dto';
import { AuthGuard } from '@nestjs/passport';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  buildPaginationMeta,
  normalizePagination,
} from '../../common/pagination';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import {
  coerceMultipartFieldValue,
  getMultipartParts,
  getRequestBodyRecord,
  readMultipartFileToBuffer,
} from '../../common/multipart';
import { AdStatus } from './entities/ad.entity';
import { AdCommentsService } from './ad-comments.service';

type AuthenticatedRequest = FastifyRequest & {
  user: {
    userId: number;
    role: UserRole;
  };
};

const MAX_AD_IMAGES = 5;
const MAX_AD_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_FIELDS = 30;

@Controller('ads')
export class AdsController {
  constructor(
    private readonly adsService: AdsService,
    private readonly adCommentsService: AdCommentsService,
  ) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') query?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('status') status?: string,
  ) {
    const { page: safePage, limit: safeLimit } = normalizePagination(
      page,
      limit,
    );
    const filters = this.parseFilterParams(
      query,
      categoryIds,
      minPrice,
      maxPrice,
      status,
      false,
    );

    const { data, total, priceRanges } =
      await this.adsService.findFilteredPaginated(filters, safePage, safeLimit);
    return {
      data,
      meta: {
        ...buildPaginationMeta(total, safePage, safeLimit),
        priceRanges,
      },
    };
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MERCHANT)
  @Get('manage')
  async manageAds(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') query?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('scope') scope?: string,
    @Query('merchantId') merchantId?: string,
    @Query('status') status?: string,
  ) {
    const { page: safePage, limit: safeLimit } = normalizePagination(
      page,
      limit,
    );
    const filters = this.parseFilterParams(
      query,
      categoryIds,
      minPrice,
      maxPrice,
      status,
      true,
    );

    const scopedFilters: ReturnType<typeof this.parseFilterParams> & {
      includeInactive: boolean;
      merchantId?: number;
      merchantIdIsNull?: boolean;
      createdById?: number;
    } = {
      ...filters,
      includeInactive: true,
    };

    if (req.user.role === UserRole.MERCHANT) {
      scopedFilters.merchantId = req.user.userId;
    } else {
      const parsedScope = this.parseManageScope(scope);
      if (parsedScope === 'mine') {
        scopedFilters.createdById = req.user.userId;
        scopedFilters.merchantIdIsNull = true;
      } else if (parsedScope === 'merchant') {
        const parsedMerchantId = Number.parseInt(merchantId ?? '', 10);
        if (!Number.isFinite(parsedMerchantId) || parsedMerchantId <= 0) {
          throw new BadRequestException(
            'merchantId is required for merchant scope',
          );
        }
        scopedFilters.merchantId = parsedMerchantId;
      }
    }

    const { data, total, priceRanges } =
      await this.adsService.findFilteredPaginated(
        scopedFilters,
        safePage,
        safeLimit,
      );
    return {
      data,
      meta: {
        ...buildPaginationMeta(total, safePage, safeLimit),
        priceRanges,
      },
    };
  }

  @Get('filters')
  async filterOptions(
    @Query('q') query?: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('status') status?: string,
  ) {
    const parsedCategoryIds =
      categoryIds
        ?.split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value)) ?? [];

    return this.adsService.getFilterOptions({
      query,
      categoryIds: parsedCategoryIds,
      statuses: this.parseStatuses(status, false),
    });
  }

  @Get(':id/comments')
  async adComments(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { page: safePage, limit: safeLimit } = normalizePagination(
      page,
      limit,
    );
    return this.adCommentsService.getAdComments(id, {
      page: safePage,
      limit: safeLimit,
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id/comments/manage')
  async manageAdComments(@Param('id', ParseIntPipe) id: number) {
    return this.adCommentsService.getAdCommentsForAdmin(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/comments')
  async createOrUpdateComment(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAdCommentDto,
  ) {
    return this.adCommentsService.createOrUpdateAdComment(
      id,
      req.user.userId,
      dto,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/comments/:commentId')
  async editComment(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() dto: UpdateAdCommentDto,
  ) {
    return this.adCommentsService.editAdComment(
      id,
      req.user.userId,
      commentId,
      dto,
    );
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id/comments/:commentId')
  async removeComment(
    @Param('id', ParseIntPipe) id: number,
    @Param('commentId', ParseIntPipe) commentId: number,
  ) {
    return this.adCommentsService.removeAdComment(id, commentId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id/comments/:commentId/mine')
  async removeOwnComment(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('commentId', ParseIntPipe) commentId: number,
  ) {
    return this.adCommentsService.removeOwnAdComment(
      id,
      req.user.userId,
      commentId,
    );
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/comments/:commentId/block-reviewer')
  async blockCommentReviewer(
    @Param('id', ParseIntPipe) id: number,
    @Param('commentId', ParseIntPipe) commentId: number,
  ) {
    return this.adCommentsService.blockReviewerFromReviews(id, commentId);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/comments/:commentId/unblock-reviewer')
  async unblockCommentReviewer(
    @Param('id', ParseIntPipe) id: number,
    @Param('commentId', ParseIntPipe) commentId: number,
  ) {
    return this.adCommentsService.unblockReviewerFromReviews(id, commentId);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MERCHANT)
  @Get('dashboard-stats')
  async dashboardStats(@Req() req: AuthenticatedRequest) {
    return this.adsService.getDashboardStats(req.user.userId, req.user.role);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MERCHANT)
  @Post()
  async create(@Req() req: AuthenticatedRequest) {
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
          if (imageBuffers.length >= MAX_AD_IMAGES) {
            throw new BadRequestException(
              `You can upload at most ${MAX_AD_IMAGES} ad images`,
            );
          }

          const buffer = await readMultipartFileToBuffer(part, {
            maxBytes: MAX_AD_IMAGE_BYTES,
            allowedMimePrefixes: ['image/'],
            errorLabel: 'Ad image',
          });
          if (buffer.length > 0) {
            imageBuffers.push(buffer);
          }
        } else {
          fieldCount += 1;
          if (fieldCount > MAX_MULTIPART_FIELDS) {
            throw new BadRequestException('Too many multipart fields');
          }
          body[part.fieldname] = coerceMultipartFieldValue(
            part.value,
            part.fieldname,
          );
        }
      }
    } else {
      Object.assign(body, getRequestBodyRecord(req));
    }

    const dto = plainToInstance(CreateAdDto, body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    return this.adsService.create(dto, req.user, imageBuffers);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MERCHANT)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
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
          if (imageBuffers.length >= MAX_AD_IMAGES) {
            throw new BadRequestException(
              `You can upload at most ${MAX_AD_IMAGES} ad images`,
            );
          }

          const buffer = await readMultipartFileToBuffer(part, {
            maxBytes: MAX_AD_IMAGE_BYTES,
            allowedMimePrefixes: ['image/'],
            errorLabel: 'Ad image',
          });
          if (buffer.length > 0) {
            imageBuffers.push(buffer);
          }
        } else {
          fieldCount += 1;
          if (fieldCount > MAX_MULTIPART_FIELDS) {
            throw new BadRequestException('Too many multipart fields');
          }
          body[part.fieldname] = coerceMultipartFieldValue(
            part.value,
            part.fieldname,
          );
        }
      }
    } else {
      Object.assign(body, getRequestBodyRecord(req));
    }

    const dto = plainToInstance(UpdateAdDto, body);
    const errors = await validate(dto, { skipMissingProperties: true });
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    const retainedImageUrls = this.parseRetainedImageUrls(
      body.retainedImageUrls,
    );

    return this.adsService.update(
      id,
      dto,
      req.user,
      imageBuffers,
      retainedImageUrls,
    );
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/approve')
  async approve(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body('note') note?: string,
  ) {
    return this.adsService.approve(id, req.user.userId, note);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/reject')
  async reject(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body('note') note?: string,
  ) {
    return this.adsService.reject(id, req.user.userId, note);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MERCHANT)
  @Delete(':id')
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.adsService.remove(id, req.user);
    return { success: true };
  }

  private parseFilterParams(
    query?: string,
    categoryIds?: string,
    minPrice?: string,
    maxPrice?: string,
    status?: string,
    allowAllStatuses = false,
  ) {
    const parsedCategoryIds =
      categoryIds
        ?.split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value)) ?? [];

    let parsedMinPrice = Number.parseFloat(minPrice ?? '');
    let parsedMaxPrice = Number.parseFloat(maxPrice ?? '');
    const hasMinPrice = Number.isFinite(parsedMinPrice);
    const hasMaxPrice = Number.isFinite(parsedMaxPrice);

    if (hasMinPrice && hasMaxPrice && parsedMinPrice > parsedMaxPrice) {
      const temp = parsedMinPrice;
      parsedMinPrice = parsedMaxPrice;
      parsedMaxPrice = temp;
    }

    return {
      query,
      categoryIds: parsedCategoryIds,
      minPrice: hasMinPrice ? parsedMinPrice : undefined,
      maxPrice: hasMaxPrice ? parsedMaxPrice : undefined,
      statuses: this.parseStatuses(status, allowAllStatuses),
    };
  }

  private parseStatuses(
    statusRaw?: string,
    allowAllStatuses = false,
  ): AdStatus[] | undefined {
    const fallback = [AdStatus.APPROVED];
    if (!statusRaw || !statusRaw.trim()) {
      return allowAllStatuses ? undefined : fallback;
    }

    const unique = [
      ...new Set(
        statusRaw
          .split(',')
          .map((entry) => entry.trim().toUpperCase())
          .filter(Boolean),
      ),
    ];

    if (allowAllStatuses && unique.includes('ALL')) {
      return Object.values(AdStatus);
    }

    const parsed = unique.filter((entry): entry is AdStatus =>
      Object.values(AdStatus).includes(entry as AdStatus),
    );

    if (parsed.length === 0) {
      throw new BadRequestException('Invalid ad status filter');
    }
    return parsed;
  }

  private parseRetainedImageUrls(rawValue: unknown): string[] | undefined {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException(
        'retainedImageUrls must be a JSON array of image paths',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      throw new BadRequestException('retainedImageUrls must be valid JSON');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('retainedImageUrls must be an array');
    }

    const normalized = parsed
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);

    return [...new Set(normalized)];
  }

  private parseManageScope(scope?: string): 'all' | 'mine' | 'merchant' {
    const normalized = String(scope ?? 'all')
      .trim()
      .toLowerCase();
    if (
      normalized !== 'all' &&
      normalized !== 'mine' &&
      normalized !== 'merchant'
    ) {
      throw new BadRequestException('Invalid ads manage scope');
    }
    return normalized;
  }
}
