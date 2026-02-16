import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'crypto';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { TrackVisitDto } from './dto/track-visit.dto';
import { VisitorEvent } from './entities/visitor-event.entity';
import { Ad, AdStatus } from '../products/entities/ad.entity';
import { MerchantsService } from '../merchants/merchants.service';
import { buildPaginationMeta, normalizePagination } from '../../common/pagination';

export const VISITOR_COOKIE_NAME = 'gp_vid';
const ANALYTICS_SCHEMA_VERSION = 2;
const MAX_ANALYTICS_RANGE_DAYS = 93;
const ANALYTICS_QUERY_TIMEOUT_MS = 4500;
const AD_ENGAGEMENT_EVENT_TYPES = ['ad_preview', 'ad_click'] as const;
const SUPPORTED_DEVICE_TYPES = ['mobile', 'tablet', 'desktop', 'bot', 'unknown'] as const;
type SupportedDeviceType = (typeof SUPPORTED_DEVICE_TYPES)[number];

type VisitorSummaryOptions = {
  from?: string;
  to?: string;
  includeBots?: boolean;
};

type VisitorEventsOptions = VisitorSummaryOptions & {
  eventType?: 'page_view' | 'ad_preview' | 'ad_click';
  q?: string;
  page?: string;
  limit?: string;
  merchantId?: string;
  adId?: string;
};

type MerchantEngagementOptions = VisitorSummaryOptions & {
  merchantId?: string;
  adId?: string;
};

type MerchantEngagementScope = {
  from: Date;
  to: Date;
  includeBots: boolean;
  merchantId: number | null;
  adId: number | null;
};

