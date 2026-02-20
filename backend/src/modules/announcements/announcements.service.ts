import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  LessThan,
  QueryRunner,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { randomUUID } from 'node:crypto';
import { User } from '../users/entities/user.entity';
import { BotService } from '../bot/bot.service';
import { BotSubscriber } from '../bot/entities/bot-subscriber.entity';
import {
  AnnouncementDelivery,
  AnnouncementDeliveryStatus,
} from './entities/announcement-delivery.entity';
import {
  AnnouncementKind,
  AnnouncementRun,
  AnnouncementRunStatus,
  AnnouncementTarget,
} from './entities/announcement-run.entity';
import { AnnouncementDeliveryFilter } from './dto/list-announcement-deliveries.dto';
import { AnnouncementImageService } from './announcement-image.service';

type QueueAnnouncementParams = {
  message: string;
  kind?: AnnouncementKind;
  target?: AnnouncementTarget;
  targetUserIds?: number[];
  requestedByUserId?: number;
  limit?: number;
  imageBuffers?: Buffer[];
  imagePaths?: string[];
};

type RepostRunParams = {
  runId: number;
  requestedByUserId?: number;
};

type ListRunDeliveriesParams = {
  runId: number;
  page: number;
  limit: number;
  filter?: AnnouncementDeliveryFilter;
};

type ListAnnouncementUsersParams = {
  page: number;
  limit: number;
  search?: string;
};

const TERMINAL_RUN_STATUSES = [
  AnnouncementRunStatus.COMPLETED,
  AnnouncementRunStatus.COMPLETED_WITH_ERRORS,
  AnnouncementRunStatus.CANCELLED,
] as const;
const MAX_ANNOUNCEMENT_IMAGES = 3;

@Injectable()
export class AnnouncementsService implements OnModuleInit {
  private readonly logger = new Logger(AnnouncementsService.name);
  private readonly nodeToken = `${process.pid}-${randomUUID().slice(0, 8)}`;
  private tickInFlight = false;

  private readonly runLeaseMs = 60_000;
  private readonly deliveryLeaseMs = 60_000;
  private readonly staleProcessingGraceMs = 5 * 60 * 1000;
  private readonly maxBatchesPerTick = 5;
  private readonly chunkInsertSize = 500;

