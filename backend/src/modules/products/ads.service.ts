import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import slugify from 'slugify';
import { Ad, AdStatus } from './entities/ad.entity';
import { Category } from './entities/category.entity';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';
import { ImageService } from './image.service';
import { User, UserRole } from '../users/entities/user.entity';
import { BotService } from '../bot/bot.service';
import { normalizeEthiopianPhoneNumberForStorage } from './phone-number.util';
import { MerchantsService } from '../merchants/merchants.service';

type AdFilters = {
  query?: string;
  categoryIds?: number[];
  minPrice?: number;
  maxPrice?: number;
  merchantId?: number | null;
  merchantIdIsNull?: boolean;
  createdById?: number;
  includeInactive?: boolean;
  statuses?: AdStatus[];
};

type StaffActor = {
  userId: number;
  role: UserRole;
};

const MAX_AD_IMAGES = 5;

@Injectable()
export class AdsService {
  constructor(
    @InjectRepository(Ad)
    private readonly adRepo: Repository<Ad>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly imageService: ImageService,
    private readonly botService: BotService,
    private readonly merchantsService: MerchantsService,
  ) {}

  async create(
    createAdDto: CreateAdDto,
    actor: StaffActor,
    imageBuffers: Buffer[] = [],
  ): Promise<Ad> {
    if (imageBuffers.length > MAX_AD_IMAGES) {
      throw new BadRequestException(
        `You can upload at most ${MAX_AD_IMAGES} ad images`,
      );
    }

    const imageUrls =
      imageBuffers.length > 0
        ? await this.imageService.optimizeAndSaveMany(imageBuffers)
        : [];

    const slug =
      slugify(createAdDto.name, { lower: true, strict: true }) +
      '-' +
      Date.now();

    const merchantId = await this.resolveMerchantId(
      actor,
      createAdDto.merchantId,
    );

    const adStatus =
      actor.role === UserRole.ADMIN
        ? (createAdDto.status ?? AdStatus.PENDING)
        : AdStatus.PENDING;

    const ad = this.adRepo.create({
      name: createAdDto.name,
      slug,
      description: createAdDto.description ?? '',
      price: Number(createAdDto.price ?? 0),
      imageUrl: imageUrls[0] ?? undefined,
      imageUrls: imageUrls.length > 0 ? imageUrls : null,
      isActive: createAdDto.isActive ?? true,
      categoryId: createAdDto.categoryId ?? null,
      merchantId,
      createdById: actor.userId,
      status: adStatus,
      address: createAdDto.address?.trim() || null,
      phoneNumber: normalizeEthiopianPhoneNumberForStorage(
        createAdDto.phoneNumber,
      ),
      itemDetails: createAdDto.itemDetails ?? null,
      moderationNote: null,
      approvedAt: adStatus === AdStatus.APPROVED ? new Date() : null,
      approvedById: adStatus === AdStatus.APPROVED ? actor.userId : null,
      isFeatured: false,
    });

    const saved = await this.adRepo.save(ad);
    if (saved.merchantId) {
      await this.merchantsService.awardPointsForAdPost({
        merchantId: saved.merchantId,
        adId: saved.id,
        adName: saved.name,
        actorUserId: actor.userId,
      });
    }
    if (saved.status === AdStatus.PENDING) {
      await this.notifyAdminAdSubmission(saved);
    }
    return this.findOne(saved.id);
  }

  private async notifyAdminAdSubmission(ad: Ad) {
    try {
      const adWithContext = await this.adRepo.findOne({
        where: { id: ad.id },
        relations: ['category', 'merchant', 'createdBy'],
      });
      const sourceAd = adWithContext ?? ad;
      const merchant = sourceAd.merchant ?? sourceAd.createdBy ?? null;

      await this.botService.notifyAdminAdSubmission({
        adId: sourceAd.id,
        title: sourceAd.name,
        description: sourceAd.description,
        price: sourceAd.price,
        phoneNumber: sourceAd.phoneNumber,
        address: sourceAd.address,
        categoryId: sourceAd.categoryId ?? null,
        categoryName: sourceAd.category?.name ?? null,
        merchantId: sourceAd.merchantId ?? null,
        merchantName: merchant?.firstName ?? null,
        merchantUsername: merchant?.username ?? null,
        merchantTelegramId: merchant?.telegramId ?? null,
        imagePaths: this.getAdImagePaths(sourceAd),
      });
    } catch {
      // Keep ad creation non-blocking if Telegram delivery fails.
    }
  }