type EventScopeFilters = {
  from?: Date;
  to?: Date;
  includeBots: boolean;
  merchantId?: number | null;
  adId?: number | null;
  eventType?: string | null;
};

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(VisitorEvent)
    private readonly visitorEventRepo: Repository<VisitorEvent>,
    @InjectRepository(Ad)
    private readonly adRepo: Repository<Ad>,
    private readonly configService: ConfigService,
    private readonly merchantsService: MerchantsService,
  ) {}

  async trackVisit(req: FastifyRequest, dto: TrackVisitDto) {
    const qualityFlags = new Set<string>();
    const cookieVisitorId = this.getVisitorIdFromCookie(req);
    const bodyVisitorId = this.normalizeVisitorId(dto.visitorId);
    const visitorId =
      cookieVisitorId ?? bodyVisitorId ?? randomUUID().replace(/-/g, '');
    const shouldSetCookie = cookieVisitorId === null;

    const path = this.normalizePath(dto.path);
    const referrer = this.normalizeUrl(dto.referrer, 1024);
    const referrerHost = this.extractHost(referrer);
    const timezone = this.normalizeText(dto.timezone, 80);
    const language = this.normalizeText(dto.language, 32);
    const ip = this.extractClientIp(req);
    const ipHash = this.hashIp(ip);
    const userAgent = this.normalizeText(this.getUserAgent(req), 512);
    const countryCode = this.extractCountryCode(req);
    const region = this.extractRegion(req);
    const city = this.extractCity(req);
    const eventType = dto.eventType ?? 'page_view';
    const schemaVersion = this.normalizeSchemaVersion(dto.schemaVersion, qualityFlags);
    const clientEventId = this.normalizeTrackingId(dto.eventId);
    const sessionId = this.normalizeTrackingId(dto.sessionId);
    const sentAt = this.parseClientTimestamp(dto.sentAt, qualityFlags);
    const adViewTarget = await this.resolveAdViewTarget(eventType, dto.metadata);
    if (
      (eventType === 'ad_preview' || eventType === 'ad_click') &&
      !adViewTarget
    ) {
      qualityFlags.add('missing_ad_identity');
    }
    if (!clientEventId) {
      qualityFlags.add('missing_event_id');
    }
    if (!sessionId) {
      qualityFlags.add('missing_session_id');
    }

    const sanitizedClientMetadata =
      this.normalizeMetadata(dto.metadata, {
        allowReservedKeys: false,
        maxEntries: 18,
      }) ?? {};
    const metadata = this.normalizeMetadata(
      {
        ...sanitizedClientMetadata,
        __sv: schemaVersion,
        ...(clientEventId ? { __ceid: clientEventId } : {}),
        ...(sessionId ? { __sid: sessionId } : {}),
        ...(sentAt ? { __sentAt: sentAt.toISOString() } : {}),
        ...(qualityFlags.size > 0
          ? { __dqFlags: Array.from(qualityFlags.values()).join(',') }
          : {}),
      },
      {
        allowReservedKeys: true,
        maxEntries: 30,
      },
    );
    const isBot = this.isBotTraffic(userAgent);
    const duplicate = await this.findRecentDuplicateEvent({
      visitorId,
      eventType,
      path,
      adId: adViewTarget?.adId ?? null,
      merchantId: adViewTarget?.merchantId ?? null,
      clientEventId,
    });
    if (duplicate) {
      qualityFlags.add('deduplicated');
      return {
        ok: true,
        visitorId,
        eventId: duplicate.id,
        shouldSetCookie,
        deduplicated: true,
        quality: {
          schemaVersion,
          flags: Array.from(qualityFlags.values()),
        },
      };
    }

    const event = this.visitorEventRepo.create({
      visitorId,
      eventType,
      path,
      referrer,
      referrerHost,
      timezone,
      language,
      ipHash,
      userAgent,
      countryCode,
      region,
      city,
      adId: adViewTarget?.adId ?? null,
      merchantId: adViewTarget?.merchantId ?? null,
      metadata,
      isBot,
    });

    const saved = await this.visitorEventRepo.save(event);
    if (eventType === 'ad_preview' && adViewTarget?.merchantId && !isBot) {
      try {
        await this.merchantsService.awardPointsForAdView({
          merchantId: adViewTarget.merchantId,
          adId: adViewTarget.adId,
          visitorId,
          occurredAt: saved.createdAt,
        });
      } catch {
        // Do not fail analytics ingestion if loyalty awarding fails.
      }
    }

    return {
      ok: true,
      visitorId,
      eventId: saved.id,
      shouldSetCookie,
      deduplicated: false,
      quality: {
        schemaVersion,
        flags: Array.from(qualityFlags.values()),
      },
    };
  }

  async getVisitorSummary(options: VisitorSummaryOptions) {
    const { from, to } = this.resolveRange(options.from, options.to);
    const includeBots = options.includeBots ?? false;

    const base = this.visitorEventRepo
      .createQueryBuilder('event')
      .where('event.createdAt BETWEEN :from AND :to', {
        from,
        to,
      });

    if (!includeBots) {
      base.andWhere('event.isBot = :isBot', { isBot: false });
    }

    const [
      totalVisits,
      uniqueVisitorsRow,
      byCountryRows,
      byReferrerRows,
      byDayRows,
    ] = await Promise.all([
      this.guardQuery(base.clone()).getCount(),
      this.guardQuery(
        base
          .clone()
          .select('COUNT(DISTINCT event.visitorId)', 'count'),
      ).getRawOne<{ count: string | null }>(),
      this.guardQuery(
        base
          .clone()
          .select("COALESCE(NULLIF(event.countryCode, ''), 'UNKNOWN')", 'country')
          .addSelect('COUNT(*)', 'visits')
          .addSelect('COUNT(DISTINCT event.visitorId)', 'uniqueVisitors')
          .groupBy("COALESCE(NULLIF(event.countryCode, ''), 'UNKNOWN')")
          .orderBy('visits', 'DESC')
          .limit(10),
      ).getRawMany<{
        country: string;
        visits: string;
        uniqueVisitors: string;
      }>(),
      this.guardQuery(
        base
          .clone()
          .select(
            "COALESCE(NULLIF(event.referrerHost, ''), 'direct')",
            'referrer',
          )
          .addSelect('COUNT(*)', 'visits')
          .addSelect('COUNT(DISTINCT event.visitorId)', 'uniqueVisitors')
          .groupBy("COALESCE(NULLIF(event.referrerHost, ''), 'direct')")
          .orderBy('visits', 'DESC')
          .limit(10),
      ).getRawMany<{
        referrer: string;
        visits: string;
        uniqueVisitors: string;
      }>(),
      this.guardQuery(
        base
          .clone()
          .select('DATE(event.createdAt)', 'date')
          .addSelect('COUNT(*)', 'visits')
          .addSelect('COUNT(DISTINCT event.visitorId)', 'uniqueVisitors')
          .groupBy('DATE(event.createdAt)')
          .orderBy('date', 'ASC'),
      ).getRawMany<{
        date: string;
        visits: string;
        uniqueVisitors: string;
      }>(),
    ]);

    return {
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      includeBots,
      totals: {
        visits: totalVisits,
        uniqueVisitors:
          Number.parseInt(uniqueVisitorsRow?.count ?? '0', 10) || 0,
      },
      byCountry: byCountryRows.map((row) => ({
        country: row.country,
        visits: Number.parseInt(row.visits, 10) || 0,
        uniqueVisitors: Number.parseInt(row.uniqueVisitors, 10) || 0,
      })),
      byReferrer: byReferrerRows.map((row) => ({
        referrer: row.referrer,
        visits: Number.parseInt(row.visits, 10) || 0,
        uniqueVisitors: Number.parseInt(row.uniqueVisitors, 10) || 0,
      })),
      byDay: byDayRows.map((row) => ({
        date: row.date,
        visits: Number.parseInt(row.visits, 10) || 0,
        uniqueVisitors: Number.parseInt(row.uniqueVisitors, 10) || 0,
      })),
    };
  }

  async getVisitorEvents(options: VisitorEventsOptions) {
    const { from, to } = this.resolveRange(options.from, options.to);
    const includeBots = options.includeBots ?? false;
    const eventType = this.normalizeText(options.eventType, 32);
    const search = this.normalizeSearchQuery(options.q);
    const merchantId = this.parseQueryPositiveInt(options.merchantId, 'merchantId');
    const adId = this.parseQueryPositiveInt(options.adId, 'adId');
    const pagination = normalizePagination(options.page, options.limit);

    const base = this.buildEventScopeQuery('event', {
      from,
      to,
      includeBots,
      eventType,
      merchantId,
      adId,
    });

    if (search) {
      const searchLike = `%${search.toLowerCase()}%`;
      base.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(event.path) LIKE :searchLike', { searchLike })
            .orWhere("LOWER(COALESCE(event.referrerHost, '')) LIKE :searchLike", {
              searchLike,
            })
            .orWhere(
              "LOWER(COALESCE(event.countryCode, '')) LIKE :searchLike",
              {
                searchLike,
              },
            )
            .orWhere('LOWER(event.visitorId) LIKE :searchLike', { searchLike })
            .orWhere("LOWER(COALESCE(event.city, '')) LIKE :searchLike", {
              searchLike,
            })
            .orWhere("LOWER(COALESCE(event.region, '')) LIKE :searchLike", {
              searchLike,
            });
        }),
      );
    }

    const [total, rows] = await Promise.all([
      this.guardQuery(base.clone()).getCount(),
      this.guardQuery(
        base
          .clone()
          .orderBy('event.createdAt', 'DESC')
          .skip(pagination.skip)
          .take(pagination.limit),
      ).getMany(),
    ]);
    const adLookup = await this.getAdLookup(rows.map((row) => row.adId));

    return {
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      includeBots,
      filters: {
        eventType: eventType ?? null,
        q: search ?? null,
        merchantId,
        adId,
      },
      data: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        visitorId: row.visitorId,
        eventType: row.eventType,
        path: row.path,
        referrer: row.referrer,
        referrerHost: row.referrerHost,
        countryCode: row.countryCode,
        region: row.region,
        city: row.city,
        timezone: row.timezone,
        language: row.language,
        userAgent: row.userAgent,
        adId: row.adId,
        merchantId: row.merchantId,
        adName: row.adId ? adLookup.get(row.adId)?.name ?? null : null,
        deviceType: this.resolveDeviceType(row.userAgent, row.isBot),
        metadata: row.metadata,
        isBot: row.isBot,
      })),
      meta: buildPaginationMeta(total, pagination.page, pagination.limit),
    };
  }

  async getMerchantEngagementOverview(options: MerchantEngagementOptions) {
    const scope = this.resolveMerchantEngagementScope(options);
    return this.fetchMerchantEngagementOverview(scope);
  }

  async getMerchantEngagementTimeline(options: MerchantEngagementOptions) {
    const scope = this.resolveMerchantEngagementScope(options);
    return this.fetchMerchantEngagementTimeline(scope);
  }

  async getMerchantEngagementTopProducts(options: MerchantEngagementOptions) {
    const scope = this.resolveMerchantEngagementScope(options);
    return this.fetchMerchantEngagementTopProducts(scope);
  }

  async getMerchantEngagementSegments(options: MerchantEngagementOptions) {
    const scope = this.resolveMerchantEngagementScope(options);
    return this.fetchMerchantEngagementSegments(scope);
  }

  async getMerchantEngagementDataQuality(options: MerchantEngagementOptions) {
    const scope = this.resolveMerchantEngagementScope(options);
    return this.fetchMerchantEngagementDataQuality(scope);
  }

  async getMerchantEngagementDashboard(options: MerchantEngagementOptions) {
    const scope = this.resolveMerchantEngagementScope(options);
    const [overview, timeline, topProducts, segments, dataQuality] = await Promise.all([
      this.fetchMerchantEngagementOverview(scope),
      this.fetchMerchantEngagementTimeline(scope),
      this.fetchMerchantEngagementTopProducts(scope),
      this.fetchMerchantEngagementSegments(scope),
      this.fetchMerchantEngagementDataQuality(scope),
    ]);

    return {
      ...this.buildMerchantEngagementEnvelope(scope),
      totals: overview.totals,
      funnel: overview.funnel,
      timeline: timeline.timeline,
      topProducts: topProducts.topProducts,
      segments: segments.segments,
      dataQuality: dataQuality.dataQuality,
    };
  }

  private async fetchMerchantEngagementOverview(scope: MerchantEngagementScope) {
    const scopedRange = this.buildEventScopeQuery('event', {
      from: scope.from,
      to: scope.to,
      includeBots: scope.includeBots,
      merchantId: scope.merchantId,
      adId: scope.adId,
    });

    const totalsRow = await this.guardQuery(
      scopedRange
        .clone()
        .select('COUNT(*)', 'totalEvents')
        .addSelect('COUNT(DISTINCT event.visitorId)', 'uniqueVisitors')
        .addSelect(
          "SUM(CASE WHEN event.eventType = 'ad_preview' THEN 1 ELSE 0 END)",
          'productViews',
        )
        .addSelect(
          "SUM(CASE WHEN event.eventType = 'ad_click' THEN 1 ELSE 0 END)",
          'productClicks',
        )
        .addSelect(
          "COUNT(DISTINCT CASE WHEN event.eventType = 'ad_preview' THEN event.visitorId ELSE NULL END)",
          'uniqueViewers',
        )
        .addSelect(
          "COUNT(DISTINCT CASE WHEN event.eventType = 'ad_click' THEN event.visitorId ELSE NULL END)",
          'uniqueClickers',
        ),
    ).getRawOne<{
      totalEvents: string | null;
      uniqueVisitors: string | null;
      productViews: string | null;
      productClicks: string | null;
      uniqueViewers: string | null;
      uniqueClickers: string | null;
    }>();

    const totals = this.buildEngagementTotals(totalsRow);
    const ctr =
      totals.productViews > 0 ? (totals.productClicks / totals.productViews) * 100 : 0;
    const uniqueCtr =
      totals.uniqueViewers > 0
        ? (totals.uniqueClickers / totals.uniqueViewers) * 100
        : 0;

    return {
      ...this.buildMerchantEngagementEnvelope(scope),
      totals: {
        ...totals,
        ctr: Number(ctr.toFixed(2)),
        uniqueCtr: Number(uniqueCtr.toFixed(2)),
      },
      funnel: [
        {
          key: 'views',
          label: 'Product Views',
          count: totals.productViews,
          uniqueVisitors: totals.uniqueViewers,
          conversionFromPrevious: 100,
        },
        {
          key: 'clicks',
          label: 'Contact Clicks',
          count: totals.productClicks,
          uniqueVisitors: totals.uniqueClickers,
          conversionFromPrevious: Number(ctr.toFixed(2)),
        },
      ],
    };
  }

  private async fetchMerchantEngagementTimeline(scope: MerchantEngagementScope) {
    const scopedRangeForProducts = this.buildProductEngagementScopeQuery(scope);
    const timelineRows = await this.guardQuery(
      scopedRangeForProducts
        .clone()
        .select('DATE(event.createdAt)', 'date')
        .addSelect(
          "SUM(CASE WHEN event.eventType = 'ad_preview' THEN 1 ELSE 0 END)",
          'views',
        )
        .addSelect(
          "SUM(CASE WHEN event.eventType = 'ad_click' THEN 1 ELSE 0 END)",
          'clicks',
        )
        .addSelect('COUNT(DISTINCT event.visitorId)', 'uniqueVisitors')
        .groupBy('DATE(event.createdAt)')
        .orderBy('date', 'ASC'),
    ).getRawMany<{
      date: string;
      views: string;
      clicks: string;
      uniqueVisitors: string;
    }>();

    return {
      ...this.buildMerchantEngagementEnvelope(scope),
      timeline: timelineRows.map((row) => ({
        date: row.date,
        views: Number.parseInt(row.views, 10) || 0,
        clicks: Number.parseInt(row.clicks, 10) || 0,
        uniqueVisitors: Number.parseInt(row.uniqueVisitors, 10) || 0,
      })),
    };
  }

  private async fetchMerchantEngagementTopProducts(scope: MerchantEngagementScope) {
    const scopedRangeForProducts = this.buildProductEngagementScopeQuery(scope);
    const topProductRows = await this.guardQuery(
      scopedRangeForProducts
        .clone()
        .leftJoin(Ad, 'ad', 'ad.id = event.adId')
        .select('event.adId', 'adId')
        .addSelect('COALESCE(ad.name, CONCAT("Ad #", event.adId))', 'adName')
        .addSelect('COALESCE(ad.merchantId, MAX(event.merchantId))', 'merchantId')
        .addSelect(
          "SUM(CASE WHEN event.eventType = 'ad_preview' THEN 1 ELSE 0 END)",
          'views',
        )
        .addSelect(
          "SUM(CASE WHEN event.eventType = 'ad_click' THEN 1 ELSE 0 END)",
          'clicks',
        )
        .addSelect(
          "COUNT(DISTINCT CASE WHEN event.eventType = 'ad_preview' THEN event.visitorId ELSE NULL END)",
          'uniqueViewers',
        )
        .addSelect(
          "COUNT(DISTINCT CASE WHEN event.eventType = 'ad_click' THEN event.visitorId ELSE NULL END)",
          'uniqueClickers',
        )
        .groupBy('event.adId')
        .addGroupBy('ad.name')
        .addGroupBy('ad.merchantId')
        .orderBy('views', 'DESC')
        .addOrderBy('clicks', 'DESC')
        .limit(12),
    ).getRawMany<{
      adId: string;
      adName: string;
      merchantId: string | null;
      views: string;
      clicks: string;
      uniqueViewers: string;
      uniqueClickers: string;
    }>();

    return {
      ...this.buildMerchantEngagementEnvelope(scope),
      topProducts: topProductRows.map((row) => {
        const views = Number.parseInt(row.views, 10) || 0;
        const clicks = Number.parseInt(row.clicks, 10) || 0;
        return {
          adId: Number.parseInt(row.adId, 10) || 0,
          adName: row.adName,
          merchantId: row.merchantId ? Number.parseInt(row.merchantId, 10) : null,
          views,
          clicks,
          uniqueViewers: Number.parseInt(row.uniqueViewers, 10) || 0,
          uniqueClickers: Number.parseInt(row.uniqueClickers, 10) || 0,
          ctr: views > 0 ? Number(((clicks / views) * 100).toFixed(2)) : 0,
        };
      }),
    };
  }

  private async fetchMerchantEngagementSegments(scope: MerchantEngagementScope) {
    const scopedRange = this.buildEventScopeQuery('event', {
      from: scope.from,
      to: scope.to,
      includeBots: scope.includeBots,
      merchantId: scope.merchantId,
      adId: scope.adId,
    });
    const scopedRangeForProducts = this.buildProductEngagementScopeQuery(scope);
    const deviceExpression = this.getDeviceSqlExpression('event');

    const [eventTypeRows, byCountryRows, byReferrerRows, byDeviceRows, visitorLifecycle] =
      await Promise.all([
        this.guardQuery(
          scopedRange
            .clone()
            .select('event.eventType', 'eventType')
            .addSelect('COUNT(*)', 'events')
            .addSelect('COUNT(DISTINCT event.visitorId)', 'uniqueVisitors')
            .groupBy('event.eventType')
            .orderBy('events', 'DESC'),
        ).getRawMany<{
          eventType: string;
          events: string;
          uniqueVisitors: string;
        }>(),
        this.guardQuery(
          scopedRangeForProducts
            .clone()
            .select("COALESCE(NULLIF(event.countryCode, ''), 'UNKNOWN')", 'country')
            .addSelect('COUNT(*)', 'events')
            .addSelect('COUNT(DISTINCT event.visitorId)', 'uniqueVisitors')
            .groupBy("COALESCE(NULLIF(event.countryCode, ''), 'UNKNOWN')")
            .orderBy('events', 'DESC')
            .limit(10),
        ).getRawMany<{
          country: string;
          events: string;
          uniqueVisitors: string;
        }>(),
        this.guardQuery(
          scopedRangeForProducts
            .clone()
            .select("COALESCE(NULLIF(event.referrerHost, ''), 'direct')", 'referrer')
            .addSelect('COUNT(*)', 'events')
            .addSelect('COUNT(DISTINCT event.visitorId)', 'uniqueVisitors')
            .groupBy("COALESCE(NULLIF(event.referrerHost, ''), 'direct')")
            .orderBy('events', 'DESC')
            .limit(10),
        ).getRawMany<{
          referrer: string;
          events: string;
          uniqueVisitors: string;
        }>(),
        this.guardQuery(
          scopedRangeForProducts
            .clone()
            .select(deviceExpression, 'device')
            .addSelect('COUNT(*)', 'events')
            .addSelect('COUNT(DISTINCT event.visitorId)', 'uniqueVisitors')
            .groupBy(deviceExpression)
            .orderBy('events', 'DESC'),
        ).getRawMany<{
          device: SupportedDeviceType;
          events: string;
          uniqueVisitors: string;
        }>(),
        this.calculateVisitorLifecycle(scope),
      ]);

    return {
      ...this.buildMerchantEngagementEnvelope(scope),
      segments: {
        byEventType: eventTypeRows.map((row) => ({
          eventType: row.eventType,
          events: Number.parseInt(row.events, 10) || 0,
          uniqueVisitors: Number.parseInt(row.uniqueVisitors, 10) || 0,
        })),
        byCountry: byCountryRows.map((row) => ({
          country: row.country,
          events: Number.parseInt(row.events, 10) || 0,
          uniqueVisitors: Number.parseInt(row.uniqueVisitors, 10) || 0,
        })),
        byReferrer: byReferrerRows.map((row) => ({
          referrer: row.referrer,
          events: Number.parseInt(row.events, 10) || 0,
          uniqueVisitors: Number.parseInt(row.uniqueVisitors, 10) || 0,
        })),
        byDevice: byDeviceRows.map((row) => ({
          device: row.device,
          events: Number.parseInt(row.events, 10) || 0,
          uniqueVisitors: Number.parseInt(row.uniqueVisitors, 10) || 0,
        })),
        visitorLifecycle,
      },
    };
  }

  private async fetchMerchantEngagementDataQuality(scope: MerchantEngagementScope) {
    const qualityBase = this.buildEventScopeQuery('event', {
      from: scope.from,
      to: scope.to,
      includeBots: true,
      merchantId: scope.merchantId,
      adId: scope.adId,
    });

    const qualityRow = await this.guardQuery(
      qualityBase
        .clone()
        .select(
          "SUM(CASE WHEN event.eventType IN ('ad_preview', 'ad_click') AND (event.adId IS NULL OR event.merchantId IS NULL) THEN 1 ELSE 0 END)",
          'missingAdContext',
        )
        .addSelect(
          "SUM(CASE WHEN COALESCE(event.countryCode, '') = '' THEN 1 ELSE 0 END)",
          'missingCountry',
        )
        .addSelect(
          "SUM(CASE WHEN COALESCE(event.referrerHost, '') = '' THEN 1 ELSE 0 END)",
          'missingReferrer',
        )
        .addSelect(
          "SUM(CASE WHEN event.isBot = true THEN 1 ELSE 0 END)",
          'botEvents',
        )
        .addSelect(
          `SUM(CASE WHEN event.metadata IS NOT NULL AND event.metadata LIKE :schemaPattern THEN 1 ELSE 0 END)`,
          'eventsWithSchemaVersion',
        )
        .setParameter('schemaPattern', '%"__sv":%'),
    ).getRawOne<{
      missingAdContext: string | null;
      missingCountry: string | null;
      missingReferrer: string | null;
      botEvents: string | null;
      eventsWithSchemaVersion: string | null;
    }>();

    return {
      ...this.buildMerchantEngagementEnvelope(scope),
      dataQuality: {
        missingAdContext: Number.parseInt(qualityRow?.missingAdContext ?? '0', 10) || 0,
        missingCountry: Number.parseInt(qualityRow?.missingCountry ?? '0', 10) || 0,
        missingReferrer:
          Number.parseInt(qualityRow?.missingReferrer ?? '0', 10) || 0,
        botEvents: Number.parseInt(qualityRow?.botEvents ?? '0', 10) || 0,
        eventsWithSchemaVersion:
          Number.parseInt(qualityRow?.eventsWithSchemaVersion ?? '0', 10) || 0,
      },
    };
  }

  private resolveMerchantEngagementScope(
    options: MerchantEngagementOptions,
  ): MerchantEngagementScope {
    const { from, to } = this.resolveRange(options.from, options.to);
    return {
      from,
      to,
      includeBots: options.includeBots ?? false,
      merchantId: this.parseQueryPositiveInt(options.merchantId, 'merchantId'),
      adId: this.parseQueryPositiveInt(options.adId, 'adId'),
    };
  }

  private buildProductEngagementScopeQuery(scope: MerchantEngagementScope) {
    return this.buildEventScopeQuery('event', {
      from: scope.from,
      to: scope.to,
      includeBots: scope.includeBots,
      merchantId: scope.merchantId,
      adId: scope.adId,
    })
      .andWhere('event.adId IS NOT NULL')
      .andWhere('event.eventType IN (:...engagementTypes)', {
        engagementTypes: AD_ENGAGEMENT_EVENT_TYPES,
      });
  }

  private buildMerchantEngagementEnvelope(scope: MerchantEngagementScope) {
    return {
      range: {
        from: scope.from.toISOString(),
        to: scope.to.toISOString(),
      },
      includeBots: scope.includeBots,
      filters: {
        merchantId: scope.merchantId,
        adId: scope.adId,
      },
    };
  }

  private buildEngagementTotals(row: {
    totalEvents: string | null;
    uniqueVisitors: string | null;
    productViews: string | null;
    productClicks: string | null;
    uniqueViewers: string | null;
    uniqueClickers: string | null;
  } | null | undefined) {
    return {
      totalEvents: Number.parseInt(row?.totalEvents ?? '0', 10) || 0,
      uniqueVisitors: Number.parseInt(row?.uniqueVisitors ?? '0', 10) || 0,
      productViews: Number.parseInt(row?.productViews ?? '0', 10) || 0,
      productClicks: Number.parseInt(row?.productClicks ?? '0', 10) || 0,
      uniqueViewers: Number.parseInt(row?.uniqueViewers ?? '0', 10) || 0,
      uniqueClickers: Number.parseInt(row?.uniqueClickers ?? '0', 10) || 0,
    };
  }

  private resolveRange(fromRaw?: string, toRaw?: string) {
    const defaultFrom = new Date();
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
    defaultFrom.setUTCHours(0, 0, 0, 0);

    const defaultTo = new Date();
    defaultTo.setUTCHours(23, 59, 59, 999);

    const from = fromRaw
      ? this.parseDateInput(fromRaw, { isEnd: false })
      : defaultFrom;
    const to = toRaw ? this.parseDateInput(toRaw, { isEnd: true }) : defaultTo;

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from must be before to');
    }

    const rangeMs = to.getTime() - from.getTime();
    const maxRangeMs = MAX_ANALYTICS_RANGE_DAYS * 24 * 60 * 60 * 1000;
    if (rangeMs > maxRangeMs) {
      throw new BadRequestException(
        `Date range must not exceed ${MAX_ANALYTICS_RANGE_DAYS} days`,
      );
    }

    return { from, to };
  }

  private parseDateInput(value: string, options: { isEnd: boolean }) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('Date filter must not be empty');
    }

    const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
    if (dateOnlyPattern.test(trimmed)) {
      return new Date(
        `${trimmed}${options.isEnd ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`,
      );
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date: ${trimmed}`);
    }
    return parsed;
  }

  private normalizeSearchQuery(value?: string) {
    const normalized = this.normalizeText(value, 120);
    return normalized ? normalized.slice(0, 120) : null;
  }

  private parseQueryPositiveInt(value: string | undefined, label: string) {
    if (!value) return null;
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`${label} must be a positive integer`);
    }
    return parsed;
  }

  private buildEventScopeQuery(
    alias: string,
    filters: EventScopeFilters,
  ): SelectQueryBuilder<VisitorEvent> {
    const qb = this.visitorEventRepo.createQueryBuilder(alias).where('1 = 1');

    if (filters.from && filters.to) {
      qb.andWhere(`${alias}.createdAt BETWEEN :from AND :to`, {
        from: filters.from,
        to: filters.to,
      });
    }

    if (!filters.includeBots) {
      qb.andWhere(`${alias}.isBot = :scopeIsBot`, { scopeIsBot: false });
    }

    if (typeof filters.merchantId === 'number') {
      qb.andWhere(`${alias}.merchantId = :scopeMerchantId`, {
        scopeMerchantId: filters.merchantId,
      });
    }

    if (typeof filters.adId === 'number') {
      qb.andWhere(`${alias}.adId = :scopeAdId`, {
        scopeAdId: filters.adId,
      });
    }

    if (filters.eventType) {
      qb.andWhere(`${alias}.eventType = :scopeEventType`, {
        scopeEventType: filters.eventType,
      });
    }

    return qb;
  }

  private guardQuery<T extends SelectQueryBuilder<any>>(qb: T): T {
    return qb.maxExecutionTime(ANALYTICS_QUERY_TIMEOUT_MS);
  }

  private async getAdLookup(adIdsRaw: Array<number | null>) {
    const adIds = [...new Set(adIdsRaw.filter((id): id is number => typeof id === 'number'))];
    if (adIds.length === 0) {
      return new Map<number, { name: string; merchantId: number | null }>();
    }

    const ads = await this.adRepo.find({
      where: { id: In(adIds) },
      select: { id: true, name: true, merchantId: true },
    });

    return new Map(
      ads.map((ad) => [ad.id, { name: ad.name, merchantId: ad.merchantId }]),
    );
  }

  private getDeviceSqlExpression(alias: string) {
    return `CASE
      WHEN ${alias}.isBot = true THEN 'bot'
      WHEN ${alias}.userAgent IS NULL OR ${alias}.userAgent = '' THEN 'unknown'
      WHEN LOWER(${alias}.userAgent) REGEXP 'ipad|tablet' THEN 'tablet'
      WHEN LOWER(${alias}.userAgent) REGEXP 'mobile|iphone|android' THEN 'mobile'
      ELSE 'desktop'
    END`;
  }

  private resolveDeviceType(
    userAgent: string | null,
    isBot: boolean,
  ): SupportedDeviceType {
    if (isBot) return 'bot';
    if (!userAgent) return 'unknown';
    const normalized = userAgent.toLowerCase();
    if (/ipad|tablet/.test(normalized)) return 'tablet';
    if (/mobile|iphone|android/.test(normalized)) return 'mobile';
    return 'desktop';
  }

  private async calculateVisitorLifecycle(input: {
    from: Date;
    to: Date;
    includeBots: boolean;
    merchantId: number | null;
    adId: number | null;
  }) {
    const inRangeVisitorsQuery = this.buildEventScopeQuery('rangeEvent', {
      from: input.from,
      to: input.to,
      includeBots: input.includeBots,
      merchantId: input.merchantId,
      adId: input.adId,
    }).select('DISTINCT rangeEvent.visitorId');

    const firstSeenRows = await this.guardQuery(
      this.buildEventScopeQuery('allEvent', {
        includeBots: input.includeBots,
        merchantId: input.merchantId,
        adId: input.adId,
      })
        .select('allEvent.visitorId', 'visitorId')
        .addSelect('MIN(allEvent.createdAt)', 'firstSeen')
        .andWhere(`allEvent.visitorId IN (${inRangeVisitorsQuery.getQuery()})`)
        .setParameters(inRangeVisitorsQuery.getParameters())
        .groupBy('allEvent.visitorId'),
    ).getRawMany<{ visitorId: string; firstSeen: string }>();

    let newVisitors = 0;
    let returningVisitors = 0;
    for (const row of firstSeenRows) {
      const firstSeen = new Date(row.firstSeen);
      if (Number.isNaN(firstSeen.getTime())) continue;
      if (firstSeen.getTime() >= input.from.getTime()) {
        newVisitors += 1;
      } else {
        returningVisitors += 1;
      }
    }

    return {
      newVisitors,
      returningVisitors,
    };
  }

  private getVisitorIdFromCookie(req: FastifyRequest) {
    const cookies = (
      req as FastifyRequest & { cookies?: Record<string, string> }
    ).cookies;
    const value = cookies?.[VISITOR_COOKIE_NAME];
    return this.normalizeVisitorId(value);
  }

  private normalizeVisitorId(value: unknown) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length < 16 || normalized.length > 128) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(normalized)) return null;
    return normalized;
  }

  private normalizePath(pathRaw?: string) {
    const fallback = '/';
    if (!pathRaw) return fallback;
    const trimmed = pathRaw.trim();
    if (!trimmed) return fallback;

    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const url = new URL(trimmed);
        return `${url.pathname}${url.search}`.slice(0, 512);
      }
    } catch {
      return fallback;
    }

    return trimmed.startsWith('/')
      ? trimmed.slice(0, 512)
      : `/${trimmed.slice(0, 511)}`;
  }

  private normalizeUrl(value: string | undefined, maxLength: number) {
    if (!value) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    return normalized.slice(0, maxLength);
  }

  private extractHost(url: string | null) {
    if (!url) return null;
    try {
      return new URL(url).host.slice(0, 255);
    } catch {
      return null;
    }
  }

  private normalizeText(value: string | null | undefined, maxLength: number) {
    if (!value) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    return normalized.slice(0, maxLength);
  }

  private extractClientIp(req: FastifyRequest) {
    const fromCf = this.getHeader(req, 'cf-connecting-ip');
    const fromXff = this.getHeader(req, 'x-forwarded-for');
    const fromRealIp = this.getHeader(req, 'x-real-ip');
    const fallback = typeof req.ip === 'string' ? req.ip : null;

    const candidate = fromCf ?? fromXff ?? fromRealIp ?? fallback;
    if (!candidate) return null;

    const first = candidate.split(',')[0]?.trim() ?? '';
    if (!first) return null;
    return first.replace(/^::ffff:/i, '').slice(0, 64);
  }

  private getUserAgent(req: FastifyRequest) {
    return this.getHeader(req, 'user-agent');
  }

  private extractCountryCode(req: FastifyRequest) {
    const country =
      this.getHeader(req, 'cf-ipcountry') ??
      this.getHeader(req, 'x-country-code') ??
      this.getHeader(req, 'x-vercel-ip-country') ??
      this.getHeader(req, 'cloudfront-viewer-country');
    if (!country) return null;
    const normalized = country.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
  }

  private extractRegion(req: FastifyRequest) {
    const region =
      this.getHeader(req, 'cf-region-code') ??
      this.getHeader(req, 'x-vercel-ip-country-region') ??
      this.getHeader(req, 'cloudfront-viewer-country-region');
    return this.normalizeText(region, 120);
  }

  private extractCity(req: FastifyRequest) {
    const city =
      this.getHeader(req, 'cf-ipcity') ??
      this.getHeader(req, 'x-vercel-ip-city');
    return this.normalizeText(city, 120);
  }

  private getHeader(req: FastifyRequest, key: string) {
    const value = req.headers[key];
    if (Array.isArray(value)) {
      return typeof value[0] === 'string' ? value[0] : null;
    }
    return typeof value === 'string' ? value : null;
  }

  private hashIp(ip: string | null) {
    if (!ip) return null;
    const salt =
      this.configService.get<string>('VISITOR_IP_SALT') ??
      this.configService.get<string>('JWT_SECRET') ??
      '';
    return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
  }

  private normalizeSchemaVersion(value: unknown, qualityFlags: Set<string>) {
    if (value === undefined || value === null) {
      return ANALYTICS_SCHEMA_VERSION;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      qualityFlags.add('invalid_schema_version');
      return ANALYTICS_SCHEMA_VERSION;
    }
    if (value !== ANALYTICS_SCHEMA_VERSION) {
      qualityFlags.add('schema_version_mismatch');
    }
    return value;
  }

  private normalizeTrackingId(value: unknown) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > 80) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(normalized)) return null;
    return normalized;
  }

  private parseClientTimestamp(value: unknown, qualityFlags: Set<string>) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      qualityFlags.add('invalid_sent_at');
      return null;
    }

    const now = Date.now();
    const parsedTime = parsed.getTime();
    if (parsedTime > now + 5 * 60 * 1000) {
      qualityFlags.add('future_sent_at');
    }
    if (parsedTime < now - 7 * 24 * 60 * 60 * 1000) {
      qualityFlags.add('stale_sent_at');
    }
    return parsed;
  }

  private isBotTraffic(userAgent: string | null) {
    if (!userAgent) return false;
    return /(bot|crawler|spider|crawl|slurp|facebookexternalhit|telegrambot)/i.test(
      userAgent,
    );
  }

  private normalizeMetadata(
    input?: Record<string, unknown>,
    options?: { allowReservedKeys?: boolean; maxEntries?: number },
  ) {
    if (!input || typeof input !== 'object') {
      return null;
    }

    const maxEntries = options?.maxEntries ?? 20;
    const allowReservedKeys = options?.allowReservedKeys ?? false;
    const entries = Object.entries(input).slice(0, maxEntries);
    const normalized: Record<string, string | number | boolean | null> = {};

    for (const [key, value] of entries) {
      const cleanKey = key.trim().slice(0, 40);
      if (!cleanKey) continue;
      if (!allowReservedKeys && cleanKey.startsWith('__')) continue;

      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        normalized[cleanKey] =
          typeof value === 'string' ? value.slice(0, 200) : value;
        continue;
      }

      normalized[cleanKey] = null;
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
  }

  private async resolveAdViewTarget(
    eventType: string,
    metadataRaw?: Record<string, unknown>,
  ) {
    if (
      (eventType !== 'ad_preview' && eventType !== 'ad_click') ||
      !metadataRaw
    ) {
      return null;
    }

    const adId = this.parsePositiveInt(metadataRaw.adId);
    if (adId) {
      const target = await this.merchantsService.resolveAdMerchant(adId);
      if (
        target &&
        target.merchantId &&
        target.status === AdStatus.APPROVED &&
        target.isActive
      ) {
        return { adId: target.adId, merchantId: target.merchantId };
      }
    }

    const adSlugRaw = metadataRaw.adSlug;
    const adSlug =
      typeof adSlugRaw === 'string' ? adSlugRaw.trim().toLowerCase() : '';
    if (!adSlug) {
      return null;
    }

    const ad = await this.adRepo.findOne({
      where: { slug: adSlug },
      select: { id: true, merchantId: true, status: true, isActive: true },
    });
    if (
      !ad?.merchantId ||
      ad.status !== AdStatus.APPROVED ||
      ad.isActive !== true
    ) {
      return null;
    }

    return {
      adId: ad.id,
      merchantId: ad.merchantId,
    };
  }

  private parsePositiveInt(value: unknown) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (typeof value !== 'string') return null;
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  private escapeLikePattern(value: string) {
    return value.replace(/[\\%_]/g, '\\$&');
  }

  private async findRecentDuplicateEvent(input: {
    visitorId: string;
    eventType: string;
    path: string;
    adId: number | null;
    merchantId: number | null;
    clientEventId: string | null;
  }) {
    if (input.clientEventId) {
      const escapedEventId = this.escapeLikePattern(input.clientEventId);
      const eventIdPattern = `%"__ceid":"${escapedEventId}"%`;
      const duplicateByClientEventId = await this.visitorEventRepo
        .createQueryBuilder('event')
        .where('event.visitorId = :visitorId', {
          visitorId: input.visitorId,
        })
        .andWhere('event.createdAt >= :dedupeSince', {
          dedupeSince: new Date(Date.now() - 24 * 60 * 60 * 1000),
        })
        .andWhere("event.metadata LIKE :eventIdPattern ESCAPE '\\\\'", {
          eventIdPattern,
        })
        .orderBy('event.createdAt', 'DESC')
        .getOne();
      if (duplicateByClientEventId) {
        return duplicateByClientEventId;
      }
    }

    const dedupeWindowMs =
      input.eventType === 'page_view'
        ? 4_000
        : input.eventType === 'ad_preview'
          ? 8_000
          : 6_000;

    return this.visitorEventRepo
      .createQueryBuilder('event')
      .where('event.visitorId = :visitorId', { visitorId: input.visitorId })
      .andWhere('event.eventType = :eventType', { eventType: input.eventType })
      .andWhere('event.path = :path', { path: input.path })
      .andWhere('(event.adId <=> :adId)', { adId: input.adId })
      .andWhere('(event.merchantId <=> :merchantId)', {
        merchantId: input.merchantId,
      })
      .andWhere('event.createdAt >= :dedupeSince', {
        dedupeSince: new Date(Date.now() - dedupeWindowMs),
      })
      .orderBy('event.createdAt', 'DESC')
      .getOne();
  }
}
