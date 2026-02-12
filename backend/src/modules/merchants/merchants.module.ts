import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Ad } from '../products/entities/ad.entity';
import { VisitorEvent } from '../analytics/entities/visitor-event.entity';
import { MerchantActivity } from './entities/merchant-activity.entity';
import { MerchantLoyaltyEvent } from './entities/merchant-loyalty-event.entity';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Ad,
      VisitorEvent,
      MerchantActivity,
      MerchantLoyaltyEvent,
    ]),
  ],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
