import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { buildPaginationMeta } from '../../common/pagination';
import { Ad, AdStatus } from './entities/ad.entity';
import { AdComment } from './entities/ad-comment.entity';
import { CreateAdCommentDto } from './dto/create-ad-comment.dto';
import { UpdateAdCommentDto } from './dto/update-ad-comment.dto';
import { User } from '../users/entities/user.entity';
import { BotService } from '../bot/bot.service';

const MAX_REPLY_DEPTH = 3;

type AdCommentRow = {
  id: string;
  adId: string;
  userId: string;
  parentId: string | null;
  depth: string;
  rating: string | null;
  comment: string | null;
  isEdited: 0 | 1 | boolean;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  firstName: string | null;
  username: string | null;
  avatarUrl: string | null;
  isReviewBlocked: 0 | 1 | boolean | null;
};

export type MappedAdComment = {
  id: number;
  adId: number;
  userId: number;
  parentId: number | null;
  depth: number;
  rating: number | null;
  comment: string | null;
  isEdited: boolean;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
    isReviewBlocked: boolean;
  };
  replies: MappedAdComment[];
};

@Injectable()
export class AdCommentsService {
  constructor(
    @InjectRepository(Ad)
    private readonly adRepo: Repository<Ad>,
    @InjectRepository(AdComment)
    private readonly adCommentRepo: Repository<AdComment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly botService: BotService,
  ) {}

  async getAdComments(
    adId: number,
    pagination?: {
      page: number;
      limit: number;
    },
  ) {
    await this.assertAdExistsForPublicView(adId);
    return this.fetchCommentsWithMeta(adId, {
      includeReplies: true,
      page: pagination?.page,
      limit: pagination?.limit,
    });
  }

  async createOrUpdateAdComment(
    adId: number,
    userId: number,
    dto: CreateAdCommentDto,
  ) {
    const ad = await this.getAdForPublicView(adId);
    const user = await this.getReviewAuthorOrThrow(userId);
    const normalizedComment = this.normalizeOptionalComment(dto.comment);
    const parentId = this.normalizeOptionalParentId(dto.parentId);
    const hasRating = dto.rating !== undefined && dto.rating !== null;
    const normalizedRating = hasRating
      ? this.normalizeRequiredRating(dto.rating)
      : null;

    if (parentId !== null) {
      if (hasRating) {
        throw new BadRequestException('Replies cannot include rating');
      }
      if (!normalizedComment) {
        throw new BadRequestException('Reply cannot be empty');
      }

      const savedReply = await this.createReply({
        adId,
        userId,
        parentId,
        comment: normalizedComment,
      });

      await this.notifyAdCreatorAboutReviewActivity(ad, user, {
        isRatingChanged: false,
        isNewComment: true,
        rating: null,
        comment: savedReply.comment,
      });

      return {
        data: this.mapSavedAdComment(savedReply, user),
        meta: await this.getAdCommentMeta(adId),
      };
    }

    if (!hasRating && !normalizedComment) {
      throw new BadRequestException('Provide a rating, a comment, or both');
    }

    let ratingUpdate:
      | {
          saved: AdComment;
          isNewRating: boolean;
          hasChanged: boolean;
        }
      | null = null;
    let createdComment: AdComment | null = null;

    if (hasRating && normalizedRating !== null) {
      ratingUpdate = await this.upsertUserRating(adId, userId, normalizedRating);
    }

    if (normalizedComment) {
      createdComment = await this.createTopLevelComment({
        adId,
        userId,
        comment: normalizedComment,
      });
    }

    const ratingChanged = Boolean(
      ratingUpdate && (ratingUpdate.isNewRating || ratingUpdate.hasChanged),
    );

    if (ratingChanged || createdComment) {
      await this.notifyAdCreatorAboutReviewActivity(ad, user, {
        isRatingChanged: ratingChanged,
        isNewComment: Boolean(createdComment),
        rating: ratingChanged ? normalizedRating : null,
        comment: createdComment?.comment ?? null,
      });
    }

    const responseComment = createdComment ?? ratingUpdate?.saved ?? null;
    if (!responseComment) {
      throw new BadRequestException('No review action was applied');
    }

    return {
      data: this.mapSavedAdComment(responseComment, user),
      meta: await this.getAdCommentMeta(adId),
    };
  }