  findAll(): Promise<Ad[]> {
    return this.adRepo.find({
      where: { status: AdStatus.APPROVED, isActive: true },
      order: { isFeatured: 'DESC', createdAt: 'DESC' },
      relations: ['category'],
    });
  }

  private applyFilters(qb: SelectQueryBuilder<Ad>, filters: AdFilters) {
    if (!filters.includeInactive) {
      qb.andWhere('ad.isActive = :isActive', { isActive: true });
    }

    if (filters.statuses && filters.statuses.length > 0) {
      qb.andWhere('ad.status IN (:...statuses)', {
        statuses: filters.statuses,
      });
    } else {
      qb.andWhere('ad.status = :defaultStatus', {
        defaultStatus: AdStatus.APPROVED,
      });
    }

    const normalizedQuery = filters.query?.trim().toLowerCase() ?? '';
    if (normalizedQuery.length > 0) {
      qb.andWhere(
        "(LOWER(ad.name) LIKE :q OR LOWER(COALESCE(ad.description, '')) LIKE :q)",
        { q: `%${normalizedQuery}%` },
      );
    }

    if (filters.categoryIds && filters.categoryIds.length > 0) {
      qb.andWhere('ad.categoryId IN (:...categoryIds)', {
        categoryIds: filters.categoryIds,
      });
    }

    if (typeof filters.minPrice === 'number') {
      qb.andWhere('ad.price >= :minPrice', { minPrice: filters.minPrice });
    }

    if (typeof filters.maxPrice === 'number') {
      qb.andWhere('ad.price <= :maxPrice', { maxPrice: filters.maxPrice });
    }

    if (typeof filters.merchantId === 'number') {
      qb.andWhere('ad.merchantId = :merchantId', {
        merchantId: filters.merchantId,
      });
    } else if (filters.merchantIdIsNull) {
      qb.andWhere('ad.merchantId IS NULL');
    }

    if (typeof filters.createdById === 'number') {
      qb.andWhere('ad.createdById = :createdById', {
        createdById: filters.createdById,
      });
    }
  }

  private buildPriceRanges(minRaw: unknown, maxRaw: unknown) {
    const min = Number(minRaw);
    const max = Number(maxRaw);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [];
    }

    if (min === max) {
      return [
        {
          id: 'range-1',
          min,
          max,
        },
      ];
    }

