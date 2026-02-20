import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import {
  Avatar,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ScrollShadow,
  Spinner,
  Textarea,
  addToast,
} from "@heroui/react";
import {
  CornerDownRight,
  MessageCircleReply,
  Pencil,
  SendHorizontal,
  Star,
  Trash2,
} from "lucide-react";
import type { Ad, AdComment, AdCommentMeta } from "@/features/products/types";
import { api, getApiErrorMessage } from "@/lib/api";
import { formatLocaleDate, useI18n } from "@/features/i18n";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useTelegramAuthWidget } from "@/features/auth/hooks/useTelegramAuthWidget";
import { PUBLIC_TELEGRAM_BOT_NAME } from "@/config/env";

const STARS = [1, 2, 3, 4, 5] as const;
const MAX_REPLY_DEPTH = 3;
const COMMENTS_PAGE_SIZE = 10;
const COMMENT_SCROLL_BOTTOM_OFFSET = 64;
const REVIEW_DRAFT_STORAGE_KEY = "pending-ad-review-draft-v1";
const ANALYTICS_SESSION_STORAGE_KEY = "gebeya-analytics-session-id";
const ANALYTICS_SCHEMA_VERSION = 2;

type CommentListMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

const DEFAULT_COMMENT_LIST_META: CommentListMeta = {
  page: 1,
  limit: COMMENTS_PAGE_SIZE,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

type StoredReviewDraft = {
  adId: number;
  rating: number;
  comment: string;
  adSnapshot: Ad;
  savedAt: string;
};

type PendingPublishAction =
  | { type: "rating"; rating: number }
  | { type: "comment" }
  | { type: "reply"; parentId: number }
  | { type: "edit"; commentId: number }
  | { type: "delete"; commentId: number };

function parseStoredReviewDraft(raw: string | null): StoredReviewDraft | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredReviewDraft> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.adId !== "number") return null;
    if (typeof parsed.rating !== "number") return null;
    if (typeof parsed.comment !== "string") return null;
    if (!parsed.adSnapshot || typeof parsed.adSnapshot !== "object") return null;
    return {
      adId: parsed.adId,
      rating: Math.max(1, Math.min(5, parsed.rating)),
      comment: parsed.comment,
      adSnapshot: parsed.adSnapshot as Ad,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function readStoredDraftForAd(adId: number): StoredReviewDraft | null {
  if (typeof window === "undefined") return null;
  const draft = parseStoredReviewDraft(window.sessionStorage.getItem(REVIEW_DRAFT_STORAGE_KEY));
  if (!draft || draft.adId !== adId) return null;
  return draft;
}

function saveStoredDraft(ad: Ad, rating: number, comment: string): void {
  if (typeof window === "undefined") return;
  const payload: StoredReviewDraft = {
    adId: ad.id,
    rating: Math.max(1, Math.min(5, rating)),
    comment,
    adSnapshot: ad,
    savedAt: new Date().toISOString(),
  };
  window.sessionStorage.setItem(REVIEW_DRAFT_STORAGE_KEY, JSON.stringify(payload));
}

function clearStoredDraft(adId: number): void {
  if (typeof window === "undefined") return;
  const current = parseStoredReviewDraft(window.sessionStorage.getItem(REVIEW_DRAFT_STORAGE_KEY));
  if (!current || current.adId !== adId) return;
  window.sessionStorage.removeItem(REVIEW_DRAFT_STORAGE_KEY);
}

function createAnalyticsId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `e${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function getAnalyticsSessionId(): string {
  if (typeof window === "undefined") {
    return createAnalyticsId();
  }

  try {
    const stored = window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY);
    if (typeof stored === "string" && stored.trim().length >= 12) {
      return stored.trim();
    }

    const generated = createAnalyticsId();
    window.sessionStorage.setItem(ANALYTICS_SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    return createAnalyticsId();
  }
}

function findCommentById(comments: AdComment[], targetId: number): AdComment | null {
  for (const comment of comments) {
    if (comment.id === targetId) return comment;
    if (Array.isArray(comment.replies) && comment.replies.length > 0) {
      const found = findCommentById(comment.replies, targetId);
      if (found) return found;
    }
  }
  return null;
}

function formatCommentDate(raw: string, locale: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return formatLocaleDate(date, locale as "en" | "am", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function collectTopLevelRatingsByUser(comments: AdComment[]): Map<number, number> {
  const ratings = new Map<number, { rating: number; updatedAt: number }>();
  for (const comment of comments) {
    if (comment.depth !== 0) continue;
    if (typeof comment.rating !== "number") continue;

    const updatedAt = new Date(comment.updatedAt).getTime();
    const safeUpdatedAt = Number.isFinite(updatedAt) ? updatedAt : 0;
    const existing = ratings.get(comment.userId);

    if (!existing || safeUpdatedAt >= existing.updatedAt) {
      ratings.set(comment.userId, {
        rating: Math.max(1, Math.min(5, comment.rating)),
        updatedAt: safeUpdatedAt,
      });
    }
  }

  return new Map(Array.from(ratings.entries()).map(([userId, value]) => [userId, value.rating]));
}

function countCommentsRecursive(comments: AdComment[]): number {
  let total = 0;
  for (const comment of comments) {
    const hasText = (comment.comment?.trim() ?? "").length > 0;
    if (hasText) total += 1;
    if (Array.isArray(comment.replies) && comment.replies.length > 0) {
      total += countCommentsRecursive(comment.replies);
    }
  }
  return total;
}

function upsertTopLevelRatingComment(comments: AdComment[], incoming: AdComment): AdComment[] {
  if (incoming.parentId !== null || typeof incoming.rating !== "number") {
    return comments;
  }

  const byIdIndex = comments.findIndex((item) => item.id === incoming.id);
  if (byIdIndex >= 0) {
    const next = [...comments];
    next[byIdIndex] = {
      ...next[byIdIndex],
      ...incoming,
      replies: Array.isArray(next[byIdIndex].replies) ? next[byIdIndex].replies : [],
    };
    return next;
  }

  const byUserRatingIndex = comments.findIndex(
    (item) =>
      item.parentId === null &&
      item.userId === incoming.userId &&
      typeof item.rating === "number",
  );
  if (byUserRatingIndex >= 0) {
    const next = [...comments];
    next[byUserRatingIndex] = {
      ...next[byUserRatingIndex],
      ...incoming,
      replies: Array.isArray(next[byUserRatingIndex].replies)
        ? next[byUserRatingIndex].replies
        : [],
    };
    return next;
  }

  return [incoming, ...comments];
}

export function AdReviewsPanel({
  ad,
  isOpen,
}: {
  ad: Ad;
  isOpen: boolean;
}) {
  const { locale, t } = useI18n();
  const { user, authReady } = useAuth();
  const [comments, setComments] = useState<AdComment[]>([]);
  const [commentsMeta, setCommentsMeta] = useState<AdCommentMeta>({
    totalReviews: 0,
    averageRating: 0,
  });
  const [commentListMeta, setCommentListMeta] = useState<CommentListMeta>(
    DEFAULT_COMMENT_LIST_META,
  );
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentsLoadMoreError, setCommentsLoadMoreError] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [commentText, setCommentText] = useState("");
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [activeReplyParentId, setActiveReplyParentId] = useState<number | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [submittingReplyParentId, setSubmittingReplyParentId] = useState<number | null>(null);
  const [activeEditCommentId, setActiveEditCommentId] = useState<number | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<number, string>>({});
  const [submittingEditCommentId, setSubmittingEditCommentId] = useState<number | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);
  const [deleteConfirmCommentId, setDeleteConfirmCommentId] = useState<number | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingPublishAfterAuth, setPendingPublishAfterAuth] =
    useState<PendingPublishAction | null>(null);
  const commentsRequestInFlightRef = useRef(false);

  const authReturnTo = useMemo(() => {
    if (typeof window === "undefined") return "/";
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }, []);

  const { widgetHostRef, isAuthorizing, widgetError } = useTelegramAuthWidget({
    telegramBot: PUBLIC_TELEGRAM_BOT_NAME,
    returnTo: authReturnTo,
    onAuthenticated: async () => {
      setIsAuthModalOpen(false);
      addToast({
        title: t("adReviews.toast.signedIn.title"),
        description: t("adReviews.toast.signedIn.description"),
        color: "success",
      });
    },
  });

  const topLevelRatingsByUser = useMemo(() => collectTopLevelRatingsByUser(comments), [comments]);
  const ownRating =
    typeof user?.userId === "number" ? topLevelRatingsByUser.get(user.userId) ?? null : null;
  const hasCommentText = commentText.trim().length > 0;

  const visibleComments = useMemo(
    () =>
      comments.filter((item) => {
        const comment = item.comment?.trim() ?? "";
        return comment.length > 0;
      }),
    [comments],
  );

  const totalComments = useMemo(() => countCommentsRecursive(visibleComments), [visibleComments]);
  const deleteConfirmTarget = useMemo(
    () => (deleteConfirmCommentId ? findCommentById(comments, deleteConfirmCommentId) : null),
    [comments, deleteConfirmCommentId],
  );

  const loadComments = useCallback(
    async ({
      page = 1,
      replace = false,
    }: {
      page?: number;
      replace?: boolean;
    } = {}) => {
      if (commentsRequestInFlightRef.current) return;
      commentsRequestInFlightRef.current = true;

      const isInitialPage = replace || page <= 1;
      if (isInitialPage) {
        setCommentsLoading(true);
        setCommentsError(null);
        setCommentsLoadMoreError(null);
      } else {
        setCommentsLoadingMore(true);
        setCommentsLoadMoreError(null);
      }

      try {
        const response = await api.get(`/ads/${ad.id}/comments`, {
          params: {
            page,
            limit: COMMENTS_PAGE_SIZE,
          },
        });
        const payload = response.data as
          | {
              data?: AdComment[];
              meta?: AdCommentMeta & {
                comments?: Partial<CommentListMeta>;
              };
            }
          | undefined;

        const incomingComments = Array.isArray(payload?.data) ? payload.data : [];
        const incomingPagination = payload?.meta?.comments;
        const nextCommentListMeta: CommentListMeta = {
          page: Number(incomingPagination?.page ?? page),
          limit: Number(incomingPagination?.limit ?? COMMENTS_PAGE_SIZE),
          total: Number(incomingPagination?.total ?? incomingComments.length),
          totalPages: Number(incomingPagination?.totalPages ?? 0),
          hasNext: Boolean(incomingPagination?.hasNext),
          hasPrev: Boolean(incomingPagination?.hasPrev),
        };

        setComments((prev) => {
          if (isInitialPage) return incomingComments;

          const existingIds = new Set(prev.map((item) => item.id));
          const nextItems = incomingComments.filter((item) => !existingIds.has(item.id));
          return [...prev, ...nextItems];
        });
        setCommentsMeta({
          totalReviews: Number(payload?.meta?.totalReviews ?? 0),
          averageRating: Number(payload?.meta?.averageRating ?? 0),
        });
        setCommentListMeta(nextCommentListMeta);
      } catch (error) {
        const message = getApiErrorMessage(error);
        if (isInitialPage) {
          setCommentsError(message);
        } else {
          setCommentsLoadMoreError(message);
        }
      } finally {
        if (isInitialPage) {
          setCommentsLoading(false);
        } else {
          setCommentsLoadingMore(false);
        }
        commentsRequestInFlightRef.current = false;
      }
    },
    [ad.id],
  );

  useEffect(() => {
    if (!isOpen) return;
    void loadComments({ page: 1, replace: true });
  }, [isOpen, loadComments]);

  useEffect(() => {
    if (!isOpen) return;
    const path =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/ads";

    void api
      .post("/analytics/visits", {
        schemaVersion: ANALYTICS_SCHEMA_VERSION,
        eventId: createAnalyticsId(),
        sessionId: getAnalyticsSessionId(),
        sentAt: new Date().toISOString(),
        eventType: "ad_preview",
        path,
        metadata: {
          adId: ad.id,
          adSlug: ad.slug ?? null,
          interaction: "preview_modal_open",
        },
      })
      .catch(() => undefined);
  }, [ad.id, ad.slug, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const storedDraft = readStoredDraftForAd(ad.id);
    setRatingValue(storedDraft?.rating ?? ownRating ?? 5);
    setCommentText(storedDraft?.comment ?? "");
  }, [ad.id, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof ownRating !== "number") return;
    setRatingValue(ownRating);
  }, [isOpen, ownRating]);

  const handleCommentsScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (commentsLoading || commentsLoadingMore) return;
      if (commentsError || commentsLoadMoreError) return;
      if (!commentListMeta.hasNext) return;

      const container = event.currentTarget;
      const distanceToBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceToBottom > COMMENT_SCROLL_BOTTOM_OFFSET) return;

      void loadComments({ page: commentListMeta.page + 1, replace: false });
    },
    [
      commentListMeta.hasNext,
      commentListMeta.page,
      commentsError,
      commentsLoadMoreError,
      commentsLoading,
      commentsLoadingMore,
      loadComments,
    ],
  );

  const requireAuth = useCallback(
    (pendingAction: PendingPublishAction) => {
      setPendingPublishAfterAuth(pendingAction);
      setIsAuthModalOpen(true);
      addToast({
        title: t("adReviews.toast.signInRequired.title"),
        description: t("adReviews.toast.signInRequired.description"),
        color: "primary",
      });
    },
    [t],
  );

  const handleSubmitRating = useCallback(async (nextRating?: number) => {
    const selectedRating = Math.max(1, Math.min(5, nextRating ?? ratingValue));
    setRatingValue(selectedRating);

    if (!authReady || !user) {
      saveStoredDraft(ad, selectedRating, commentText.trim());
      requireAuth({ type: "rating", rating: selectedRating });
      return;
    }

    if (!user.hasTelegram) {
      addToast({
        title: t("adReviews.toast.telegramRequired.title"),
        description: t("adReviews.toast.telegramRequired.description"),
        color: "warning",
      });
      return;
    }

    setIsSubmittingRating(true);
    try {
      const response = await api.post(`/ads/${ad.id}/comments`, { rating: selectedRating });
      const payload = response.data as
        | {
            data?: AdComment;
            meta?: AdCommentMeta;
          }
        | undefined;

      if (payload?.data) {
        setComments((prev) => upsertTopLevelRatingComment(prev, payload.data as AdComment));
      }
      if (payload?.meta) {
        setCommentsMeta({
          totalReviews: Number(payload.meta.totalReviews ?? 0),
          averageRating: Number(payload.meta.averageRating ?? 0),
        });
      }
      saveStoredDraft(ad, selectedRating, commentText);

      addToast({
        title: t("adReviews.toast.ratingSaved.title"),
        description: t("adReviews.toast.ratingSaved.description"),
        color: "success",
      });
    } catch (error) {
      addToast({
        title: t("adReviews.toast.ratingFailed.title"),
        description: getApiErrorMessage(error),
        color: "danger",
      });
    } finally {
      setIsSubmittingRating(false);
    }
  }, [ad, authReady, commentText, ratingValue, requireAuth, t, user]);

  const handleRateClick = useCallback(
    (nextRating: number) => {
      if (isSubmittingRating) return;
      void handleSubmitRating(nextRating);
    },
    [handleSubmitRating, isSubmittingRating],
  );

  const handleSubmitComment = useCallback(async () => {
    const trimmedComment = commentText.trim();
    if (!trimmedComment) {
      addToast({
        title: t("adReviews.toast.commentRequired.title"),
        description: t("adReviews.toast.commentRequired.description"),
        color: "warning",
      });
      return;
    }

    if (!authReady || !user) {
      saveStoredDraft(ad, ratingValue, trimmedComment);
      requireAuth({ type: "comment" });
      return;
    }

    if (!user.hasTelegram) {
      addToast({
        title: t("adReviews.toast.telegramRequired.title"),
        description: t("adReviews.toast.telegramRequired.description"),
        color: "warning",
      });
      return;
    }

    setIsSubmittingComment(true);
    try {
      await api.post(`/ads/${ad.id}/comments`, { comment: trimmedComment });
      clearStoredDraft(ad.id);
      setCommentText("");

      addToast({
        title: t("adReviews.toast.commentPublished.title"),
        description: t("adReviews.toast.commentPublished.description"),
        color: "success",
      });
      await loadComments({ page: 1, replace: true });
    } catch (error) {
      addToast({
        title: t("adReviews.toast.commentFailed.title"),
        description: getApiErrorMessage(error),
        color: "danger",
      });
    } finally {
      setIsSubmittingComment(false);
    }
  }, [ad, authReady, commentText, loadComments, ratingValue, requireAuth, t, user]);

  const handleSubmitReply = useCallback(
    async (parentId: number) => {
      const replyText = (replyDrafts[parentId] ?? "").trim();
      if (!replyText) {
        addToast({
          title: t("adReviews.toast.replyRequired.title"),
          description: t("adReviews.toast.replyRequired.description"),
          color: "warning",
        });
        return;
      }

      if (!authReady || !user) {
        requireAuth({ type: "reply", parentId });
        return;
      }

      if (!user.hasTelegram) {
        addToast({
          title: t("adReviews.toast.telegramRequired.title"),
          description: t("adReviews.toast.telegramRequired.description"),
          color: "warning",
        });
        return;
      }

      setSubmittingReplyParentId(parentId);
      try {
        await api.post(`/ads/${ad.id}/comments`, {
          parentId,
          comment: replyText,
        });

        setReplyDrafts((prev) => {
          const next = { ...prev };
          delete next[parentId];
          return next;
        });
        if (activeReplyParentId === parentId) {
          setActiveReplyParentId(null);
        }

        addToast({
          title: t("adReviews.toast.replyPosted.title"),
          description: t("adReviews.toast.replyPosted.description"),
          color: "success",
        });
        await loadComments({ page: 1, replace: true });
      } catch (error) {
        addToast({
          title: t("adReviews.toast.replyFailed.title"),
          description: getApiErrorMessage(error),
          color: "danger",
        });
      } finally {
        setSubmittingReplyParentId(null);
      }
    },
    [activeReplyParentId, ad.id, authReady, loadComments, replyDrafts, requireAuth, t, user],
  );

  const handleSubmitEdit = useCallback(
    async (commentId: number) => {
      const editText = (editDrafts[commentId] ?? "").trim();
      if (!editText) {
        addToast({
          title: t("adReviews.toast.editRequired.title"),
          description: t("adReviews.toast.editRequired.description"),
          color: "warning",
        });
        return;
      }

      if (!authReady || !user) {
        requireAuth({ type: "edit", commentId });
        return;
      }

      if (!user.hasTelegram) {
        addToast({
          title: t("adReviews.toast.telegramRequired.title"),
          description: t("adReviews.toast.telegramRequired.description"),
          color: "warning",
        });
        return;
      }

      setSubmittingEditCommentId(commentId);
      try {
        await api.patch(`/ads/${ad.id}/comments/${commentId}`, {
          comment: editText,
        });

        setActiveEditCommentId(null);
        setEditDrafts((prev) => {
          const next = { ...prev };
          delete next[commentId];
          return next;
        });

        addToast({
          title: t("adReviews.toast.editSaved.title"),
          description: t("adReviews.toast.editSaved.description"),
          color: "success",
        });
        await loadComments({ page: 1, replace: true });
      } catch (error) {
        addToast({
          title: t("adReviews.toast.editFailed.title"),
          description: getApiErrorMessage(error),
          color: "danger",
        });
      } finally {
        setSubmittingEditCommentId(null);
      }
    },
    [ad.id, authReady, editDrafts, loadComments, requireAuth, t, user],
  );

  const handleDeleteComment = useCallback(
    async (commentId: number) => {
      setDeleteConfirmCommentId(null);
      if (!authReady || !user) {
        requireAuth({ type: "delete", commentId });
        return;
      }

      setDeletingCommentId(commentId);
      try {
        await api.delete(`/ads/${ad.id}/comments/${commentId}/mine`);
        if (activeReplyParentId === commentId) {
          setActiveReplyParentId(null);
        }
        if (activeEditCommentId === commentId) {
          setActiveEditCommentId(null);
        }
        setReplyDrafts((prev) => {
          const next = { ...prev };
          delete next[commentId];
          return next;
        });
        setEditDrafts((prev) => {
          const next = { ...prev };
          delete next[commentId];
          return next;
        });

        addToast({
          title: t("adReviews.toast.deleteSuccess.title"),
          description: t("adReviews.toast.deleteSuccess.description"),
          color: "success",
        });
        await loadComments({ page: 1, replace: true });
      } catch {
        // Keep delete feedback minimal: only success toast.
      } finally {
        setDeletingCommentId(null);
      }
    },
    [
      activeEditCommentId,
      activeReplyParentId,
      ad.id,
      authReady,
      loadComments,
      requireAuth,
      t,
      user,
    ],
  );

  useEffect(() => {
    if (!pendingPublishAfterAuth) return;
    if (!authReady || !user) return;

    const pendingAction = pendingPublishAfterAuth;
    setPendingPublishAfterAuth(null);

    if (pendingAction.type === "rating") {
      void handleSubmitRating(pendingAction.rating);
      return;
    }
    if (pendingAction.type === "comment") {
      void handleSubmitComment();
      return;
    }
    if (pendingAction.type === "reply") {
      const parent = findCommentById(comments, pendingAction.parentId);
      if (!parent) return;
      void handleSubmitReply(pendingAction.parentId);
      return;
    }
    if (pendingAction.type === "delete") {
      const target = findCommentById(comments, pendingAction.commentId);
      if (!target) return;
      void handleDeleteComment(pendingAction.commentId);
      return;
    }

    const target = findCommentById(comments, pendingAction.commentId);
    if (!target) return;
    void handleSubmitEdit(pendingAction.commentId);
  }, [
    authReady,
    comments,
    handleDeleteComment,
    handleSubmitComment,
    handleSubmitEdit,
    handleSubmitRating,
    handleSubmitReply,
    pendingPublishAfterAuth,
    user,
  ]);

  const renderComment = (item: AdComment) => {
    const safeDepth = Math.max(0, Math.min(item.depth ?? 0, MAX_REPLY_DEPTH));
    const hasReplies = Array.isArray(item.replies) && item.replies.length > 0;
    const commentDate = formatCommentDate(item.createdAt, locale);
    const canReply = safeDepth < MAX_REPLY_DEPTH;
    const canEdit = item.userId === user?.userId && (item.comment?.trim() ?? "").length > 0;
    const canDelete = item.userId === user?.userId;
    const isActiveReply = activeReplyParentId === item.id;
    const replyValue = replyDrafts[item.id] ?? "";
    const isReplySubmitting = submittingReplyParentId === item.id;
    const replyIndent = safeDepth * 14;
    const isActiveEdit = activeEditCommentId === item.id;
    const editValue = editDrafts[item.id] ?? item.comment ?? "";
    const isEditSubmitting = submittingEditCommentId === item.id;

    return (
      <article key={item.id} className="space-y-2" style={{ marginLeft: `${replyIndent}px` }}>
        <div
          className={`rounded-xl border border-default-200 bg-background/90 p-3 ${
            safeDepth > 0 ? "border-l-2 border-l-primary/40" : ""
          }`}
        >
          <div className="flex items-start gap-2.5">
            <Avatar
              size="sm"
              src={item.user.avatarUrl ?? undefined}
              name={item.user.displayName}
              className="h-8 w-8 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="truncate text-sm font-semibold">{item.user.displayName}</p>
                <p className="text-xs text-ink-muted">{commentDate}</p>
                {item.isEdited ? (
                  <span className="rounded-full bg-default-100 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                    {t("adReviews.comment.edited")}
                  </span>
                ) : null}
              </div>

              {isActiveEdit ? (
                <div className="mt-2.5 space-y-2">
                  <Textarea
                    value={editValue}
                    onValueChange={(next) =>
                      setEditDrafts((prev) => ({
                        ...prev,
                        [item.id]: next,
                      }))
                    }
                    minRows={2}
                    maxRows={4}
                    variant="bordered"
                    maxLength={1000}
                    placeholder={t("adReviews.edit.placeholder")}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-muted">{editValue.trim().length}/1000</p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="light"
                        onPress={() => {
                          setActiveEditCommentId(null);
                          setEditDrafts((prev) => {
                            const next = { ...prev };
                            delete next[item.id];
                            return next;
                          });
                        }}
                        isDisabled={isEditSubmitting}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        size="sm"
                        color="primary"
                        onPress={() => void handleSubmitEdit(item.id)}
                        isLoading={isEditSubmitting}
                        isDisabled={isEditSubmitting || editValue.trim().length === 0}
                        startContent={<SendHorizontal className="h-3.5 w-3.5" aria-hidden="true" />}
                      >
                        {t("adReviews.edit.save")}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-default-700">
                  {item.comment?.trim() || t("adReviews.comment.empty")}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {canReply && (
                  <Button
                    size="sm"
                    variant="light"
                    startContent={<MessageCircleReply className="h-3.5 w-3.5" />}
                    onPress={() => {
                      setActiveEditCommentId(null);
                      setActiveReplyParentId((current) => (current === item.id ? null : item.id));
                    }}
                  >
                    {t("adReviews.reply.action")}
                  </Button>
                )}

                {canEdit ? (
                  <Button
                    size="sm"
                    variant="light"
                    startContent={<Pencil className="h-3.5 w-3.5" />}
                    onPress={() => {
                      setActiveReplyParentId(null);
                      setActiveEditCommentId((current) => (current === item.id ? null : item.id));
                      setEditDrafts((prev) => ({
                        ...prev,
                        [item.id]: item.comment ?? "",
                      }));
                    }}
                  >
                    {t("adReviews.edit.action")}
                  </Button>
                ) : null}

                {canDelete ? (
                  <Button
                    size="sm"
                    variant="light"
                    color="danger"
                    startContent={<Trash2 className="h-3.5 w-3.5" />}
                    onPress={() => setDeleteConfirmCommentId(item.id)}
                    isLoading={deletingCommentId === item.id}
                    isDisabled={deletingCommentId !== null && deletingCommentId !== item.id}
                  >
                    {t("adReviews.delete.action")}
                  </Button>
                ) : null}
              </div>

              {isActiveReply ? (
                <div className="mt-2.5 rounded-lg border border-default-200 bg-default-50/70 p-2.5">
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-ink-muted">
                    <CornerDownRight className="h-3.5 w-3.5" />
                    <span>{t("adReviews.reply.to", { name: item.user.displayName })}</span>
                  </div>
                  <Textarea
                    value={replyValue}
                    onValueChange={(next) =>
                      setReplyDrafts((prev) => ({
                        ...prev,
                        [item.id]: next,
                      }))
                    }
                    minRows={2}
                    maxRows={4}
                    variant="bordered"
                    maxLength={1000}
                    placeholder={t("adReviews.reply.placeholder")}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-ink-muted">{replyValue.trim().length}/1000</p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="light"
                        onPress={() => setActiveReplyParentId(null)}
                        isDisabled={isReplySubmitting}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        size="sm"
                        color="primary"
                        onPress={() => void handleSubmitReply(item.id)}
                        isLoading={isReplySubmitting}
                        isDisabled={isReplySubmitting || replyValue.trim().length === 0}
                        startContent={<SendHorizontal className="h-3.5 w-3.5" aria-hidden="true" />}
                      >
                        {t("adReviews.reply.post")}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {hasReplies ? <div className="space-y-2">{item.replies!.map((reply) => renderComment(reply))}</div> : null}
      </article>
    );
  };

  return (
    <div className="space-y-4 rounded-2xl border border-default-200 bg-default-50/50 p-4 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">{t("adReviews.header.label")}</p>
          <p className="text-lg font-semibold">
            {commentsMeta.totalReviews > 0
              ? `${commentsMeta.averageRating.toFixed(1)} / 5`
              : t("adReviews.header.noRatings")}
          </p>
        </div>
        <p className="text-sm text-ink-muted">
          {t("adReviews.header.counts", {
            ratings: commentsMeta.totalReviews,
            comments: totalComments,
          })}
        </p>
      </div>

      <div className="rounded-xl border border-default-200 bg-background p-3">
        <div className="flex items-start gap-2.5">
          <Avatar
            size="sm"
            src={user?.avatarUrl ?? undefined}
            name={user?.username ?? t("adReviews.you")}
            className="h-8 w-8 shrink-0"
          />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold">{t("adReviews.rating.title")}</p>
              <p className="text-xs text-ink-muted">
                {typeof ownRating === "number"
                  ? t("adReviews.rating.current", { rating: ownRating })
                  : t("adReviews.rating.noCurrent")}
              </p>
            </div>

            <div
              className={`flex flex-wrap items-center gap-1 transition-opacity ${
                isSubmittingRating ? "opacity-55" : "opacity-100"
              }`}
            >
              {STARS.map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => handleRateClick(star)}
                  className={`rounded-md p-1 transition ${
                    star <= ratingValue
                      ? "text-amber-500"
                      : "text-default-300 hover:text-default-500"
                  }`}
                  aria-label={t("adReviews.rateAria", { count: star })}
                  disabled={isSubmittingRating}
                >
                  <Star
                    className={`h-5 w-5 ${star <= ratingValue ? "fill-current" : ""}`}
                  />
                </button>
              ))}
            </div>

            <div className="border-t border-default-200 pt-3">
              <p className="mb-2 text-sm font-semibold">{t("adReviews.comment.title")}</p>
              <Textarea
                value={commentText}
                onValueChange={setCommentText}
                minRows={3}
                maxRows={6}
                variant="bordered"
                maxLength={1000}
                placeholder={t("adReviews.comment.placeholder")}
                isRequired
                isInvalid={commentText.length > 0 && !hasCommentText}
                errorMessage={
                  commentText.length > 0 && !hasCommentText ? t("adReviews.comment.invalid") : undefined
                }
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-ink-muted">{commentText.trim().length}/1000</p>
                <Button
                  size="sm"
                  color="primary"
                  onPress={() => void handleSubmitComment()}
                  isLoading={isSubmittingComment}
                  isDisabled={isSubmittingComment || !hasCommentText}
                  startContent={<SendHorizontal className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {t("adReviews.comment.publish")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {commentsLoading && comments.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner size="sm" />
          <span>{t("adReviews.loading")}</span>
        </div>
      ) : commentsError ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm">
          <p className="text-danger">{commentsError}</p>
          <Button
            size="sm"
            variant="flat"
            color="danger"
            className="mt-2"
            onPress={() => void loadComments({ page: 1, replace: true })}
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : visibleComments.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("adReviews.empty")}</p>
      ) : (
        <ScrollShadow
          hideScrollBar
          size={6}
          className="max-h-80 space-y-2 pr-1"
          onScroll={handleCommentsScroll}
        >
          {visibleComments.map((item) => renderComment(item))}
          {commentsLoadingMore ? (
            <div className="flex items-center gap-2 py-1 text-sm text-ink-muted">
              <Spinner size="sm" />
              <span>{t("adReviews.loadMore.loading")}</span>
            </div>
          ) : null}
          {commentsLoadMoreError ? (
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm">
              <p className="text-danger">{commentsLoadMoreError}</p>
              <Button
                size="sm"
                variant="flat"
                color="danger"
                className="mt-2"
                onPress={() =>
                  void loadComments({ page: commentListMeta.page + 1, replace: false })
                }
              >
                {t("adReviews.loadMore.retry")}
              </Button>
            </div>
          ) : null}
        </ScrollShadow>
      )}

      <Modal
        isOpen={deleteConfirmCommentId !== null}
        onClose={() => {
          if (deletingCommentId === null) {
            setDeleteConfirmCommentId(null);
          }
        }}
        size="sm"
      >
        <ModalContent>
          <ModalHeader>{t("adReviews.delete.modalTitle")}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-ink-muted">
              {t("adReviews.delete.modalDescription", {
                name: deleteConfirmTarget?.user.displayName ?? t("adReviews.you"),
              })}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => setDeleteConfirmCommentId(null)}
              isDisabled={deletingCommentId !== null}
            >
              {t("common.cancel")}
            </Button>
            <Button
              color="danger"
              onPress={() => {
                if (!deleteConfirmCommentId) return;
                void handleDeleteComment(deleteConfirmCommentId);
              }}
              isLoading={deletingCommentId !== null}
            >
              {t("adReviews.delete.confirmAction")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setPendingPublishAfterAuth(null);
        }}
        size="lg"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">{t("adReviews.auth.title")}</ModalHeader>
          <ModalBody className="space-y-3">
            <p className="text-sm text-ink-muted">{t("adReviews.auth.description")}</p>
            <div className="rounded-2xl border border-default-200 bg-background/70 p-3">
              <div ref={widgetHostRef} className="min-h-12" />
              {widgetError ? <p className="mt-2 text-xs text-danger">{widgetError}</p> : null}
            </div>
            {isAuthorizing ? (
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <Spinner size="sm" />
                <span>{t("adReviews.auth.signingIn")}</span>
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => {
                setIsAuthModalOpen(false);
                setPendingPublishAfterAuth(null);
              }}
            >
              {t("common.cancel")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
