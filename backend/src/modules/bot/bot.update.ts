import { Update, Ctx, Start } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { BotService } from './bot.service';

@Update()
export class BotUpdate {
  constructor(private readonly botService: BotService) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    await this.botService.registerSubscriber(ctx.from);
    await ctx.reply(
      '👋 Welcome to Gebeya Pro.\n\nYou may receive ad moderation and marketplace announcements here.',
    );
  }
}
