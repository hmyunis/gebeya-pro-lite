import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { MerchantsService } from './merchants.service';
import { AdjustMerchantPointsDto } from './dto/adjust-merchant-points.dto';
import { MerchantActionDto } from './dto/merchant-action.dto';

type AuthenticatedRequest = FastifyRequest & {
  user: {
    userId: number;
    role: UserRole;
  };
};

@Controller('merchants')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  async listMerchants(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') query?: string,
  ) {
    return this.merchantsService.listMerchants(page, limit, query);
  }

  @Get(':merchantId')
  async getMerchantDetails(
    @Param('merchantId', ParseIntPipe) merchantId: number,
  ) {
    return this.merchantsService.getMerchantDetails(merchantId);
  }

  @Get(':merchantId/activities')
  async getMerchantActivities(
    @Param('merchantId', ParseIntPipe) merchantId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.merchantsService.getMerchantActivities(merchantId, page, limit);
  }

  @Post(':merchantId/ban')
  async banMerchant(
    @Req() req: AuthenticatedRequest,
    @Param('merchantId', ParseIntPipe) merchantId: number,
    @Body() dto: MerchantActionDto,
  ) {
    return this.merchantsService.setMerchantBanState(
      merchantId,
      true,
      req.user.userId,
      dto.reason,
    );
  }

  @Post(':merchantId/unban')
  async unbanMerchant(
    @Req() req: AuthenticatedRequest,
    @Param('merchantId', ParseIntPipe) merchantId: number,
    @Body() dto: MerchantActionDto,
  ) {
    return this.merchantsService.setMerchantBanState(
      merchantId,
      false,
      req.user.userId,
      dto.reason,
    );
  }

  @Post(':merchantId/reviews/block')
  async blockMerchantReviews(
    @Req() req: AuthenticatedRequest,
    @Param('merchantId', ParseIntPipe) merchantId: number,
    @Body() dto: MerchantActionDto,
  ) {
    return this.merchantsService.setMerchantReviewBlockState(
      merchantId,
      true,
      req.user.userId,
      dto.reason,
    );
  }

  @Post(':merchantId/reviews/unblock')
  async unblockMerchantReviews(
    @Req() req: AuthenticatedRequest,
    @Param('merchantId', ParseIntPipe) merchantId: number,
    @Body() dto: MerchantActionDto,
  ) {
    return this.merchantsService.setMerchantReviewBlockState(
      merchantId,
      false,
      req.user.userId,
      dto.reason,
    );
  }

  @Post(':merchantId/points/adjust')
  async adjustMerchantPoints(
    @Req() req: AuthenticatedRequest,
    @Param('merchantId', ParseIntPipe) merchantId: number,
    @Body() dto: AdjustMerchantPointsDto,
  ) {
    return this.merchantsService.adjustMerchantPoints(
      merchantId,
      dto,
      req.user.userId,
    );
  }
}
