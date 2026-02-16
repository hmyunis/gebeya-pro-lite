import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AnalyticsService, VISITOR_COOKIE_NAME } from './analytics.service';
import { TrackVisitDto } from './dto/track-visit.dto';
import { getVisitorCookieOptions } from '../../common/http/cookies';
import { VisitorSummaryQueryDto } from './dto/visitor-summary-query.dto';
import { VisitorEventsQueryDto } from './dto/visitor-events-query.dto';
import { MerchantEngagementQueryDto } from './dto/merchant-engagement-query.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('visits')
  async trackVisit(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() dto: TrackVisitDto,
  ) {
    const tracked = await this.analyticsService.trackVisit(req, dto);
    if (tracked.shouldSetCookie) {
      res.setCookie(
        VISITOR_COOKIE_NAME,
        tracked.visitorId,
        getVisitorCookieOptions(),
      );
    }
    return tracked;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('visitors/summary')
  async visitorSummary(@Query() query: VisitorSummaryQueryDto) {
    return this.analyticsService.getVisitorSummary({
      from: query.from,
      to: query.to,
      includeBots: query.includeBots,
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('visitors/events')
  async visitorEvents(@Query() query: VisitorEventsQueryDto) {
    return this.analyticsService.getVisitorEvents({
      from: query.from,
      to: query.to,
      includeBots: query.includeBots,
      eventType: query.eventType,
      q: query.q,
      page: query.page,
      limit: query.limit,
      merchantId: query.merchantId,
      adId: query.adId,
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('merchants/engagement/overview')
  async merchantEngagementOverview(@Query() query: MerchantEngagementQueryDto) {
    return this.analyticsService.getMerchantEngagementOverview({
      from: query.from,
      to: query.to,
      includeBots: query.includeBots,
      merchantId: query.merchantId,
      adId: query.adId,
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('merchants/engagement/timeline')
  async merchantEngagementTimeline(@Query() query: MerchantEngagementQueryDto) {
    return this.analyticsService.getMerchantEngagementTimeline({
      from: query.from,
      to: query.to,
      includeBots: query.includeBots,
      merchantId: query.merchantId,
      adId: query.adId,
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('merchants/engagement/top-products')
  async merchantEngagementTopProducts(@Query() query: MerchantEngagementQueryDto) {
    return this.analyticsService.getMerchantEngagementTopProducts({
      from: query.from,
      to: query.to,
      includeBots: query.includeBots,
      merchantId: query.merchantId,
      adId: query.adId,
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('merchants/engagement/segments')
  async merchantEngagementSegments(@Query() query: MerchantEngagementQueryDto) {
    return this.analyticsService.getMerchantEngagementSegments({
      from: query.from,
      to: query.to,
      includeBots: query.includeBots,
      merchantId: query.merchantId,
      adId: query.adId,
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('merchants/engagement/data-quality')
  async merchantEngagementDataQuality(@Query() query: MerchantEngagementQueryDto) {
    return this.analyticsService.getMerchantEngagementDataQuality({
      from: query.from,
      to: query.to,
      includeBots: query.includeBots,
      merchantId: query.merchantId,
      adId: query.adId,
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('merchants/engagement')
  async merchantEngagement(@Query() query: MerchantEngagementQueryDto) {
    return this.analyticsService.getMerchantEngagementDashboard({
      from: query.from,
      to: query.to,
      includeBots: query.includeBots,
      merchantId: query.merchantId,
      adId: query.adId,
    });
  }
}