  async editAdComment(
    adId: number,
    userId: number,
    commentId: number,
    dto: UpdateAdCommentDto,
  ) {
    await this.assertAdExistsForPublicView(adId);
    const user = await this.getReviewAuthorOrThrow(userId);
    const normalizedComment = this.normalizeOptionalComment(dto.comment);
    if (!normalizedComment) {
      throw new BadRequestException('Comment cannot be empty');
    }

    const existing = await this.adCommentRepo.findOne({
      where: { id: commentId, adId },
    });
    if (!existing) {
      throw new NotFoundException('Comment not found');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }
    if (!existing.comment?.trim()) {
      throw new BadRequestException('Only text comments can be edited');
    }

    const hasChanges = (existing.comment ?? null) !== normalizedComment;
    if (hasChanges) {
      existing.comment = normalizedComment;
      existing.isEdited = true;
      existing.editedAt = new Date();
      await this.adCommentRepo.save(existing);
    }

    return {
      data: this.mapSavedAdComment(existing, user),
      meta: await this.getAdCommentMeta(adId),
    };
  }

  async getAdCommentsForAdmin(adId: number) {
    await this.assertAdExists(adId);
    return this.fetchCommentsWithMeta(adId, { includeReplies: true });
  }

  async removeAdComment(adId: number, commentId: number) {
    await this.assertAdExists(adId);

    const existing = await this.adCommentRepo.findOne({
      where: { id: commentId, adId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Review not found');
    }

    await this.adCommentRepo.delete({ id: commentId, adId });
    return {
      success: true,
      meta: await this.getAdCommentMeta(adId),
    };
  }

  async removeOwnAdComment(adId: number, userId: number, commentId: number) {
    await this.assertAdExistsForPublicView(adId);

    const existing = await this.adCommentRepo.findOne({
      where: { id: commentId, adId },
      select: { id: true, userId: true },
    });
    if (!existing) {
      throw new NotFoundException('Comment not found');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    await this.adCommentRepo.delete({ id: commentId, adId });
    return {
      success: true,
      meta: await this.getAdCommentMeta(adId),
    };
  }

  async blockReviewerFromReviews(adId: number, commentId: number) {
    await this.assertAdExists(adId);

    const review = await this.adCommentRepo.findOne({
      where: { id: commentId, adId },
      select: { id: true, userId: true },
    });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const user = await this.userRepo.findOne({
      where: { id: review.userId },
      select: { id: true, isReviewBlocked: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isReviewBlocked) {
      user.isReviewBlocked = true;
      await this.userRepo.save(user);
    }

    return {
      success: true,
      data: {
        userId: user.id,
        isReviewBlocked: true,
      },
    };
  }

  async unblockReviewerFromReviews(adId: number, commentId: number) {
    await this.assertAdExists(adId);

    const review = await this.adCommentRepo.findOne({
      where: { id: commentId, adId },
      select: { id: true, userId: true },
    });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const user = await this.userRepo.findOne({
      where: { id: review.userId },
      select: { id: true, isReviewBlocked: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isReviewBlocked) {
      user.isReviewBlocked = false;
      await this.userRepo.save(user);
    }

    return {
      success: true,
      data: {
        userId: user.id,
        isReviewBlocked: false,
      },
    };
  }

  private async fetchCommentsWithMeta(
    adId: number,
    options: { includeReplies: boolean; page?: number; limit?: number },
  ) {
    const shouldPaginatePublicComments =
      options.includeReplies &&
      typeof options.page === 'number' &&
      typeof options.limit === 'number';

    if (shouldPaginatePublicComments) {
      const [meta, paginatedRows] = await Promise.all([
        this.getAdCommentMeta(adId),
        this.fetchPaginatedCommentRows(adId, options.page!, options.limit!),
      ]);

      const mapped = paginatedRows.rows.map((row) => this.mapAdCommentRow(row));
      return {
        data: this.buildCommentTree(mapped),
        meta: {
          ...meta,
          comments: buildPaginationMeta(
            paginatedRows.total,
            options.page!,
            options.limit!,
          ),
        },
      };
    }

    const commentsQuery = this.buildCommentListQuery(adId);
    if (!options.includeReplies) {
      commentsQuery.andWhere('comment.parentId IS NULL');
    }
    commentsQuery.orderBy('comment.createdAt', options.includeReplies ? 'ASC' : 'DESC');

    const [rows, meta] = await Promise.all([
      commentsQuery.getRawMany<AdCommentRow>(),
      this.getAdCommentMeta(adId),
    ]);

    const mapped = rows.map((row) => this.mapAdCommentRow(row));
    const data = options.includeReplies
      ? this.buildCommentTree(mapped)
      : mapped;

    return { data, meta };
  }

  private buildCommentListQuery(adId: number) {
    return this.adCommentRepo
      .createQueryBuilder('comment')
      .leftJoin('comment.user', 'user')
      .select('comment.id', 'id')
      .addSelect('comment.adId', 'adId')
      .addSelect('comment.userId', 'userId')
      .addSelect('comment.parentId', 'parentId')
      .addSelect('comment.depth', 'depth')
      .addSelect('comment.rating', 'rating')
      .addSelect('comment.comment', 'comment')
      .addSelect('comment.isEdited', 'isEdited')
      .addSelect('comment.editedAt', 'editedAt')
      .addSelect('comment.createdAt', 'createdAt')
      .addSelect('comment.updatedAt', 'updatedAt')
      .addSelect('user.firstName', 'firstName')
      .addSelect('user.username', 'username')
      .addSelect('user.avatarUrl', 'avatarUrl')
      .addSelect('user.isReviewBlocked', 'isReviewBlocked')
      .where('comment.adId = :adId', { adId });
  }

  private async fetchPaginatedCommentRows(adId: number, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const rootBaseQuery = this.buildCommentListQuery(adId)
      .andWhere('comment.parentId IS NULL')
      .andWhere('comment.comment IS NOT NULL');

    const [total, rootRows] = await Promise.all([
      this.adCommentRepo
        .createQueryBuilder('comment')
        .where('comment.adId = :adId', { adId })
        .andWhere('comment.parentId IS NULL')
        .andWhere('comment.comment IS NOT NULL')
        .getCount(),
      rootBaseQuery
        .orderBy('comment.createdAt', 'DESC')
        .addOrderBy('comment.id', 'DESC')
        .skip(skip)
        .take(limit)
        .getRawMany<AdCommentRow>(),
    ]);

    const ratingRows = await this.buildCommentListQuery(adId)
      .andWhere('comment.parentId IS NULL')
      .andWhere('comment.rating IS NOT NULL')
      .andWhere('comment.comment IS NULL')
      .orderBy('comment.createdAt', 'DESC')
      .addOrderBy('comment.id', 'DESC')
      .getRawMany<AdCommentRow>();

    if (rootRows.length === 0) {
      return {
        rows: ratingRows,
        total,
      };
    }

    const rows = [...rootRows, ...ratingRows];
    let parentIds = this.extractCommentIds(rootRows);

    while (parentIds.length > 0) {
      const replyRows = await this.buildCommentListQuery(adId)
        .andWhere('comment.parentId IN (:...parentIds)', { parentIds })
        .orderBy('comment.createdAt', 'ASC')
        .addOrderBy('comment.id', 'ASC')
        .getRawMany<AdCommentRow>();

      if (replyRows.length === 0) {
        break;
      }

      rows.push(...replyRows);
      parentIds = this.extractCommentIds(replyRows);
    }

    return { rows, total };
  }

  private extractCommentIds(rows: AdCommentRow[]) {
    return rows
      .map((row) => Number.parseInt(row.id, 10))
      .filter((id) => Number.isFinite(id));
  }

  private buildCommentTree(comments: MappedAdComment[]): MappedAdComment[] {
    const byId = new Map<number, MappedAdComment>();
    for (const comment of comments) {
      comment.replies = [];
      byId.set(comment.id, comment);
    }

    const roots: MappedAdComment[] = [];
    for (const comment of comments) {
      if (comment.parentId === null) {
        roots.push(comment);
        continue;
      }

      const parent = byId.get(comment.parentId);
      if (!parent) {
        roots.push(comment);
        continue;
      }

      parent.replies.push(comment);
    }

    roots.sort(
      (a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt),
    );
    for (const root of roots) {
      this.sortRepliesChronologically(root.replies);
    }

    return roots;
  }

  private sortRepliesChronologically(replies: MappedAdComment[]) {
    replies.sort(
      (a, b) => this.toTimestamp(a.createdAt) - this.toTimestamp(b.createdAt),
    );
    for (const reply of replies) {
      if (reply.replies.length > 0) {
        this.sortRepliesChronologically(reply.replies);
      }
    }
  }

  private toTimestamp(value: Date): number {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private async assertAdExists(adId: number) {
    const ad = await this.adRepo.findOne({
      where: { id: adId },
      select: { id: true },
    });
    if (!ad) {
      throw new NotFoundException('Ad not found');
    }
  }

  private async getAdForPublicView(adId: number) {
    const ad = await this.adRepo.findOne({
      where: { id: adId, status: AdStatus.APPROVED, isActive: true },
      select: { id: true, name: true, createdById: true, merchantId: true },
    });
    if (!ad) {
      throw new NotFoundException('Ad not found');
    }
    return ad;
  }

  private async assertAdExistsForPublicView(adId: number) {
    await this.getAdForPublicView(adId);
  }

  private async getAdCommentMeta(adId: number) {
    const row = await this.adCommentRepo
      .createQueryBuilder('comment')
      .select('COUNT(comment.id)', 'totalReviews')
      .addSelect('AVG(comment.rating)', 'averageRating')
      .where('comment.adId = :adId', { adId })
      .andWhere('comment.parentId IS NULL')
      .andWhere('comment.rating IS NOT NULL')
      .getRawOne<{
        totalReviews: string | null;
        averageRating: string | null;
      }>();

    const totalReviews = Number.parseInt(row?.totalReviews ?? '0', 10) || 0;
    const averageRaw = Number.parseFloat(row?.averageRating ?? '0');
    const averageRating = Number.isFinite(averageRaw)
      ? Math.round(averageRaw * 10) / 10
      : 0;

    return {
      totalReviews,
      averageRating,
    };
  }

  private mapAdCommentRow(row: AdCommentRow): MappedAdComment {
    const firstName = row.firstName?.trim();
    const username = row.username?.trim() ?? null;
    const displayName = firstName || (username ? `@${username}` : 'User');
    const parsedParentId =
      row.parentId === null ? null : Number.parseInt(row.parentId, 10);

    return {
      id: Number.parseInt(row.id, 10),
      adId: Number.parseInt(row.adId, 10),
      userId: Number.parseInt(row.userId, 10),
      parentId: Number.isFinite(parsedParentId) ? parsedParentId : null,
      depth: Number.parseInt(row.depth ?? '0', 10) || 0,
      rating:
        row.rating === null ? null : Number.parseInt(String(row.rating), 10),
      comment: row.comment,
      isEdited:
        typeof row.isEdited === 'boolean'
          ? row.isEdited
          : Number(row.isEdited) === 1,
      editedAt: row.editedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      user: {
        displayName,
        username,
        avatarUrl: row.avatarUrl,
        isReviewBlocked:
          typeof row.isReviewBlocked === 'boolean'
            ? row.isReviewBlocked
            : Number(row.isReviewBlocked) === 1,
      },
      replies: [],
    };
  }

  private normalizeOptionalComment(comment: string | undefined) {
    if (typeof comment !== 'string') return null;
    const trimmed = comment.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeRequiredRating(rating: number | undefined): number {
    const parsed = Number(rating);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }
    return parsed;
  }

  private normalizeOptionalParentId(
    parentId: number | undefined,
  ): number | null {
    if (parentId === undefined || parentId === null) return null;
    const parsed = Number(parentId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('parentId must be a positive integer');
    }
    return parsed;
  }

  private async createTopLevelComment(input: {
    adId: number;
    userId: number;
    comment: string;
  }) {
    return this.adCommentRepo.save(
      this.adCommentRepo.create({
        adId: input.adId,
        userId: input.userId,
        parentId: null,
        depth: 0,
        rating: null,
        comment: input.comment,
        isEdited: false,
        editedAt: null,
      }),
    );
  }

  private async createReply(input: {
    adId: number;
    userId: number;
    parentId: number;
    comment: string;
  }) {
    const parent = await this.adCommentRepo.findOne({
      where: { id: input.parentId, adId: input.adId },
      select: { id: true, depth: true, comment: true },
    });
    if (!parent) {
      throw new NotFoundException('Parent comment not found');
    }
    if (parent.depth >= MAX_REPLY_DEPTH) {
      throw new BadRequestException(
        `Replies can be nested up to ${MAX_REPLY_DEPTH} levels`,
      );
    }
    if (!parent.comment?.trim()) {
      throw new BadRequestException(
        'Replies can only be added to comments with text',
      );
    }

    return this.adCommentRepo.save(
      this.adCommentRepo.create({
        adId: input.adId,
        userId: input.userId,
        parentId: parent.id,
        depth: parent.depth + 1,
        rating: null,
        comment: input.comment,
        isEdited: false,
        editedAt: null,
      }),
    );
  }

  private async upsertUserRating(adId: number, userId: number, rating: number) {
    const existingRating = await this.adCommentRepo.findOne({
      where: {
        adId,
        userId,
        parentId: IsNull(),
        rating: Not(IsNull()),
      },
      order: { createdAt: 'ASC' },
    });

    if (!existingRating) {
      const saved = await this.adCommentRepo.save(
        this.adCommentRepo.create({
          adId,
          userId,
          parentId: null,
          depth: 0,
          rating,
          comment: null,
          isEdited: false,
          editedAt: null,
        }),
      );

      return {
        saved,
        isNewRating: true,
        hasChanged: true,
      };
    }

    if (existingRating.rating === rating) {
      return {
        saved: existingRating,
        isNewRating: false,
        hasChanged: false,
      };
    }

    existingRating.rating = rating;
    existingRating.isEdited = true;
    existingRating.editedAt = new Date();
    const saved = await this.adCommentRepo.save(existingRating);

    return {
      saved,
      isNewRating: false,
      hasChanged: true,
    };
  }

  private async getReviewAuthorOrThrow(userId: number) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: {
        id: true,
        telegramId: true,
        firstName: true,
        username: true,
        avatarUrl: true,
        isReviewBlocked: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.isReviewBlocked) {
      throw new ForbiddenException('You are not allowed to leave reviews');
    }
    if (!user.telegramId) {
      throw new BadRequestException(
        'Only users with linked Telegram can leave reviews',
      );
    }

    return user;
  }

  private mapSavedAdComment(
    saved: AdComment,
    user: Pick<
      User,
      'firstName' | 'username' | 'avatarUrl' | 'isReviewBlocked'
    >,
  ) {
    return this.mapAdCommentRow({
      id: String(saved.id),
      adId: String(saved.adId),
      userId: String(saved.userId),
      parentId: saved.parentId === null ? null : String(saved.parentId),
      depth: String(saved.depth),
      rating: saved.rating === null ? null : String(saved.rating),
      comment: saved.comment,
      isEdited: saved.isEdited,
      editedAt: saved.editedAt,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      firstName: user.firstName ?? null,
      username: user.username ?? null,
      avatarUrl: user.avatarUrl ?? null,
      isReviewBlocked: user.isReviewBlocked,
    });
  }

  private async notifyAdCreatorAboutReviewActivity(
    ad: Pick<Ad, 'id' | 'name' | 'createdById' | 'merchantId'>,
    reviewer: Pick<User, 'id' | 'firstName' | 'username'>,
    activity: {
      isRatingChanged: boolean;
      isNewComment: boolean;
      rating: number | null;
      comment: string | null;
    },
  ) {
    const ownerId = ad.createdById ?? ad.merchantId;
    if (!ownerId || ownerId === reviewer.id) {
      return;
    }

    try {
      const owner = await this.userRepo.findOne({
        where: { id: ownerId },
        select: { id: true, telegramId: true },
      });
      if (!owner?.telegramId) {
        return;
      }

      const firstName = reviewer.firstName?.trim();
      const username = reviewer.username?.trim();
      const reviewerDisplayName = firstName || (username ? `@${username}` : 'User');

      await this.botService.notifyMerchantAdReview({
        telegramId: owner.telegramId,
        adId: ad.id,
        adTitle: ad.name,
        reviewerDisplayName,
        reviewerUsername: reviewer.username,
        rating: activity.rating,
        comment: activity.comment,
        isRatingChanged: activity.isRatingChanged,
        isNewComment: activity.isNewComment,
      });
    } catch {
      // Keep review publishing non-blocking if Telegram delivery fails.
    }
  }
}
