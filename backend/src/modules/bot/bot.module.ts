import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotService } from './bot.service';
import { BotUpdate } from './bot.update';
import { BotSubscriber } from './entities/bot-subscriber.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([BotSubscriber])],
  providers: [BotService, BotUpdate],
  exports: [BotService],
})
export class BotModule {}
