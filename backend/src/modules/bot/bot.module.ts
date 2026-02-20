import { Module, Global, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotService } from './bot.service';
import { BotUpdate } from './bot.update';
import { BotSubscriber } from './entities/bot-subscriber.entity';
import { AdsModule } from '../products/ads.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([BotSubscriber]), forwardRef(() => AdsModule)],
  providers: [BotService, BotUpdate],
  exports: [BotService],
})
export class BotModule {}
