import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Input, Markup, Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotSubscriber } from './entities/bot-subscriber.entity';
import { existsSync } from 'fs';
import * as path from 'path';

type TelegramSourceUser = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type AdSubmissionPayload = {
  adId: number;
  title: string;
  description?: string | null;
  price?: number;
  phoneNumber?: string | null;
  address?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  merchantId?: number | null;
  merchantName?: string | null;
  merchantUsername?: string | null;
  merchantTelegramId?: string | null;
  imagePaths?: string[];
};

type MerchantModerationPayload = {
  telegramId: string;
  adId: number;
  adTitle: string;
  status: 'APPROVED' | 'REJECTED';
  note?: string | null;
};

type MerchantAdReviewPayload = {
  telegramId: string;
  adId: number;
  adTitle: string;
  reviewerDisplayName: string;
  reviewerUsername?: string | null;
  rating?: number | null;
  comment?: string | null;
  isRatingChanged?: boolean;
  isNewComment?: boolean;
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
    const adminIds = this.getAdminTelegramIds();
    if (adminIds.length === 0) {
      this.logger.warn(
        'TELEGRAM_ADMIN_ID not configured; skipping ad submission notification',
      );
      return;
    }

    const adManageUrl = this.getAdsManageUrl();
    const safeUrl = this.escapeHtml(adManageUrl);
    const safeTitle = this.escapeHtml(payload.title || 'Untitled ad');
    const safeDescription = this.escapeHtml(
      payload.description?.trim() || 'Not provided',
    );
    const safePhone = this.escapeHtml(payload.phoneNumber || 'Not provided');
    const safeAddress = this.escapeHtml(payload.address || 'Not provided');
    const safePrice = Number.isFinite(Number(payload.price))
      ? `${Number(payload.price).toLocaleString('en-US')} Birr`
      : 'Not set';
    const safeCategoryId = this.escapeHtml(String(payload.categoryId ?? '-'));
    const safeCategoryName = this.escapeHtml(payload.categoryName || 'Unknown');
    const safeMerchantId = this.escapeHtml(String(payload.merchantId ?? '-'));
    const safeMerchantName = this.escapeHtml(payload.merchantName || 'Unknown');
    const safeMerchantUsername = this.escapeHtml(
      this.formatTelegramUsername(payload.merchantUsername),
    );
    const safeMerchantTelegramId = this.escapeHtml(
      String(payload.merchantTelegramId ?? '-'),
    );

    const lines = [
      '🆕 <b>New ad submission</b>',
      '',
      `Ad: <b>#${payload.adId}</b>`,
      `Title: <b>${safeTitle}</b>`,
      `Description:`,
      `----------------------------------------`,
      `${safeDescription}`,
      `----------------------------------------`,
      `Price: <b>${this.escapeHtml(safePrice)}</b>`,
      `Phone: ${safePhone}`,
      `Address: <code>${safeAddress}</code>`,
      `Category: <b>${safeCategoryName}</b> (ID: <code>${safeCategoryId}</code>)`,
      `Merchant: <b>${safeMerchantName}</b> (ID: <code>${safeMerchantId}</code>)`,
      `Merchant Telegram: <code>${safeMerchantTelegramId}</code>`,
      `Merchant Username: ${safeMerchantUsername}`,
      '',
      `Review in admin dashboard: <a href="${safeUrl}">${safeUrl}</a>`,
    ];

    const caption = lines.join('\n');
    const callbackBase = `admod:${payload.adId}`;
    const actionKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Approve', `${callbackBase}:approve`),
        Markup.button.callback('❌ Reject', `${callbackBase}:reject`),
      ],
    ]).reply_markup;

    const mediaPaths = (payload.imagePaths ?? []).slice(0, 10);
    const media = mediaPaths
      .map((imagePath) => this.resolveLocalUploadPath(imagePath))
      .filter((filePath): filePath is string => Boolean(filePath));

    for (const adminId of adminIds) {
      try {
        if (media.length === 1) {
          await this.bot.telegram.sendPhoto(adminId, Input.fromLocalFile(media[0]), {
            caption,
            parse_mode: 'HTML',
            reply_markup: actionKeyboard,
          });
          continue;
        }

        if (media.length > 1) {
          await this.bot.telegram.sendMediaGroup(
            adminId,
            media.map((filePath, index) => ({
              type: 'photo' as const,
              media: Input.fromLocalFile(filePath),
              ...(index === 0 ? { caption, parse_mode: 'HTML' as const } : {}),
            })),
          );
          await this.bot.telegram.sendMessage(
            adminId,
            `Moderation actions for ad <b>#${payload.adId}</b>`,
            {
              parse_mode: 'HTML',
              reply_markup: actionKeyboard,
            },
          );
          continue;
        }

        await this.bot.telegram.sendMessage(adminId, caption, {
          parse_mode: 'HTML',
          reply_markup: actionKeyboard,
        });
      } catch (error) {
        const err = error as Error;
        this.logger.warn(
          `Failed to send ad moderation message to admin ${adminId}: ${err.message}`,
        );
      }
    }
  }

  async notifyMerchantAdModeration(
    payload: MerchantModerationPayload,
  ): Promise<void> {
    const decision = payload.status === 'APPROVED' ? 'approved' : 'rejected';
    const lines = [
      payload.status === 'APPROVED'
        ? '✅ <b>Your ad was approved</b>'
        : '❌ <b>Your ad was rejected</b>',
      '',
      `Ad: <b>${this.escapeHtml(payload.adTitle || 'Untitled ad')}</b>`,
      `Ad ID: <code>${this.escapeHtml(String(payload.adId))}</code>`,
    ];

    if (payload.note?.trim()) {
      lines.push(`Admin note: ${this.escapeHtml(payload.note.trim())}`);
    }

    lines.push(
      '',
      payload.status === 'APPROVED'
        ? 'Your listing is now visible to buyers.'
        : 'Please update your ad details and submit again for review.',
      `Status: <b>${this.escapeHtml(decision.toUpperCase())}</b>`,
    );

    await this.notifyUser(payload.telegramId, lines.join('\n'));
  }

  async notifyMerchantAdReview(payload: MerchantAdReviewPayload): Promise<void> {
    const hasRating = Number.isInteger(payload.rating);
    const commentText = payload.comment?.trim() ?? '';
    const hasComment = commentText.length > 0;
    const title = payload.isRatingChanged && payload.isNewComment
      ? '📝 <b>New rating and comment on your ad</b>'
      : payload.isRatingChanged
        ? '⭐ <b>Rating updated on your ad</b>'
        : '💬 <b>New comment on your ad</b>';

    const lines = [
      title,
      '',
      `Ad: <b>${this.escapeHtml(payload.adTitle || 'Untitled ad')}</b>`,
      `Ad ID: <code>${this.escapeHtml(String(payload.adId))}</code>`,
      `Reviewer: <b>${this.escapeHtml(payload.reviewerDisplayName || 'User')}</b>`,
      `Reviewer username: ${this.escapeHtml(
        this.formatTelegramUsername(payload.reviewerUsername),
      )}`,
    ];

    if (hasRating) {
      lines.push(
        `Rating: <b>${this.escapeHtml(String(payload.rating))}/5</b>`,
      );
    }

    if (hasComment) {
      lines.push('', this.escapeHtml(commentText));
    }

    await this.notifyUser(payload.telegramId, lines.join('\n'));
  }

  isAdminTelegramId(telegramId: string): boolean {
    const normalized = String(telegramId ?? '').trim();
    if (!normalized) return false;
    return this.getAdminTelegramIds().includes(normalized);
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

  async sendAnnouncementMessage(
    telegramId: string,
    message: string,
    imagePaths?: string[],
  ): Promise<{ messageId: number }> {
    const trimmedMessage = String(message ?? '').trim();
    const media = (imagePaths ?? [])
      .slice(0, 3)
      .map((imagePath) => this.resolveLocalUploadPath(imagePath))
      .filter((filePath): filePath is string => Boolean(filePath));

    if (media.length === 0) {
      return this.sendUserMessage(telegramId, trimmedMessage);
    }

    const canUseCaption = trimmedMessage.length > 0 && trimmedMessage.length <= 1024;

    if (media.length === 1) {
      const photoResponse = await this.bot.telegram.sendPhoto(
        telegramId,
        Input.fromLocalFile(media[0]),
        canUseCaption
          ? { caption: trimmedMessage, parse_mode: 'HTML' }
          : undefined,
      );

      if (!canUseCaption && trimmedMessage) {
        await this.sendUserMessage(telegramId, trimmedMessage);
      }

      return { messageId: photoResponse.message_id };
    }

    const groupResponse = await this.bot.telegram.sendMediaGroup(
      telegramId,
      media.map((filePath, index) => ({
        type: 'photo' as const,
        media: Input.fromLocalFile(filePath),
        ...(index === 0 && canUseCaption
          ? { caption: trimmedMessage, parse_mode: 'HTML' as const }
          : {}),
      })),
    );

    if (!canUseCaption && trimmedMessage) {
      await this.sendUserMessage(telegramId, trimmedMessage);
    }

    return { messageId: groupResponse[0]?.message_id ?? 0 };
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

  private getAdminTelegramIds(): string[] {
    const raw = this.configService.get<string>('TELEGRAM_ADMIN_ID') ?? '';
    return [...new Set(raw.split(',').map((entry) => entry.trim()).filter(Boolean))];
  }

  private formatTelegramUsername(rawUsername?: string | null): string {
    const username = String(rawUsername ?? '').trim();
    if (!username) return 'Not set';
    return username.startsWith('@') ? username : `@${username}`;
  }

  private resolveLocalUploadPath(imagePath: string): string | null {
    const normalized = String(imagePath ?? '').trim();
    if (!normalized.startsWith('/uploads/')) {
      return null;
    }

    const absolutePath = path.join(process.cwd(), normalized.replace(/^\/+/, ''));
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    const relativeToRoot = path.relative(uploadsRoot, absolutePath);

    if (
      relativeToRoot.startsWith('..') ||
      path.isAbsolute(relativeToRoot) ||
      !existsSync(absolutePath)
    ) {
      return null;
    }

    return absolutePath;
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
