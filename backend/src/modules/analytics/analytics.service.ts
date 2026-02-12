import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { TrackVisitDto } from './dto/track-visit.dto';
import { VisitorEvent } from './entities/visitor-event.entity';
import { Ad, AdStatus } from '../products/entities/ad.entity';
import { MerchantsService } from '../merchants/merchants.service';

export const VISITOR_COOKIE_NAME = 'gp_vid';

type VisitorSummaryOptions = {
  from?: string;
  to?: string;
  includeBots?: boolean;
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
    const adViewTarget = await this.resolveAdViewTarget(eventType, dto.metadata);
    const metadata = this.normalizeMetadata(dto.metadata);
    const isBot = this.isBotTraffic(userAgent);

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
    if (adViewTarget?.merchantId && !isBot) {
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
      base.clone().getCount(),
      base
        .clone()
        .select('COUNT(DISTINCT event.visitorId)', 'count')
        .getRawOne<{ count: string | null }>(),
      base
        .clone()
        .select("COALESCE(NULLIF(event.countryCode, ''), 'UNKNOWN')", 'country')
        .addSelect('COUNT(*)', 'visits')
        .addSelect('COUNT(DISTINCT event.visitorId)', 'uniqueVisitors')
        .groupBy("COALESCE(NULLIF(event.countryCode, ''), 'UNKNOWN')")
        .orderBy('visits', 'DESC')
        .limit(10)
        .getRawMany<{
          country: string;
          visits: string;
          uniqueVisitors: string;
        }>(),
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
        .limit(10)
        .getRawMany<{
          referrer: string;
          visits: string;
          uniqueVisitors: string;
        }>(),
      base
        .clone()
        .select('DATE(event.createdAt)', 'date')
        .addSelect('COUNT(*)', 'visits')
        .addSelect('COUNT(DISTINCT event.visitorId)', 'uniqueVisitors')
        .groupBy('DATE(event.createdAt)')
        .orderBy('date', 'ASC')
        .getRawMany<{
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

  private isBotTraffic(userAgent: string | null) {
    if (!userAgent) return false;
    return /(bot|crawler|spider|crawl|slurp|facebookexternalhit|telegrambot)/i.test(
      userAgent,
    );
  }

  private normalizeMetadata(input?: Record<string, unknown>) {
    if (!input || typeof input !== 'object') {
      return null;
    }

    const entries = Object.entries(input).slice(0, 20);
    const normalized: Record<string, string | number | boolean | null> = {};

    for (const [key, value] of entries) {
      const cleanKey = key.trim().slice(0, 40);
      if (!cleanKey) continue;

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
    if (eventType !== 'ad_preview' || !metadataRaw) {
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
}
