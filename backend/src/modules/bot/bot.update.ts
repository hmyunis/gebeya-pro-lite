import { Logger } from '@nestjs/common';
import { Update, Ctx, Start, Action } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { BotService } from './bot.service';
import { AdsService } from '../products/ads.service';

type ActionContext = Context & {
  match?: RegExpExecArray;
  answerCbQuery?: (text?: string) => Promise<unknown>;
  editMessageReplyMarkup?: (
    markup?:
      | {
          inline_keyboard?: Array<Array<{ text: string; callback_data: string }>>;
        }
      | undefined,
  ) => Promise<unknown>;
};

@Update()
export class BotUpdate {
  private readonly logger = new Logger(BotUpdate.name);

  constructor(
    private readonly botService: BotService,
    private readonly adsService: AdsService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    await this.botService.registerSubscriber(ctx.from);
    await ctx.reply(
      '👋 Welcome to Gebeya Pro.\n\nYou may receive ad moderation and marketplace announcements here.',
    );
  }

  @Action(/^admod:(\d+):(approve|reject)$/)
  async onAdModerationAction(@Ctx() ctx: Context) {
    await this.botService.registerSubscriber(ctx.from);

    const actionCtx = ctx as ActionContext;
    const match = actionCtx.match;
    const adminTelegramId = String(ctx.from?.id ?? '').trim();

    if (!match) {
      await this.safeAnswerCallback(actionCtx, 'Invalid action payload');
      return;
    }

    if (!this.botService.isAdminTelegramId(adminTelegramId)) {
      await this.safeAnswerCallback(actionCtx, 'Not authorized');
      return;
    }

    const adId = Number.parseInt(match[1], 10);
    const action = match[2] === 'approve' ? 'approve' : 'reject';

    try {
      await this.adsService.moderateFromTelegramAction({
        adId,
        action,
        adminTelegramId,
      });
      await this.clearActionButtons(actionCtx);
      await this.sendActionMessage(
        actionCtx,
        action === 'approve' ? 'APPROVED' : 'REJECTED',
        adId,
      );
      await this.safeAnswerCallback(
        actionCtx,
        action === 'approve' ? `Ad #${adId} approved` : `Ad #${adId} rejected`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Moderation failed';
      this.logger.warn(
        `Telegram moderation failed for ad ${adId} by ${adminTelegramId}: ${message}`,
      );
      await this.safeAnswerCallback(actionCtx, message);
    }
  }

  private async safeAnswerCallback(ctx: ActionContext, message: string) {
    if (!ctx.answerCbQuery) return;

    try {
      await ctx.answerCbQuery(message.slice(0, 180));
    } catch {
      // no-op
    }
  }

  private async clearActionButtons(ctx: ActionContext) {
    if (!ctx.editMessageReplyMarkup) return;

    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {
      // no-op
    }
  }

  private async sendActionMessage(
    ctx: ActionContext,
    action: 'APPROVED' | 'REJECTED',
    adId: number,
  ) {
    try {
      await ctx.reply(
        action === 'APPROVED'
          ? `✅ Moderation action selected: APPROVED for ad #${adId}`
          : `❌ Moderation action selected: REJECTED for ad #${adId}`,
      );
    } catch {
      // no-op
    }
  }
}
