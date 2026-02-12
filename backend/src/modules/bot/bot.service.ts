import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotSubscriber } from './entities/bot-subscriber.entity';

type TelegramSourceUser = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type AdSubmissionPayload = {
  adId: number;
  title: string;
  price?: number;
  phoneNumber?: string | null;
  address?: string | null;
  categoryId?: number | null;
  merchantId?: number | null;
};

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly configService: ConfigService,
    @InjectRepository(BotSubscriber)
    private readonly subscriberRepo: Repository<BotSubscriber>,
  ) {}

  async registerSubscriber(from: TelegramSourceUser | null | undefined) {
    const telegramIdRaw = from?.id;
    if (telegramIdRaw === undefined || telegramIdRaw === null) {
      return;
    }

    const telegramId = String(telegramIdRaw).trim();
    if (!telegramId) {
      return;
    }

    const now = new Date();
    await this.subscriberRepo
      .createQueryBuilder()
      .insert()
      .into(BotSubscriber)
      .values({
        telegramId,
        username: from?.username ?? null,
        firstName: from?.first_name ?? null,
        lastName: from?.last_name ?? null,
        isActive: true,
        lastSeenAt: now,
      })
      .orUpdate(
        ['username', 'firstName', 'lastName', 'isActive', 'lastSeenAt'],
        ['telegramId'],
      )
      .execute();
  }

  async markSubscriberInactive(telegramId: string) {
    const trimmedTelegramId = String(telegramId ?? '').trim();
    if (!trimmedTelegramId) {
      return;
    }

    await this.subscriberRepo.update(
      { telegramId: trimmedTelegramId },
      { isActive: false },
    );
  }

  async notifyAdminAdSubmission(payload: AdSubmissionPayload): Promise<void> {
    const adminId = this.configService.get<string>('TELEGRAM_ADMIN_ID');
    if (!adminId) {
      this.logger.warn(
        'TELEGRAM_ADMIN_ID not configured; skipping ad submission notification',
      );
      return;
    }

    const adManageUrl = this.getAdsManageUrl();
    const safeUrl = this.escapeHtml(adManageUrl);
    const safeTitle = this.escapeHtml(payload.title || 'Untitled ad');
    const safePhone = this.escapeHtml(payload.phoneNumber || 'Not provided');
    const safeAddress = this.escapeHtml(payload.address || 'Not provided');
    const safePrice = Number.isFinite(Number(payload.price))
      ? `${Number(payload.price).toLocaleString('en-US')} Birr`
      : 'Not set';

    const lines = [
      '🆕 <b>New ad submission</b>',
      '',
      `Ad: <b>#${payload.adId}</b>`,
      `Title: <b>${safeTitle}</b>`,
      `Price: <b>${this.escapeHtml(safePrice)}</b>`,
      `Phone: <code>${safePhone}</code>`,
      `Address: <code>${safeAddress}</code>`,
      `Category ID: <code>${this.escapeHtml(String(payload.categoryId ?? '-'))}</code>`,
      `Merchant ID: <code>${this.escapeHtml(String(payload.merchantId ?? '-'))}</code>`,
      '',
      `Review in admin dashboard: <a href="${safeUrl}">${safeUrl}</a>`,
    ];

    await this.bot.telegram.sendMessage(adminId, lines.join('\n'), {
      parse_mode: 'HTML',
    });
  }

  async notifyUser(telegramId: string, message: string): Promise<void> {
    try {
      await this.sendUserMessage(telegramId, message);
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Failed to send to ${telegramId}: ${err.message}`);
    }
  }

  async sendUserMessage(
    telegramId: string,
    message: string,
  ): Promise<{ messageId: number }> {
    const response = await this.bot.telegram.sendMessage(telegramId, message, {
      parse_mode: 'HTML',
    });
    return { messageId: response.message_id };
  }

  private getAdsManageUrl(): string {
    const base = this.getDashboardBaseUrl();
    if (base.toLowerCase().endsWith('/ads')) {
      return base;
    }
    return `${base}/ads`;
  }

  private getDashboardBaseUrl(): string {
    const directUrl = this.normalizeHttpUrl(
      this.configService.get<string>('DASHBOARD_URL') ?? '',
    );
    if (directUrl) {
      return directUrl;
    }

    const corsOrigins = (this.configService.get<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((origin) => this.normalizeHttpUrl(origin))
      .filter((origin): origin is string => Boolean(origin));

    const preferredOrigin =
      corsOrigins.find((origin) => origin.toLowerCase().includes('admin')) ??
      corsOrigins.find((origin) => !origin.includes('localhost')) ??
      corsOrigins[0];

    return preferredOrigin ?? 'http://localhost:5173';
  }

  private normalizeHttpUrl(rawUrl: string): string | null {
    const trimmed = String(rawUrl ?? '').trim();
    if (!trimmed) return null;

    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return null;
      }
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return null;
    }
  }

  private escapeHtml(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