  private readonly batchSize: number;
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly retentionDays: number;
  private readonly activeSubscriberDays: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly botService: BotService,
    private readonly configService: ConfigService,
    private readonly announcementImageService: AnnouncementImageService,
    @InjectRepository(AnnouncementRun)
    private readonly runRepo: Repository<AnnouncementRun>,
    @InjectRepository(AnnouncementDelivery)
    private readonly deliveryRepo: Repository<AnnouncementDelivery>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    this.batchSize = this.normalizeNumber(
      this.configService.get<number>('BROADCAST_BATCH_SIZE'),
      50,
      10,
      200,
    );
    this.concurrency = this.normalizeNumber(
      this.configService.get<number>('BROADCAST_CONCURRENCY'),
      4,
      1,
      10,
    );
    this.maxAttempts = this.normalizeNumber(
      this.configService.get<number>('BROADCAST_MAX_ATTEMPTS'),
      5,
      1,
      10,
    );
    this.retentionDays = this.normalizeNumber(
      this.configService.get<number>('BROADCAST_RETENTION_DAYS'),
      30,
      1,
      365,
    );
    this.activeSubscriberDays = this.normalizeNumber(
      this.configService.get<number>('BROADCAST_ACTIVE_SUBSCRIBER_DAYS'),
      30,
      1,
      365,
    );
  }

  onModuleInit() {
    setTimeout(() => {
      void this.processQueueTick();
    }, 1_500);
  }

  async queueAnnouncement(params: QueueAnnouncementParams) {
    const message = String(params.message ?? '').trim();
    if (!message) {
      throw new BadRequestException('Announcement message is required');
    }
    if (message.length > 4000) {
      throw new BadRequestException('Announcement message exceeds 4000 characters');
    }

    const kind = params.kind ?? AnnouncementKind.ANNOUNCEMENT;
    const target = params.target ?? AnnouncementTarget.ALL;
    const normalizedTargetUserIds = this.normalizeTargetUserIds(
      params.targetUserIds,
    );

    if (target === AnnouncementTarget.USERS && normalizedTargetUserIds.length === 0) {
      throw new BadRequestException(
        'At least one user is required for user-targeted announcements',
      );
    }

    const requestedByUserId = params.requestedByUserId ?? null;
    const normalizedImagePaths = this.normalizeAnnouncementImagePaths(
      params.imagePaths,
    );
    const uploadedBuffers = Array.isArray(params.imageBuffers)
      ? params.imageBuffers
      : [];
    if (uploadedBuffers.length > MAX_ANNOUNCEMENT_IMAGES) {
      throw new BadRequestException(
        `You can upload at most ${MAX_ANNOUNCEMENT_IMAGES} announcement images`,
      );
    }
    if (
      uploadedBuffers.length > 0 &&
      normalizedImagePaths.length > 0
    ) {
      throw new BadRequestException(
        'Provide announcement images either as uploads or as existing image paths, not both',
      );
    }

    const uploadedImagePaths =
      uploadedBuffers.length > 0
        ? await this.announcementImageService.optimizeAndSaveMany(uploadedBuffers)
        : [];
    const effectiveImagePaths =
      uploadedImagePaths.length > 0 ? uploadedImagePaths : normalizedImagePaths;

    const safeLimit =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit > 0
        ? Math.min(Math.floor(params.limit), 50_000)
        : undefined;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const run = queryRunner.manager.create(AnnouncementRun, {
        message,
        imagePaths:
          effectiveImagePaths.length > 0 ? effectiveImagePaths : null,
        kind,
        target,
        targetUserIds:
          normalizedTargetUserIds.length > 0 ? normalizedTargetUserIds : null,
        requestedByUserId,
        status: AnnouncementRunStatus.QUEUED,
        totalRecipients: 0,
        pendingCount: 0,
        sentCount: 0,
        failedCount: 0,
        unknownCount: 0,
      });
      const savedRun = await queryRunner.manager.save(AnnouncementRun, run);

      const recipients = await this.getRecipients({
        target,
        targetUserIds: normalizedTargetUserIds,
        limit: safeLimit,
        queryRunner,
      });
      const uniqueRecipients = new Map<string, { userId: number | null; telegramId: string }>();
      for (const recipient of recipients) {
        const telegramId = String(recipient.telegramId ?? '').trim();
        if (!telegramId) continue;
        if (!uniqueRecipients.has(telegramId)) {
          uniqueRecipients.set(telegramId, {
            userId: recipient.userId,
            telegramId,
          });
        }
      }

      const deliveryRows = Array.from(uniqueRecipients.values()).map((recipient) => ({
        runId: savedRun.id,
        userId: recipient.userId,
        telegramId: recipient.telegramId,
        status: AnnouncementDeliveryStatus.PENDING,
        attemptCount: 0,
        nextAttemptAt: null,
        lastAttemptAt: null,
        sentAt: null,
        telegramMessageId: null,
        lastError: null,
        lockToken: null,
        lockExpiresAt: null,
      }));

      if (deliveryRows.length > 0) {
        for (let index = 0; index < deliveryRows.length; index += this.chunkInsertSize) {
          const chunk = deliveryRows.slice(index, index + this.chunkInsertSize);
          await queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(AnnouncementDelivery)
            .values(chunk)
            .execute();
        }
      }

      savedRun.totalRecipients = deliveryRows.length;
      savedRun.pendingCount = deliveryRows.length;
      if (deliveryRows.length === 0) {
        savedRun.status = AnnouncementRunStatus.COMPLETED;
        savedRun.startedAt = new Date();
        savedRun.finishedAt = new Date();
      }
      await queryRunner.manager.save(AnnouncementRun, savedRun);
      await queryRunner.commitTransaction();

      if (deliveryRows.length > 0) {
        void this.processQueueTick();
      }

      return savedRun;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async listRuns(page: number, limit: number) {
    const [data, total] = await this.runRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async getRun(id: number) {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) {
      throw new NotFoundException('Announcement run not found');
    }

    const deliverySummary = await this.getDeliveryStatusSummary(id);
    return { ...run, deliverySummary };
  }

  async listRunDeliveries(params: ListRunDeliveriesParams) {
    const run = await this.runRepo.findOne({ where: { id: params.runId } });
    if (!run) {
      throw new NotFoundException('Announcement run not found');
    }

    const baseQb = this.buildRunDeliveriesQuery(params.runId);
    this.applyDeliveryFilter(baseQb, params.filter ?? AnnouncementDeliveryFilter.ALL);

    const total = await baseQb.clone().getCount();
    const rows = await baseQb
      .orderBy('delivery.id', 'DESC')
      .skip((params.page - 1) * params.limit)
      .take(params.limit)
      .getRawMany<{
        deliveryId: number;
        status: AnnouncementDeliveryStatus;
        attemptCount: number;
        telegramId: string;
        telegramMessageId: string | null;
        sentAt: Date | null;
        lastAttemptAt: Date | null;
        nextAttemptAt: Date | null;
        lastError: string | null;
        userId: number | null;
        userFirstName: string | null;
        userUsername: string | null;
        userLoginUsername: string | null;
        subscriberFirstName: string | null;
        subscriberUsername: string | null;
      }>();

    return {
      data: rows.map((row) => ({
        id: Number(row.deliveryId),
        status: row.status,
        attemptCount: Number(row.attemptCount ?? 0),
        telegramId: String(row.telegramId ?? ''),
        telegramMessageId: row.telegramMessageId
          ? String(row.telegramMessageId)
          : null,
        sentAt: row.sentAt,
        lastAttemptAt: row.lastAttemptAt,
        nextAttemptAt: row.nextAttemptAt,
        lastError: row.lastError,
        recipient: {
          userId:
            row.userId !== null && row.userId !== undefined
              ? Number(row.userId)
              : null,
          firstName: row.userFirstName ?? row.subscriberFirstName ?? null,
          username:
            row.userUsername ??
            row.userLoginUsername ??
            row.subscriberUsername ??
            null,
          sourceUser: row.userId !== null && row.userId !== undefined,
        },
      })),
      total,
    };
  }

  async listAnnouncementUsers(params: ListAnnouncementUsersParams) {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .where('user.telegramId IS NOT NULL')
      .andWhere("TRIM(COALESCE(user.telegramId, '')) != ''");

    const searchValue = String(params.search ?? '').trim().toLowerCase();
    if (searchValue) {
      qb.andWhere(
        `(
          LOWER(COALESCE(user.firstName, '')) LIKE :search
          OR LOWER(COALESCE(user.username, '')) LIKE :search
          OR LOWER(COALESCE(user.loginUsername, '')) LIKE :search
          OR user.telegramId LIKE :search
        )`,
        { search: `%${searchValue}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('user.createdAt', 'DESC')
      .skip((params.page - 1) * params.limit)
      .take(params.limit)
      .getManyAndCount();

    return { data, total };
  }

  async repostRun(params: RepostRunParams) {
    const run = await this.runRepo.findOne({ where: { id: params.runId } });
    if (!run) {
      throw new NotFoundException('Announcement run not found');
    }

    return this.queueAnnouncement({
      message: run.message,
      imagePaths: run.imagePaths ?? undefined,
      kind: run.kind,
      target: run.target,
      targetUserIds: run.targetUserIds ?? undefined,
      requestedByUserId: params.requestedByUserId,
    });
  }

  async deleteRun(id: number) {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) {
      throw new NotFoundException('Announcement run not found');
    }

    if (
      run.status === AnnouncementRunStatus.QUEUED ||
      run.status === AnnouncementRunStatus.RUNNING
    ) {
      throw new BadRequestException(
        'Cannot delete an active Announcement. Cancel it first.',
      );
    }

    await this.runRepo.delete({ id });
    return { id, deleted: true };
  }

  async cancelRun(id: number) {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) {
      throw new NotFoundException('Announcement run not found');
    }
    if (
      (TERMINAL_RUN_STATUSES as readonly AnnouncementRunStatus[]).includes(
        run.status,
      )
    ) {
      return run;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const now = new Date();
      await queryRunner.manager.update(
        AnnouncementDelivery,
        {
          runId: id,
          status: In([
            AnnouncementDeliveryStatus.PENDING,
            AnnouncementDeliveryStatus.FAILED_RETRYABLE,
          ]),
        },
        {
          status: AnnouncementDeliveryStatus.FAILED_PERMANENT,
          nextAttemptAt: null,
          lockToken: null,
          lockExpiresAt: null,
          lastError: 'Announcement cancelled by admin',
        },
      );

      await queryRunner.manager.update(
        AnnouncementDelivery,
        {
          runId: id,
          status: AnnouncementDeliveryStatus.PROCESSING,
        },
        {
          status: AnnouncementDeliveryStatus.UNKNOWN,
          lockToken: null,
          lockExpiresAt: null,
          nextAttemptAt: null,
          lastError:
            'Delivery outcome unknown because Announcement was cancelled mid-flight',
        },
      );

      await queryRunner.manager.update(
        AnnouncementRun,
        { id },
        {
          status: AnnouncementRunStatus.CANCELLED,
          finishedAt: now,
          lastHeartbeatAt: now,
          lockToken: null,
          lockExpiresAt: null,
        },
      );

      await queryRunner.commitTransaction();
      await this.refreshRunCounters(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    const updated = await this.runRepo.findOne({ where: { id } });
    if (!updated) {
      throw new NotFoundException('Announcement run not found');
    }
    return updated;
  }

  async requeueUnknownDeliveries(id: number) {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) {
      throw new NotFoundException('Announcement run not found');
    }
    if (run.status === AnnouncementRunStatus.RUNNING) {
      throw new BadRequestException('Cannot requeue unknown deliveries while run is active');
    }

    const result = await this.deliveryRepo.update(
      {
        runId: id,
        status: AnnouncementDeliveryStatus.UNKNOWN,
      },
      {
        status: AnnouncementDeliveryStatus.PENDING,
        nextAttemptAt: null,
        lockToken: null,
        lockExpiresAt: null,
        lastError: null,
      },
    );

    if ((result.affected ?? 0) > 0) {
      await this.runRepo.update(
        { id },
        {
          status: AnnouncementRunStatus.QUEUED,
          finishedAt: null,
          lockToken: null,
          lockExpiresAt: null,
        },
      );
      await this.refreshRunCounters(id);
      void this.processQueueTick();
    }

    return {
      runId: id,
      requeued: result.affected ?? 0,
    };
  }

  @Cron('*/20 * * * * *')
  async processQueueCron() {
    await this.processQueueTick();
  }

  @Cron('15 3 * * *')
  async purgeOldRunsCron() {
    await this.purgeOldRuns();
  }

  async processQueueTick() {
    if (this.tickInFlight) return;
    this.tickInFlight = true;
    try {
      await this.markGloballyStaleProcessingAsUnknown();
      const claimed = await this.claimNextRun();
      if (!claimed) return;
      await this.processClaimedRun(claimed.run, claimed.lockToken);
    } catch (error) {
      this.logger.error('Announcement queue tick failed', error as Error);
    } finally {
      this.tickInFlight = false;
    }
  }

  async purgeOldRuns() {
    const cutoff = new Date(
      Date.now() - this.retentionDays * 24 * 60 * 60 * 1000,
    );
    await this.runRepo.delete({
      status: In([...TERMINAL_RUN_STATUSES]),
      finishedAt: LessThan(cutoff),
    });
  }

  private async processClaimedRun(run: AnnouncementRun, lockToken: string) {
    for (let batch = 0; batch < this.maxBatchesPerTick; batch += 1) {
      const stillLocked = await this.renewRunLock(run.id, lockToken);
      if (!stillLocked) {
        return;
      }

      const claimedDeliveries = await this.claimDeliveries(run.id, lockToken);
      if (claimedDeliveries.length === 0) {
        break;
      }

      await this.processWithConcurrency(
        claimedDeliveries,
        this.concurrency,
        async (delivery) => this.sendDelivery(run, delivery, lockToken),
      );
    }

    await this.markRunStaleProcessingAsUnknown(run.id);
    await this.refreshRunCounters(run.id);
    await this.finalizeRunIfComplete(run.id, lockToken);
  }

  private async finalizeRunIfComplete(runId: number, lockToken: string) {
    const summary = await this.getDeliveryStatusSummary(runId);
    const activeCount =
      summary[AnnouncementDeliveryStatus.PENDING] +
      summary[AnnouncementDeliveryStatus.FAILED_RETRYABLE] +
      summary[AnnouncementDeliveryStatus.PROCESSING];

    if (activeCount > 0) {
      return;
    }

    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) return;
    if (run.status === AnnouncementRunStatus.CANCELLED) {
      await this.releaseRunLock(runId, lockToken);
      return;
    }

    const errors =
      summary[AnnouncementDeliveryStatus.FAILED_PERMANENT] +
      summary[AnnouncementDeliveryStatus.UNKNOWN];
    await this.runRepo
      .createQueryBuilder()
      .update(AnnouncementRun)
      .set({
        status:
          errors > 0
            ? AnnouncementRunStatus.COMPLETED_WITH_ERRORS
            : AnnouncementRunStatus.COMPLETED,
        finishedAt: new Date(),
        lockToken: null,
        lockExpiresAt: null,
        lastHeartbeatAt: new Date(),
      })
      .where('id = :id', { id: runId })
      .andWhere('lockToken = :lockToken', { lockToken })
      .execute();
  }

  private async claimNextRun(): Promise<{ run: AnnouncementRun; lockToken: string } | null> {
    const now = new Date();
    const candidate = await this.runRepo
      .createQueryBuilder('run')
      .where('run.status IN (:...statuses)', {
        statuses: [AnnouncementRunStatus.QUEUED, AnnouncementRunStatus.RUNNING],
      })
      .andWhere('(run.lockExpiresAt IS NULL OR run.lockExpiresAt < :now)', { now })
      .orderBy(
        "CASE WHEN run.status = 'QUEUED' THEN 0 ELSE 1 END",
        'ASC',
      )
      .addOrderBy('run.createdAt', 'ASC')
      .getOne();

    if (!candidate) return null;

    const lockToken = `${this.nodeToken}-${randomUUID().slice(0, 8)}`;
    const leaseUntil = new Date(Date.now() + this.runLeaseMs);
    const result = await this.runRepo
      .createQueryBuilder()
      .update(AnnouncementRun)
      .set({
        status: AnnouncementRunStatus.RUNNING,
        lockToken,
        lockExpiresAt: leaseUntil,
        startedAt: () => 'COALESCE(`startedAt`, CURRENT_TIMESTAMP)',
        lastHeartbeatAt: new Date(),
      })
      .where('id = :id', { id: candidate.id })
      .andWhere('status IN (:...statuses)', {
        statuses: [AnnouncementRunStatus.QUEUED, AnnouncementRunStatus.RUNNING],
      })
      .andWhere('(lockExpiresAt IS NULL OR lockExpiresAt < :now)', { now })
      .execute();

    if ((result.affected ?? 0) === 0) {
      return null;
    }

    const claimedRun = await this.runRepo.findOne({ where: { id: candidate.id } });
    if (!claimedRun) return null;
    return { run: claimedRun, lockToken };
  }

  private async renewRunLock(runId: number, lockToken: string): Promise<boolean> {
    const result = await this.runRepo
      .createQueryBuilder()
      .update(AnnouncementRun)
      .set({
        lockExpiresAt: new Date(Date.now() + this.runLeaseMs),
        lastHeartbeatAt: new Date(),
      })
      .where('id = :id', { id: runId })
      .andWhere('lockToken = :lockToken', { lockToken })
      .andWhere('status = :status', { status: AnnouncementRunStatus.RUNNING })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  private async releaseRunLock(runId: number, lockToken: string) {
    await this.runRepo
      .createQueryBuilder()
      .update(AnnouncementRun)
      .set({
        lockToken: null,
        lockExpiresAt: null,
        lastHeartbeatAt: new Date(),
      })
      .where('id = :id', { id: runId })
      .andWhere('lockToken = :lockToken', { lockToken })
      .execute();
  }

  private async claimDeliveries(runId: number, lockToken: string) {
    const now = new Date();
    const candidateRows = await this.deliveryRepo
      .createQueryBuilder('delivery')
      .where('delivery.runId = :runId', { runId })
      .andWhere('delivery.status IN (:...statuses)', {
        statuses: [
          AnnouncementDeliveryStatus.PENDING,
          AnnouncementDeliveryStatus.FAILED_RETRYABLE,
        ],
      })
      .andWhere(
        '(delivery.nextAttemptAt IS NULL OR delivery.nextAttemptAt <= :now)',
        { now },
      )
      .andWhere('(delivery.lockExpiresAt IS NULL OR delivery.lockExpiresAt < :now)', {
        now,
      })
      .orderBy('delivery.id', 'ASC')
      .limit(this.batchSize * 2)
      .getMany();

    const claimedIds: number[] = [];
    for (const candidate of candidateRows) {
      if (claimedIds.length >= this.batchSize) break;
      const claimResult = await this.deliveryRepo
        .createQueryBuilder()
        .update(AnnouncementDelivery)
        .set({
          status: AnnouncementDeliveryStatus.PROCESSING,
          lockToken,
          lockExpiresAt: new Date(Date.now() + this.deliveryLeaseMs),
          lastAttemptAt: now,
          nextAttemptAt: null,
          lastError: null,
          attemptCount: () => '`attemptCount` + 1',
        })
        .where('id = :id', { id: candidate.id })
        .andWhere('status IN (:...statuses)', {
          statuses: [
            AnnouncementDeliveryStatus.PENDING,
            AnnouncementDeliveryStatus.FAILED_RETRYABLE,
          ],
        })
        .andWhere('(lockExpiresAt IS NULL OR lockExpiresAt < :now)', { now })
        .execute();

      if ((claimResult.affected ?? 0) > 0) {
        claimedIds.push(candidate.id);
      }
    }

    if (claimedIds.length === 0) {
      return [];
    }

    return this.deliveryRepo.find({
      where: {
        id: In(claimedIds),
      },
      order: {
        id: 'ASC',
      },
    });
  }

  private async sendDelivery(
    run: AnnouncementRun,
    delivery: AnnouncementDelivery,
    lockToken: string,
  ) {
    try {
      const response = await this.botService.sendAnnouncementMessage(
        delivery.telegramId,
        run.message,
        run.imagePaths ?? undefined,
      );

      await this.deliveryRepo
        .createQueryBuilder()
        .update(AnnouncementDelivery)
        .set({
          status: AnnouncementDeliveryStatus.SENT,
          sentAt: new Date(),
          nextAttemptAt: null,
          lockToken: null,
          lockExpiresAt: null,
          lastError: null,
          telegramMessageId: String(response.messageId),
        })
        .where('id = :id', { id: delivery.id })
        .andWhere('status = :status', { status: AnnouncementDeliveryStatus.PROCESSING })
        .andWhere('lockToken = :lockToken', { lockToken })
        .execute();
    } catch (error) {
      const { retryable, message, deactivateSubscriber } =
        this.classifyTelegramError(error);
      const nextAttemptMs = this.getNextBackoffMs(delivery.attemptCount);
      const shouldRetry = retryable && delivery.attemptCount < this.maxAttempts;

      await this.deliveryRepo
        .createQueryBuilder()
        .update(AnnouncementDelivery)
        .set({
          status: shouldRetry
            ? AnnouncementDeliveryStatus.FAILED_RETRYABLE
            : AnnouncementDeliveryStatus.FAILED_PERMANENT,
          nextAttemptAt: shouldRetry
            ? new Date(Date.now() + nextAttemptMs)
            : null,
          lockToken: null,
          lockExpiresAt: null,
          lastError: message,
        })
        .where('id = :id', { id: delivery.id })
        .andWhere('status = :status', { status: AnnouncementDeliveryStatus.PROCESSING })
        .andWhere('lockToken = :lockToken', { lockToken })
        .execute();

      if (deactivateSubscriber) {
        try {
          await this.botService.markSubscriberInactive(delivery.telegramId);
        } catch (markError) {
          this.logger.warn(
            `Failed to mark subscriber ${delivery.telegramId} inactive: ${
              (markError as Error).message
            }`,
          );
        }
      }
    }
  }

  private async markGloballyStaleProcessingAsUnknown() {
    const staleBefore = new Date(Date.now() - this.staleProcessingGraceMs);
    await this.deliveryRepo
      .createQueryBuilder()
      .update(AnnouncementDelivery)
      .set({
        status: AnnouncementDeliveryStatus.UNKNOWN,
        lockToken: null,
        lockExpiresAt: null,
        nextAttemptAt: null,
        lastError:
          'Delivery outcome unknown after worker interruption. Not retried automatically to avoid duplicate sends.',
      })
      .where('status = :status', { status: AnnouncementDeliveryStatus.PROCESSING })
      .andWhere('lockExpiresAt IS NOT NULL')
      .andWhere('lockExpiresAt < :staleBefore', { staleBefore })
      .execute();
  }

  private async markRunStaleProcessingAsUnknown(runId: number) {
    const staleBefore = new Date(Date.now() - this.staleProcessingGraceMs);
    await this.deliveryRepo
      .createQueryBuilder()
      .update(AnnouncementDelivery)
      .set({
        status: AnnouncementDeliveryStatus.UNKNOWN,
        lockToken: null,
        lockExpiresAt: null,
        nextAttemptAt: null,
        lastError:
          'Delivery outcome unknown after worker interruption. Not retried automatically to avoid duplicate sends.',
      })
      .where('runId = :runId', { runId })
      .andWhere('status = :status', { status: AnnouncementDeliveryStatus.PROCESSING })
      .andWhere('lockExpiresAt IS NOT NULL')
      .andWhere('lockExpiresAt < :staleBefore', { staleBefore })
      .execute();
  }

  private async refreshRunCounters(runId: number) {
    const summary = await this.getDeliveryStatusSummary(runId);
    const pending =
      summary[AnnouncementDeliveryStatus.PENDING] +
      summary[AnnouncementDeliveryStatus.FAILED_RETRYABLE] +
      summary[AnnouncementDeliveryStatus.PROCESSING];

    await this.runRepo.update(
      { id: runId },
      {
        totalRecipients: Object.values(summary).reduce((sum, count) => sum + count, 0),
        pendingCount: pending,
        sentCount: summary[AnnouncementDeliveryStatus.SENT],
        failedCount: summary[AnnouncementDeliveryStatus.FAILED_PERMANENT],
        unknownCount: summary[AnnouncementDeliveryStatus.UNKNOWN],
      },
    );
  }

  private async getDeliveryStatusSummary(runId: number) {
    const rows = await this.deliveryRepo
      .createQueryBuilder('delivery')
      .select('delivery.status', 'status')
      .addSelect('COUNT(delivery.id)', 'count')
      .where('delivery.runId = :runId', { runId })
      .groupBy('delivery.status')
      .getRawMany<{ status: AnnouncementDeliveryStatus; count: string }>();

    const summary: Record<AnnouncementDeliveryStatus, number> = {
      [AnnouncementDeliveryStatus.PENDING]: 0,
      [AnnouncementDeliveryStatus.PROCESSING]: 0,
      [AnnouncementDeliveryStatus.SENT]: 0,
      [AnnouncementDeliveryStatus.FAILED_RETRYABLE]: 0,
      [AnnouncementDeliveryStatus.FAILED_PERMANENT]: 0,
      [AnnouncementDeliveryStatus.UNKNOWN]: 0,
    };

    for (const row of rows) {
      if (row.status in summary) {
        summary[row.status] = Number.parseInt(row.count, 10) || 0;
      }
    }
    return summary;
  }

  private classifyTelegramError(error: unknown): {
    retryable: boolean;
    message: string;
    deactivateSubscriber: boolean;
  } {
    const response = (error as any)?.response ?? {};
    const code = Number(response?.error_code);
    const text = String(
      response?.description ??
        (error as any)?.description ??
        (error as any)?.message ??
        'Unknown Telegram error',
    );
    const normalized = text.toLowerCase();

    const blockedOrUnavailable =
      normalized.includes('blocked by the user') ||
      normalized.includes('chat not found') ||
      normalized.includes('user is deactivated') ||
      normalized.includes('bot was kicked');

    const definitelyPermanent =
      code === 400 ||
      code === 403 ||
      blockedOrUnavailable ||
      normalized.includes('have no rights to send');

    return {
      retryable: !definitelyPermanent,
      message: text.slice(0, 512),
      deactivateSubscriber: definitelyPermanent && blockedOrUnavailable,
    };
  }

  private getNextBackoffMs(attemptCount: number): number {
    const backoffMinutes = [1, 5, 30, 120, 360];
    const idx = Math.min(Math.max(attemptCount - 1, 0), backoffMinutes.length - 1);
    return backoffMinutes[idx] * 60 * 1000;
  }

  private buildRunDeliveriesQuery(runId: number) {
    return this.deliveryRepo
      .createQueryBuilder('delivery')
      .leftJoin(User, 'user', 'user.id = delivery.userId')
      .leftJoin(
        BotSubscriber,
        'subscriber',
        'subscriber.telegramId = delivery.telegramId',
      )
      .select('delivery.id', 'deliveryId')
      .addSelect('delivery.status', 'status')
      .addSelect('delivery.attemptCount', 'attemptCount')
      .addSelect('delivery.telegramId', 'telegramId')
      .addSelect('delivery.telegramMessageId', 'telegramMessageId')
      .addSelect('delivery.sentAt', 'sentAt')
      .addSelect('delivery.lastAttemptAt', 'lastAttemptAt')
      .addSelect('delivery.nextAttemptAt', 'nextAttemptAt')
      .addSelect('delivery.lastError', 'lastError')
      .addSelect('user.id', 'userId')
      .addSelect('user.firstName', 'userFirstName')
      .addSelect('user.username', 'userUsername')
      .addSelect('user.loginUsername', 'userLoginUsername')
      .addSelect('subscriber.firstName', 'subscriberFirstName')
      .addSelect('subscriber.username', 'subscriberUsername')
      .where('delivery.runId = :runId', { runId });
  }

  private applyDeliveryFilter(
    qb: SelectQueryBuilder<AnnouncementDelivery>,
    filter: AnnouncementDeliveryFilter,
  ) {
    switch (filter) {
      case AnnouncementDeliveryFilter.SENT:
        qb.andWhere('delivery.status = :status', {
          status: AnnouncementDeliveryStatus.SENT,
        });
        break;
      case AnnouncementDeliveryFilter.NOT_SENT:
        qb.andWhere('delivery.status IN (:...statuses)', {
          statuses: [
            AnnouncementDeliveryStatus.PENDING,
            AnnouncementDeliveryStatus.PROCESSING,
            AnnouncementDeliveryStatus.FAILED_RETRYABLE,
            AnnouncementDeliveryStatus.FAILED_PERMANENT,
            AnnouncementDeliveryStatus.UNKNOWN,
          ],
        });
        break;
      case AnnouncementDeliveryFilter.FAILED:
        qb.andWhere('delivery.status IN (:...statuses)', {
          statuses: [
            AnnouncementDeliveryStatus.FAILED_RETRYABLE,
            AnnouncementDeliveryStatus.FAILED_PERMANENT,
          ],
        });
        break;
      case AnnouncementDeliveryFilter.UNKNOWN:
        qb.andWhere('delivery.status = :status', {
          status: AnnouncementDeliveryStatus.UNKNOWN,
        });
        break;
      case AnnouncementDeliveryFilter.PENDING:
        qb.andWhere('delivery.status IN (:...statuses)', {
          statuses: [
            AnnouncementDeliveryStatus.PENDING,
            AnnouncementDeliveryStatus.PROCESSING,
            AnnouncementDeliveryStatus.FAILED_RETRYABLE,
          ],
        });
        break;
      case AnnouncementDeliveryFilter.ALL:
      default:
        break;
    }
  }

  private normalizeTargetUserIds(userIds?: number[]): number[] {
    if (!Array.isArray(userIds)) {
      return [];
    }

    const unique = new Set<number>();
    for (const value of userIds) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) continue;
      const safe = Math.floor(parsed);
      if (safe < 1) continue;
      unique.add(safe);
      if (unique.size >= 5000) {
        break;
      }
    }

    return Array.from(unique.values());
  }

  private async getRecipients(params: {
    target: AnnouncementTarget;
    targetUserIds: number[];
    limit: number | undefined;
    queryRunner: QueryRunner;
  }) {
    if (
      params.target === AnnouncementTarget.BOT_SUBSCRIBERS ||
      params.target === AnnouncementTarget.ACTIVE_BOT_SUBSCRIBERS
    ) {
      const subscriberQb = params.queryRunner.manager
        .getRepository(BotSubscriber)
        .createQueryBuilder('subscriber')
        .select('subscriber.telegramId', 'telegramId')
        .addSelect('user.id', 'userId')
        .leftJoin(User, 'user', 'user.telegramId = subscriber.telegramId')
        .where('subscriber.isActive = :isActive', { isActive: true })
        .orderBy('subscriber.id', 'ASC');

      if (params.target === AnnouncementTarget.ACTIVE_BOT_SUBSCRIBERS) {
        const cutoff = new Date(
          Date.now() - this.activeSubscriberDays * 24 * 60 * 60 * 1000,
        );
        subscriberQb.andWhere('subscriber.lastSeenAt IS NOT NULL');
        subscriberQb.andWhere('subscriber.lastSeenAt >= :cutoff', { cutoff });
      }

      if (params.limit !== undefined) {
        subscriberQb.limit(params.limit);
      }

      const rows = await subscriberQb.getRawMany<{
        userId: number | null;
        telegramId: string;
      }>();
      return rows.map((row) => ({
        userId:
          typeof row.userId === 'number'
            ? row.userId
            : Number.parseInt(String(row.userId), 10) || null,
        telegramId: String(row.telegramId ?? '').trim(),
      }));
    }

    const userQb = params.queryRunner.manager
      .getRepository(User)
      .createQueryBuilder('user')
      .select('user.id', 'userId')
      .addSelect('user.telegramId', 'telegramId')
      .where('user.telegramId IS NOT NULL')
      .andWhere("TRIM(COALESCE(user.telegramId, '')) != ''");

    if (params.target === AnnouncementTarget.USERS) {
      if (params.targetUserIds.length === 0) {
        return [];
      }
      userQb.andWhere('user.id IN (:...targetUserIds)', {
        targetUserIds: params.targetUserIds,
      });
    }

    userQb.orderBy('user.id', 'ASC');
    if (params.limit !== undefined) {
      userQb.limit(params.limit);
    }

    const rows = await userQb.getRawMany<{
      userId: number | null;
      telegramId: string;
    }>();

    return rows.map((row) => ({
      userId:
        typeof row.userId === 'number'
          ? row.userId
          : Number.parseInt(String(row.userId), 10) || null,
      telegramId: String(row.telegramId ?? '').trim(),
    }));
  }

  private async processWithConcurrency<T>(
    items: T[],
    concurrency: number,
    task: (item: T) => Promise<void>,
  ) {
    if (items.length === 0) return;
    const workers = new Array(Math.min(concurrency, items.length))
      .fill(0)
      .map(async (_entry, workerIdx) => {
        for (let idx = workerIdx; idx < items.length; idx += concurrency) {
          await task(items[idx]);
        }
      });
    await Promise.all(workers);
  }

  private normalizeNumber(
    value: number | undefined,
    fallback: number,
    min: number,
    max: number,
  ) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(Math.max(Math.floor(value as number), min), max);
  }

  private normalizeAnnouncementImagePaths(imagePaths?: string[]): string[] {
    if (!Array.isArray(imagePaths)) return [];
    const normalized = imagePaths
      .map((path) => String(path ?? '').trim())
      .filter((path) => path.startsWith('/uploads/announcements/'));
    const unique = [...new Set(normalized)];
    if (unique.length > MAX_ANNOUNCEMENT_IMAGES) {
      throw new BadRequestException(
        `You can attach at most ${MAX_ANNOUNCEMENT_IMAGES} announcement images`,
      );
    }
    return unique;
  }
}

