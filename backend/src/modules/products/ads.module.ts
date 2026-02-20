import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ad } from './entities/ad.entity';
import { Category } from './entities/category.entity';
import { AdsService } from './ads.service';
import { AdsController } from './ads.controller';
import { ImageService } from './image.service';
import { CategoriesController } from './categories.controller';
import { User } from '../users/entities/user.entity';
import { AdComment } from './entities/ad-comment.entity';
import { AdCommentsService } from './ad-comments.service';
import { MerchantsModule } from '../merchants/merchants.module';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ad, Category, User, AdComment]),
    MerchantsModule,
    forwardRef(() => BotModule),
  ],
  controllers: [AdsController, CategoriesController],
  providers: [AdsService, ImageService, AdCommentsService],
  exports: [AdsService],
})
export class AdsModule {}
