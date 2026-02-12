import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  buildPaginationMeta,
  normalizePagination,
} from '../../common/pagination';
import { User, UserRole } from '../users/entities/user.entity';
import { Ad, AdStatus } from '../products/entities/ad.entity';
import { VisitorEvent } from '../analytics/entities/visitor-event.entity';
import { MerchantActivity } from './entities/merchant-activity.entity';
import { MerchantLoyaltyEvent } from './entities/merchant-loyalty-event.entity';
import { AdjustMerchantPointsDto } from './dto/adjust-merchant-points.dto';

const AD_PREVIEW_EVENT_TYPE = 'ad_preview';

type ActivityMetadata = Record<string, string | number | boolean | null>;

type MerchantAggregateStats = {
  totalAds: number;
  pendingAds: number;
  approvedAds: number;
  rejectedAds: number;
  totalViews: number;
  uniqueViewers: number;
  lastActivityAt: string | null;
};

type ApplyPointEventInput = {
  merchantId: number;
  eventKey?: string;
  eventType: string;
  activityType: string;
  title: string;
  description?: string | null;
  pointsDelta: number;
  actorUserId?: number | null;
  metadata?: ActivityMetadata;
};

type PointEventResult = {
  applied: boolean;
  pointsAfter: number;
  pointsDelta: number;
};

export const MerchantActivityType = {
  AD_POSTED: 'AD_POSTED',
  AD_UPDATED: 'AD_UPDATED',
  AD_APPROVED: 'AD_APPROVED',
  AD_REJECTED: 'AD_REJECTED',
  AD_REMOVED: 'AD_REMOVED',
  AD_VIEWED: 'AD_VIEWED',
  MERCHANT_BANNED: 'MERCHANT_BANNED',
  MERCHANT_UNBANNED: 'MERCHANT_UNBANNED',
  REVIEWS_BLOCKED: 'REVIEWS_BLOCKED',
  REVIEWS_UNBLOCKED: 'REVIEWS_UNBLOCKED',
  POINTS_ADJUSTED: 'POINTS_ADJUSTED',
} as const;