    const step = (max - min) / 5;
    return new Array(5).fill(0).map((_, idx) => {
      const start = idx === 0 ? min : min + step * idx;
      const end = idx === 4 ? max : min + step * (idx + 1);
      const roundedStart = Math.round(start);
      const roundedEnd = Math.round(end);
      return {
        id: `range-${idx + 1}`,
        min: roundedStart,
        max: roundedEnd,
      };
    });
  }

  async findFilteredPaginated(filters: AdFilters, page: number, limit: number) {
    const rangeQuery = this.adRepo
      .createQueryBuilder('ad')
      .leftJoin('ad.category', 'category')
      .select('MIN(ad.price)', 'min')
      .addSelect('MAX(ad.price)', 'max');

    this.applyFilters(rangeQuery, filters);

    const rangeRow = await rangeQuery.getRawOne<{
      min: string | number | null;
      max: string | number | null;
    }>();
    const priceRanges = this.buildPriceRanges(rangeRow?.min, rangeRow?.max);

    const query = this.adRepo
      .createQueryBuilder('ad')
      .leftJoinAndSelect('ad.category', 'category')
      .leftJoinAndSelect('ad.createdBy', 'createdBy')
      .orderBy('ad.isFeatured', 'DESC')
      .addOrderBy('ad.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    this.applyFilters(query, filters);

    const [data, total] = await query.getManyAndCount();
    return { data, total, priceRanges };
  }

  async getFilterOptions(filters: AdFilters) {
    const rangeQuery = this.adRepo
      .createQueryBuilder('ad')
      .select('MIN(ad.price)', 'min')
      .addSelect('MAX(ad.price)', 'max');

    this.applyFilters(rangeQuery, filters);

    const [rangeRow, categories] = await Promise.all([
      rangeQuery.getRawOne<{
        min: string | number | null;
        max: string | number | null;
      }>(),
      this.categoryRepo
        .createQueryBuilder('category')
        .loadRelationCountAndMap('category.productCount', 'category.ads')
        .orderBy('category.createdAt', 'DESC')
        .getMany(),
    ]);

    return {
      categories,
      priceRanges: this.buildPriceRanges(rangeRow?.min, rangeRow?.max),
    };
  }

  async findOne(id: number): Promise<Ad> {
    const ad = await this.adRepo.findOne({
      where: { id },
      relations: ['category', 'createdBy'],
    });
    if (!ad) {
      throw new NotFoundException('Ad not found');
    }
    return ad;
  }

  async update(
    id: number,
    updateAdDto: UpdateAdDto,
    actor: StaffActor,
    imageBuffers: Buffer[] = [],
    retainedImageUrls?: string[],
  ): Promise<Ad> {
    const ad = await this.adRepo.findOne({ where: { id } });
    if (!ad) {
      throw new NotFoundException('Ad not found');
    }

    const previousMerchantId = ad.merchantId;
    const previousAdName = ad.name;
    this.assertCanManageAd(ad, actor);

    if (imageBuffers.length > MAX_AD_IMAGES) {
      throw new BadRequestException(
        `You can upload at most ${MAX_AD_IMAGES} ad images`,
      );
    }

    if (imageBuffers.length > 0 || retainedImageUrls !== undefined) {
      const existingImagePaths = this.getAdImagePaths(ad);

      const baseRetainedImages =
        retainedImageUrls !== undefined
          ? this.sanitizeRetainedImageUrls(
              retainedImageUrls,
              existingImagePaths,
            )
          : imageBuffers.length > 0
            ? []
            : existingImagePaths;

      if (baseRetainedImages.length + imageBuffers.length > MAX_AD_IMAGES) {
        throw new BadRequestException(
          `You can upload at most ${MAX_AD_IMAGES} ad images`,
        );
      }

      const savedImageUrls =
        imageBuffers.length > 0
          ? await this.imageService.optimizeAndSaveMany(imageBuffers)
          : [];
      const nextImageUrls = [...baseRetainedImages, ...savedImageUrls];

      const removedImagePaths = existingImagePaths.filter(
        (path) => !nextImageUrls.includes(path),
      );
      if (removedImagePaths.length > 0) {
        await this.imageService.deleteImages(removedImagePaths);
      }

      ad.imageUrls = nextImageUrls.length > 0 ? nextImageUrls : null;
      ad.imageUrl = nextImageUrls[0] ?? undefined;
    }

    if (updateAdDto.name && updateAdDto.name !== ad.name) {
      ad.slug =
        slugify(updateAdDto.name, { lower: true, strict: true }) +
        '-' +
        Date.now();
    }

    if (actor.role === UserRole.MERCHANT && updateAdDto.status) {
      throw new BadRequestException(
        'Only admins can directly change ad approval status',
      );
    }

    const merchantTogglingVisibilityOnly =
      actor.role === UserRole.MERCHANT &&
      updateAdDto.isActive !== undefined &&
      updateAdDto.name === undefined &&
      updateAdDto.description === undefined &&
      updateAdDto.price === undefined &&
      updateAdDto.categoryId === undefined &&
      updateAdDto.address === undefined &&
      updateAdDto.phoneNumber === undefined &&
      updateAdDto.itemDetails === undefined &&
      imageBuffers.length === 0 &&
      retainedImageUrls === undefined;

    let nextMerchantId = ad.merchantId;
    if (actor.role === UserRole.ADMIN && updateAdDto.merchantId !== undefined) {
      nextMerchantId = await this.resolveMerchantId(
        actor,
        updateAdDto.merchantId,
      );
    }

    const definedUpdateDto = Object.fromEntries(
      Object.entries(updateAdDto as Record<string, unknown>).filter(
        ([, value]) => value !== undefined,
      ),
    ) as Partial<UpdateAdDto>;

    Object.assign(ad, {
      ...definedUpdateDto,
      merchantId: nextMerchantId,
      address:
        updateAdDto.address !== undefined
          ? updateAdDto.address?.trim() || null
          : ad.address,
      phoneNumber:
        updateAdDto.phoneNumber !== undefined
          ? normalizeEthiopianPhoneNumberForStorage(updateAdDto.phoneNumber)
          : ad.phoneNumber,
    });

    if (actor.role === UserRole.MERCHANT) {
      if (merchantTogglingVisibilityOnly) {
        if (ad.status !== AdStatus.APPROVED) {
          throw new BadRequestException(
            'Only approved ads can be toggled between published and draft',
          );
        }
      } else {
        ad.status = AdStatus.PENDING;
        ad.moderationNote = null;
        ad.approvedAt = null;
        ad.approvedById = null;
        await this.notifyAdminAdSubmission(ad);
      }
    } else if (actor.role === UserRole.ADMIN && updateAdDto.status) {
      if (updateAdDto.status === AdStatus.APPROVED) {
        ad.approvedAt = new Date();
        ad.approvedById = actor.userId;
        ad.moderationNote = updateAdDto.moderationNote ?? null;
      } else if (updateAdDto.status === AdStatus.REJECTED) {
        ad.approvedAt = null;
        ad.approvedById = null;
        ad.moderationNote = updateAdDto.moderationNote ?? null;
      }
    }

    const saved = await this.adRepo.save(ad);
    await this.merchantsService.recordAdUpdated({
      merchantId: saved.merchantId,
      adId: saved.id,
      adName: saved.name,
      actorUserId: actor.userId,
    });

    if (previousMerchantId && previousMerchantId !== saved.merchantId) {
      await this.merchantsService.recordAdUpdated({
        merchantId: previousMerchantId,
        adId: saved.id,
        adName: previousAdName,
        actorUserId: actor.userId,
      });
    }

    return saved;
  }

  async approve(id: number, adminUserId: number, note?: string) {
    const ad = await this.adRepo.findOne({ where: { id } });
    if (!ad) throw new NotFoundException('Ad not found');

    ad.status = AdStatus.APPROVED;
    ad.approvedById = adminUserId;
    ad.approvedAt = new Date();
    ad.moderationNote = note?.trim() || null;
    ad.isActive = true;

    const saved = await this.adRepo.save(ad);
    await this.merchantsService.recordAdApproved({
      merchantId: saved.merchantId,
      adId: saved.id,
      adName: saved.name,
      actorUserId: adminUserId,
    });
    await this.notifyMerchantAdModeration(saved, AdStatus.APPROVED);
    return saved;
  }

  async reject(id: number, adminUserId: number, note?: string) {
    const ad = await this.adRepo.findOne({ where: { id } });
    if (!ad) throw new NotFoundException('Ad not found');

    ad.status = AdStatus.REJECTED;
    ad.approvedById = adminUserId;
    ad.approvedAt = null;
    ad.moderationNote = note?.trim() || null;

    const saved = await this.adRepo.save(ad);
    await this.merchantsService.recordAdRejected({
      merchantId: saved.merchantId,
      adId: saved.id,
      adName: saved.name,
      actorUserId: adminUserId,
      note: saved.moderationNote,
    });
    await this.notifyMerchantAdModeration(saved, AdStatus.REJECTED);
    return saved;
  }

  async moderateFromTelegramAction(input: {
    adId: number;
    action: 'approve' | 'reject';
    adminTelegramId: string;
  }) {
    const adminTelegramId = String(input.adminTelegramId ?? '').trim();
    if (!adminTelegramId) {
      throw new BadRequestException('Missing Telegram admin identity');
    }

    const adminUser = await this.userRepo.findOne({
      where: {
        telegramId: adminTelegramId,
        role: UserRole.ADMIN,
      },
      select: { id: true },
    });

    if (!adminUser) {
      throw new BadRequestException(
        'Admin Telegram account is not linked to an admin profile',
      );
    }

    const existingAd = await this.adRepo.findOne({
      where: { id: input.adId },
      select: { id: true, status: true },
    });

    if (!existingAd) {
      throw new NotFoundException('Ad not found');
    }

    if (existingAd.status !== AdStatus.PENDING) {
      throw new BadRequestException(
        `Ad #${input.adId} is already ${existingAd.status}`,
      );
    }

    if (input.action === 'approve') {
      return this.approve(input.adId, adminUser.id);
    }
    return this.reject(input.adId, adminUser.id);
  }

  async getDashboardStats(userId: number, role: UserRole) {
    const query = this.adRepo.createQueryBuilder('ad');
    if (role === UserRole.MERCHANT) {
      query.where('ad.merchantId = :userId', { userId });
    }

    const rows = await query
      .select('ad.status', 'status')
      .addSelect('COUNT(ad.id)', 'count')
      .groupBy('ad.status')
      .getRawMany<{ status: AdStatus; count: string }>();

    const counts: Record<AdStatus, number> = {
      [AdStatus.PENDING]: 0,
      [AdStatus.APPROVED]: 0,
      [AdStatus.REJECTED]: 0,
    };
    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status] = Number.parseInt(row.count, 10) || 0;
      }
    }

    return {
      totalAds: Object.values(counts).reduce((sum, value) => sum + value, 0),
      pendingAds: counts[AdStatus.PENDING],
      approvedAds: counts[AdStatus.APPROVED],
      rejectedAds: counts[AdStatus.REJECTED],
    };
  }

  async remove(id: number, actor: StaffActor): Promise<void> {
    const ad = await this.adRepo.findOne({ where: { id } });
    if (!ad) {
      throw new NotFoundException('Ad not found');
    }
    this.assertCanManageAd(ad, actor);

    const imagePaths = this.getAdImagePaths(ad);
    if (imagePaths.length > 0) {
      await this.imageService.deleteImages(imagePaths);
    }

    await this.merchantsService.recordAdRemoved({
      merchantId: ad.merchantId,
      adId: ad.id,
      adName: ad.name,
      actorUserId: actor.userId,
    });

    await this.adRepo.remove(ad);
  }

  private getAdImagePaths(ad: Ad) {
    const paths = [
      ...(Array.isArray(ad.imageUrls) ? ad.imageUrls : []),
      ad.imageUrl,
    ];
    return [...new Set(paths.filter((path): path is string => Boolean(path)))];
  }

  private sanitizeRetainedImageUrls(
    retainedImageUrls: string[],
    existingImagePaths: string[],
  ) {
    const normalized = retainedImageUrls
      .map((path) => path.trim())
      .filter((path) => path.length > 0);
    const unique = [...new Set(normalized)];

    const invalidPaths = unique.filter(
      (path) => !existingImagePaths.includes(path),
    );
    if (invalidPaths.length > 0) {
      throw new BadRequestException(
        'One or more retained ad images are invalid',
      );
    }

    return unique;
  }

  private async notifyMerchantAdModeration(ad: Ad, status: AdStatus) {
    if (!ad.merchantId) {
      return;
    }

    try {
      const merchant = await this.userRepo.findOne({
        where: { id: ad.merchantId },
        select: {
          id: true,
          telegramId: true,
        },
      });

      if (!merchant?.telegramId) {
        return;
      }

      await this.botService.notifyMerchantAdModeration({
        telegramId: merchant.telegramId,
        adId: ad.id,
        adTitle: ad.name,
        status: status === AdStatus.APPROVED ? 'APPROVED' : 'REJECTED',
        note: ad.moderationNote,
      });
    } catch {
      // Keep moderation non-blocking if Telegram delivery fails.
    }
  }

  private async resolveMerchantId(
    actor: StaffActor,
    merchantIdRaw: number | null | undefined,
  ): Promise<number | null> {
    const merchantId =
      actor.role === UserRole.MERCHANT
        ? actor.userId
        : this.normalizeOptionalId(merchantIdRaw, 'merchantId');

    if (merchantId === null) {
      return null;
    }

    const merchant = await this.userRepo.findOne({
      where: { id: merchantId },
      select: { id: true, role: true },
    });
    if (!merchant || merchant.role !== UserRole.MERCHANT) {
      throw new BadRequestException('Selected merchant is invalid');
    }

    return merchantId;
  }

  private normalizeOptionalId(
    value: number | null | undefined,
    fieldName: string,
  ): number | null {
    if (value === undefined || value === null) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }
    return parsed;
  }

  private assertCanManageAd(ad: Ad, actor: StaffActor) {
    if (actor.role === UserRole.ADMIN) {
      return;
    }
    if (actor.role === UserRole.MERCHANT && ad.merchantId === actor.userId) {
      return;
    }
    throw new BadRequestException('You can only manage your own ads');
  }
}
