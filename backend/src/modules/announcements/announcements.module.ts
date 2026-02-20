import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementRun } from './entities/announcement-run.entity';
import { AnnouncementDelivery } from './entities/announcement-delivery.entity';
import { User } from '../users/entities/user.entity';
import { BotSubscriber } from '../bot/entities/bot-subscriber.entity';
import { AnnouncementImageService } from './announcement-image.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnnouncementRun,
      AnnouncementDelivery,
      User,
      BotSubscriber,
    ]),
  ],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AnnouncementImageService],
})
export class AnnouncementsModule {}