@Injectable()
export class MerchantsService {
  private readonly pointsPerAdPost: number;
  private readonly pointsPerAdView: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Ad)
    private readonly adRepo: Repository<Ad>,
    @InjectRepository(VisitorEvent)
    private readonly visitorEventRepo: Repository<VisitorEvent>,
    @InjectRepository(MerchantActivity)
    private readonly activityRepo: Repository<MerchantActivity>,
    @InjectRepository(MerchantLoyaltyEvent)
    private readonly loyaltyEventRepo: Repository<MerchantLoyaltyEvent>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    this.pointsPerAdPost = this.readPositiveIntConfig(
      'LOYALTY_POINTS_PER_AD_POST',
      10,
      500,
    );
    this.pointsPerAdView = this.readPositiveIntConfig(
      'LOYALTY_POINTS_PER_AD_VIEW',
      1,
      50,
    );
  }

  async listMerchants(pageRaw?: string, limitRaw?: string, query?: string) {
    const { page, limit, skip } = normalizePagination(pageRaw, limitRaw);

    const merchantsQuery = this.userRepo
      .createQueryBuilder('user')
      .where('user.role = :role', { role: UserRole.MERCHANT })
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const normalizedQuery = query?.trim().toLowerCase() ?? '';
    if (normalizedQuery) {
      merchantsQuery.andWhere(
        `(
          LOWER(COALESCE(user.firstName, '')) LIKE :search
          OR LOWER(COALESCE(user.username, '')) LIKE :search
          OR LOWER(COALESCE(user.loginUsername, '')) LIKE :search
        )`,
        { search: `%${normalizedQuery}%` },
      );
    }

    const [merchants, total] = await merchantsQuery.getManyAndCount();
    const merchantIds = merchants.map((merchant) => merchant.id);
    const statsMap = await this.buildMerchantStatsMap(merchantIds);

    return {
      data: merchants.map((merchant) =>
        this.buildMerchantSummary(merchant, statsMap.get(merchant.id)),
      ),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async getMerchantDetails(merchantId: number) {
    const merchant = await this.ensureMerchant(merchantId);
    const statsMap = await this.buildMerchantStatsMap([merchantId]);
    const stats = statsMap.get(merchantId);

    const recentAds = await this.adRepo.find({
      where: { merchantId },
      select: {
        id: true,
        name: true,
        status: true,
        price: true,
        createdAt: true,
        updatedAt: true,
      },
      order: { createdAt: 'DESC' },
      take: 8,
    });

    return {
      merchant: this.buildMerchantSummary(merchant, stats),
      recentAds: recentAds.map((ad) => ({
        id: ad.id,
        name: ad.name,
        status: ad.status,
        price: Number(ad.price ?? 0),
        createdAt: ad.createdAt,
        updatedAt: ad.updatedAt,
      })),
      loyaltyConfig: {
        pointsPerAdPost: this.pointsPerAdPost,
        pointsPerAdView: this.pointsPerAdView,
      },
    };
  }

  async getMerchantActivities(
    merchantId: number,
    pageRaw?: string,
    limitRaw?: string,
  ) {
    await this.ensureMerchant(merchantId);
    const { page, limit } = normalizePagination(pageRaw, limitRaw);

    const [activities, total] = await this.activityRepo.findAndCount({
      where: { merchantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['actorUser'],
    });

    return {
      data: activities.map((activity) => ({
        id: activity.id,
        activityType: activity.activityType,
        title: activity.title,
        description: activity.description,
        pointsDelta: activity.pointsDelta,
        pointsBalanceAfter: activity.pointsBalanceAfter,
        metadata: activity.metadata,
        createdAt: activity.createdAt,
        actor:
          activity.actorUser && activity.actorUser.id
            ? {
                id: activity.actorUser.id,
                firstName: activity.actorUser.firstName,
                loginUsername: activity.actorUser.loginUsername,
                username: activity.actorUser.username,
              }
            : null,
      })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async setMerchantBanState(
    merchantId: number,
    nextValue: boolean,
    actorUserId: number,
    reason?: string,
  ) {
    const merchant = await this.ensureMerchant(merchantId);
    if (merchant.isBanned !== nextValue) {
      merchant.isBanned = nextValue;
      await this.userRepo.save(merchant);
    }

    await this.createActivity({
      merchantId,
      actorUserId,
      activityType: nextValue
        ? MerchantActivityType.MERCHANT_BANNED
        : MerchantActivityType.MERCHANT_UNBANNED,
      title: nextValue ? 'Merchant account banned' : 'Merchant account unbanned',
      description: reason?.trim() || null,
      metadata: {
        isBanned: nextValue,
      },
    });

    return {
      id: merchant.id,
      isBanned: merchant.isBanned,
    };
  }

  async setMerchantReviewBlockState(
    merchantId: number,
    nextValue: boolean,
    actorUserId: number,
    reason?: string,
  ) {
    const merchant = await this.ensureMerchant(merchantId);
    if (merchant.isReviewBlocked !== nextValue) {
      merchant.isReviewBlocked = nextValue;
      await this.userRepo.save(merchant);
    }

    await this.createActivity({
      merchantId,
      actorUserId,
      activityType: nextValue
        ? MerchantActivityType.REVIEWS_BLOCKED
        : MerchantActivityType.REVIEWS_UNBLOCKED,
      title: nextValue
        ? 'Merchant review access blocked'
        : 'Merchant review access restored',
      description: reason?.trim() || null,
      metadata: {
        isReviewBlocked: nextValue,
      },
    });

    return {
      id: merchant.id,
      isReviewBlocked: merchant.isReviewBlocked,
    };
  }

  async adjustMerchantPoints(
    merchantId: number,
    dto: AdjustMerchantPointsDto,
    actorUserId: number,
  ) {
    if (!Number.isInteger(dto.delta) || dto.delta === 0) {
      throw new BadRequestException('delta must be a non-zero integer');
    }

    const reason = dto.reason?.trim();
    return this.applyPointEvent({
      merchantId,
      eventType: MerchantActivityType.POINTS_ADJUSTED,
      activityType: MerchantActivityType.POINTS_ADJUSTED,
      title:
        dto.delta > 0 ? 'Manual loyalty point bonus' : 'Manual loyalty point deduction',
      description: reason || null,
      pointsDelta: dto.delta,
      actorUserId,
      metadata: {
        reason: reason ?? null,
        requestedDelta: dto.delta,
      },
    });
  }

  async awardPointsForAdPost(params: {
    merchantId: number;
    adId: number;
    adName: string;
    actorUserId?: number | null;
  }) {
    await this.applyPointEvent({
      merchantId: params.merchantId,
      eventKey: `ad-post:${params.merchantId}:${params.adId}`,
      eventType: MerchantActivityType.AD_POSTED,
      activityType: MerchantActivityType.AD_POSTED,
      title: `Posted ad: ${params.adName}`,
      pointsDelta: this.pointsPerAdPost,
      actorUserId: params.actorUserId ?? null,
      metadata: {
        adId: params.adId,
      },
    });
  }

  async awardPointsForAdView(params: {
    merchantId: number;
    adId: number;
    visitorId: string;
    occurredAt?: Date;
  }) {
    const dayKey = this.toUtcDayKey(params.occurredAt ?? new Date());

    await this.applyPointEvent({
      merchantId: params.merchantId,
      eventKey: `ad-view:${params.merchantId}:${params.adId}:${params.visitorId}:${dayKey}`,
      eventType: MerchantActivityType.AD_VIEWED,
      activityType: MerchantActivityType.AD_VIEWED,
      title: 'Received a unique product view',
      description: `Ad #${params.adId} received a new unique viewer`,
      pointsDelta: this.pointsPerAdView,
      metadata: {
        adId: params.adId,
        day: dayKey,
      },
    });
  }

  async recordAdUpdated(params: {
    merchantId: number | null;
    adId: number;
    adName: string;
    actorUserId?: number | null;
  }) {
    if (!params.merchantId) return;

    await this.createActivity({
      merchantId: params.merchantId,
      actorUserId: params.actorUserId ?? null,
      activityType: MerchantActivityType.AD_UPDATED,
      title: `Updated ad: ${params.adName}`,
      metadata: {
        adId: params.adId,
      },
    });
  }

  async recordAdApproved(params: {
    merchantId: number | null;
    adId: number;
    adName: string;
    actorUserId?: number | null;
  }) {
    if (!params.merchantId) return;

    await this.createActivity({
      merchantId: params.merchantId,
      actorUserId: params.actorUserId ?? null,
      activityType: MerchantActivityType.AD_APPROVED,
      title: `Ad approved: ${params.adName}`,
      metadata: {
        adId: params.adId,
      },
    });
  }

  async recordAdRejected(params: {
    merchantId: number | null;
    adId: number;
    adName: string;
    actorUserId?: number | null;
    note?: string | null;
  }) {
    if (!params.merchantId) return;

    await this.createActivity({
      merchantId: params.merchantId,
      actorUserId: params.actorUserId ?? null,
      activityType: MerchantActivityType.AD_REJECTED,
      title: `Ad rejected: ${params.adName}`,
      description: params.note?.trim() || null,
      metadata: {
        adId: params.adId,
      },
    });
  }

  async recordAdRemoved(params: {
    merchantId: number | null;
    adId: number;
    adName: string;
    actorUserId?: number | null;
  }) {
    if (!params.merchantId) return;

    await this.createActivity({
      merchantId: params.merchantId,
      actorUserId: params.actorUserId ?? null,
      activityType: MerchantActivityType.AD_REMOVED,
      title: `Ad removed: ${params.adName}`,
      metadata: {
        adId: params.adId,
      },
    });
  }

  async resolveAdMerchant(adId: number) {
    if (!Number.isInteger(adId) || adId <= 0) {
      return null;
    }

    const ad = await this.adRepo.findOne({
      where: { id: adId },
      select: { id: true, merchantId: true, status: true, isActive: true },
    });

    if (!ad?.merchantId) {
      return null;
    }

    return {
      adId: ad.id,
      merchantId: ad.merchantId,
      status: ad.status,
      isActive: ad.isActive,
    };
  }

  private async applyPointEvent(
    input: ApplyPointEventInput,
  ): Promise<PointEventResult> {
    return this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const merchant = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :merchantId', { merchantId: input.merchantId })
        .andWhere('user.role = :role', { role: UserRole.MERCHANT })
        .getOne();

      if (!merchant) {
        throw new NotFoundException('Merchant not found');
      }

      const currentPoints = Number(merchant.loyaltyPoints ?? 0);
      const pointsAfter = Math.max(0, currentPoints + input.pointsDelta);
      const effectiveDelta = pointsAfter - currentPoints;

      const eventRepo = manager.getRepository(MerchantLoyaltyEvent);
      try {
        await eventRepo.insert({
          merchantId: input.merchantId,
          eventKey: input.eventKey ?? null,
          eventType: input.eventType,
          pointsDelta: effectiveDelta,
          metadata: this.normalizeMetadata(input.metadata),
        });
      } catch (error) {
        if (input.eventKey && this.isDuplicateKeyError(error)) {
          return {
            applied: false,
            pointsAfter: currentPoints,
            pointsDelta: 0,
          };
        }
        throw error;
      }

      if (pointsAfter !== currentPoints) {
        merchant.loyaltyPoints = pointsAfter;
        await userRepo.save(merchant);
      }

      await manager.getRepository(MerchantActivity).insert({
        merchantId: input.merchantId,
        actorUserId: input.actorUserId ?? null,
        activityType: input.activityType,
        title: input.title,
        description: input.description?.trim() || null,
        pointsDelta: effectiveDelta,
        pointsBalanceAfter: pointsAfter,
        eventKey: input.eventKey ?? null,
        metadata: this.normalizeMetadata(input.metadata),
      });

      return {
        applied: true,
        pointsAfter,
        pointsDelta: effectiveDelta,
      };
    });
  }

  private async createActivity(input: {
    merchantId: number;
    actorUserId?: number | null;
    activityType: string;
    title: string;
    description?: string | null;
    metadata?: ActivityMetadata;
  }) {
    const merchant = await this.userRepo.findOne({
      where: { id: input.merchantId, role: UserRole.MERCHANT },
      select: { id: true, loyaltyPoints: true },
    });

    if (!merchant) {
      return;
    }

    await this.activityRepo.insert({
      merchantId: merchant.id,
      actorUserId: input.actorUserId ?? null,
      activityType: input.activityType,
      title: input.title,
      description: input.description?.trim() || null,
      pointsDelta: 0,
      pointsBalanceAfter: Number(merchant.loyaltyPoints ?? 0),
      eventKey: null,
      metadata: this.normalizeMetadata(input.metadata),
    });
  }

  private async ensureMerchant(merchantId: number) {
    const merchant = await this.userRepo.findOne({
      where: { id: merchantId, role: UserRole.MERCHANT },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return merchant;
  }

  private async buildMerchantStatsMap(merchantIds: number[]) {
    const statsMap = new Map<number, MerchantAggregateStats>();

    if (merchantIds.length === 0) {
      return statsMap;
    }

    const adStatsRows = await this.adRepo
      .createQueryBuilder('ad')
      .select('ad.merchantId', 'merchantId')
      .addSelect('COUNT(ad.id)', 'totalAds')
      .addSelect(
        `SUM(CASE WHEN ad.status = '${AdStatus.PENDING}' THEN 1 ELSE 0 END)`,
        'pendingAds',
      )
      .addSelect(
        `SUM(CASE WHEN ad.status = '${AdStatus.APPROVED}' THEN 1 ELSE 0 END)`,
        'approvedAds',
      )
      .addSelect(
        `SUM(CASE WHEN ad.status = '${AdStatus.REJECTED}' THEN 1 ELSE 0 END)`,
        'rejectedAds',
      )
      .where('ad.merchantId IN (:...merchantIds)', { merchantIds })
      .groupBy('ad.merchantId')
      .getRawMany<{
        merchantId: string;
        totalAds: string;
        pendingAds: string;
        approvedAds: string;
        rejectedAds: string;
      }>();

    const viewStatsRows = await this.visitorEventRepo
      .createQueryBuilder('event')
      .select('event.merchantId', 'merchantId')
      .addSelect('COUNT(event.id)', 'totalViews')
      .addSelect('COUNT(DISTINCT event.visitorId)', 'uniqueViewers')
      .where('event.eventType = :eventType', { eventType: AD_PREVIEW_EVENT_TYPE })
      .andWhere('event.merchantId IN (:...merchantIds)', { merchantIds })
      .groupBy('event.merchantId')
      .getRawMany<{
        merchantId: string;
        totalViews: string;
        uniqueViewers: string;
      }>();

    const activityRows = await this.activityRepo
      .createQueryBuilder('activity')
      .select('activity.merchantId', 'merchantId')
      .addSelect('MAX(activity.createdAt)', 'lastActivityAt')
      .where('activity.merchantId IN (:...merchantIds)', { merchantIds })
      .groupBy('activity.merchantId')
      .getRawMany<{
        merchantId: string;
        lastActivityAt: string | null;
      }>();

    for (const merchantId of merchantIds) {
      statsMap.set(merchantId, {
        totalAds: 0,
        pendingAds: 0,
        approvedAds: 0,
        rejectedAds: 0,
        totalViews: 0,
        uniqueViewers: 0,
        lastActivityAt: null,
      });
    }

    for (const row of adStatsRows) {
      const merchantId = Number.parseInt(row.merchantId, 10);
      const stats = statsMap.get(merchantId);
      if (!stats) continue;
      stats.totalAds = Number.parseInt(row.totalAds, 10) || 0;
      stats.pendingAds = Number.parseInt(row.pendingAds, 10) || 0;
      stats.approvedAds = Number.parseInt(row.approvedAds, 10) || 0;
      stats.rejectedAds = Number.parseInt(row.rejectedAds, 10) || 0;
    }

    for (const row of viewStatsRows) {
      const merchantId = Number.parseInt(row.merchantId, 10);
      const stats = statsMap.get(merchantId);
      if (!stats) continue;
      stats.totalViews = Number.parseInt(row.totalViews, 10) || 0;
      stats.uniqueViewers = Number.parseInt(row.uniqueViewers, 10) || 0;
    }

    for (const row of activityRows) {
      const merchantId = Number.parseInt(row.merchantId, 10);
      const stats = statsMap.get(merchantId);
      if (!stats) continue;
      stats.lastActivityAt = row.lastActivityAt;
    }

    return statsMap;
  }

  private buildMerchantSummary(
    merchant: User,
    stats?: MerchantAggregateStats,
  ) {
    return {
      id: merchant.id,
      firstName: merchant.firstName,
      username: merchant.username,
      loginUsername: merchant.loginUsername,
      avatarUrl: merchant.avatarUrl,
      isBanned: merchant.isBanned,
      isReviewBlocked: merchant.isReviewBlocked,
      loyaltyPoints: Number(merchant.loyaltyPoints ?? 0),
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
      stats: {
        totalAds: stats?.totalAds ?? 0,
        pendingAds: stats?.pendingAds ?? 0,
        approvedAds: stats?.approvedAds ?? 0,
        rejectedAds: stats?.rejectedAds ?? 0,
        totalViews: stats?.totalViews ?? 0,
        uniqueViewers: stats?.uniqueViewers ?? 0,
      },
      lastActivityAt: stats?.lastActivityAt ?? null,
    };
  }

  private normalizeMetadata(metadata?: ActivityMetadata) {
    if (!metadata) return null;

    const normalized: ActivityMetadata = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (!key.trim()) continue;
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        normalized[key.trim().slice(0, 60)] =
          typeof value === 'string' ? value.slice(0, 200) : value;
      }
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
  }

  private readPositiveIntConfig(
    key: string,
    fallback: number,
    max: number,
  ): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number.parseInt(raw ?? '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.min(parsed, max);
  }

  private toUtcDayKey(date: Date) {
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${date.getUTCDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isDuplicateKeyError(error: unknown) {
    const err = error as { code?: string; errno?: number };
    return err.code === 'ER_DUP_ENTRY' || err.errno === 1062;
  }
}
