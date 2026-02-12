import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ad, AdStatus } from './entities/ad.entity';
import { AdComment } from './entities/ad-comment.entity';
import { CreateAdCommentDto } from './dto/create-ad-comment.dto';
import { User } from '../users/entities/user.entity';

type AdCommentRow = {
  id: string;
  adId: string;
  userId: string;
  rating: string;
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

@Injectable()
export class AdCommentsService {
  constructor(
    @InjectRepository(Ad)
    private readonly adRepo: Repository<Ad>,
    @InjectRepository(AdComment)
    private readonly adCommentRepo: Repository<AdComment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getAdComments(adId: number) {
    await this.assertAdExistsForPublicView(adId);
    return this.fetchCommentsWithMeta(adId);
  }

  async createOrUpdateAdComment(
    adId: number,
    userId: number,
    dto: CreateAdCommentDto,
  ) {
    await this.assertAdExistsForPublicView(adId);

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

    const normalizedComment = this.normalizeOptionalComment(dto.comment);
    const existing = await this.adCommentRepo.findOne({
      where: { adId, userId },
    });

    let saved: AdComment;
    if (!existing) {
      saved = await this.adCommentRepo.save(
        this.adCommentRepo.create({
          adId,
          userId,
          rating: dto.rating,
          comment: normalizedComment,
          isEdited: false,
          editedAt: null,
        }),
      );
    } else {
      const hasChanges =
        existing.rating !== dto.rating ||
        (existing.comment ?? null) !== normalizedComment;

      existing.rating = dto.rating;
      existing.comment = normalizedComment;
      if (hasChanges) {
        existing.isEdited = true;
        existing.editedAt = new Date();
      }

      saved = await this.adCommentRepo.save(existing);
    }

    return {
      data: this.mapAdCommentRow({
        id: String(saved.id),
        adId: String(saved.adId),
        userId: String(saved.userId),
        rating: String(saved.rating),
        comment: saved.comment,
        isEdited: saved.isEdited,
        editedAt: saved.editedAt,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
        firstName: user.firstName ?? null,
        username: user.username ?? null,
        avatarUrl: user.avatarUrl ?? null,
        isReviewBlocked: user.isReviewBlocked,
      }),
      meta: await this.getAdCommentMeta(adId),
    };
  }

  async getAdCommentsForAdmin(adId: number) {
    await this.assertAdExists(adId);
    return this.fetchCommentsWithMeta(adId);
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

  private async fetchCommentsWithMeta(adId: number) {
    const [rows, meta] = await Promise.all([
      this.adCommentRepo
        .createQueryBuilder('comment')
        .leftJoin('comment.user', 'user')
        .select('comment.id', 'id')
        .addSelect('comment.adId', 'adId')
        .addSelect('comment.userId', 'userId')
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
        .where('comment.adId = :adId', { adId })
        .orderBy('comment.createdAt', 'DESC')
        .getRawMany<AdCommentRow>(),
      this.getAdCommentMeta(adId),
    ]);

    return {
      data: rows.map((row) => this.mapAdCommentRow(row)),
      meta,
    };
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

  private async assertAdExistsForPublicView(adId: number) {
    const ad = await this.adRepo.findOne({
      where: { id: adId, status: AdStatus.APPROVED, isActive: true },
      select: { id: true },
    });
    if (!ad) {
      throw new NotFoundException('Ad not found');
    }
  }

  private async getAdCommentMeta(adId: number) {
    const row = await this.adCommentRepo
      .createQueryBuilder('comment')
      .select('COUNT(comment.id)', 'totalReviews')
      .addSelect('AVG(comment.rating)', 'averageRating')
      .where('comment.adId = :adId', { adId })
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

  private mapAdCommentRow(row: AdCommentRow) {
    const firstName = row.firstName?.trim();
    const username = row.username?.trim();
    const displayName = firstName || (username ? `@${username}` : 'User');

    return {
      id: Number.parseInt(row.id, 10),
      adId: Number.parseInt(row.adId, 10),
      userId: Number.parseInt(row.userId, 10),
      rating: Number.parseInt(row.rating, 10),
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
    };
  }

  private normalizeOptionalComment(comment: string | undefined) {
    if (typeof comment !== 'string') return null;
    const trimmed = comment.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
