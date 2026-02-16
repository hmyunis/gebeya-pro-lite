import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import { SendHorizontal } from "lucide-react";
import type { Ad, AdComment, AdCommentMeta } from "@/features/products/types";
import { api, getApiErrorMessage } from "@/lib/api";
import { formatLocaleDate, useI18n } from "@/features/i18n";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useTelegramAuthWidget } from "@/features/auth/hooks/useTelegramAuthWidget";
import { PUBLIC_TELEGRAM_BOT_NAME } from "@/config/env";

const STARS = [1, 2, 3, 4, 5] as const;
const REVIEW_DRAFT_STORAGE_KEY = "pending-ad-review-draft-v1";
const ANALYTICS_SESSION_STORAGE_KEY = "gebeya-analytics-session-id";
const ANALYTICS_SCHEMA_VERSION = 2;

type StoredReviewDraft = {
  adId: number;
  rating: number;
  comment: string;
  adSnapshot: Ad;
  savedAt: string;
};

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

export function AdReviewsPanel({
  ad,
  isOpen,
}: {
  ad: Ad;
  isOpen: boolean;
}) {
  const { locale } = useI18n();
  const { user, authReady } = useAuth();
  const [comments, setComments] = useState<AdComment[]>([]);
  const [commentsMeta, setCommentsMeta] = useState<AdCommentMeta>({
    totalReviews: 0,
    averageRating: 0,
  });
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingPublishAfterAuth, setPendingPublishAfterAuth] = useState(false);

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
        title: "Signed in",
        description: "You can now publish your review.",
        color: "success",
      });
    },
  });

  const ownReview = useMemo(
    () => comments.find((item) => item.userId === user?.userId) ?? null,
    [comments, user?.userId],
  );
  const hasReviewComment = reviewText.trim().length > 0;

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    setCommentsError(null);

    try {
      const response = await api.get(`/ads/${ad.id}/comments`);
      const payload = response.data as
        | {
            data?: AdComment[];
            meta?: AdCommentMeta;
          }
        | undefined;

      setComments(Array.isArray(payload?.data) ? payload.data : []);
      setCommentsMeta({
        totalReviews: Number(payload?.meta?.totalReviews ?? 0),
        averageRating: Number(payload?.meta?.averageRating ?? 0),
      });
    } catch (error) {
      setCommentsError(getApiErrorMessage(error));
    } finally {
      setCommentsLoading(false);
    }
  }, [ad.id]);

  useEffect(() => {
    if (!isOpen) return;
    void loadComments();
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

    if (ownReview) {
      setReviewRating(ownReview.rating);
      setReviewText(ownReview.comment ?? "");
      return;
    }

    const storedDraft = readStoredDraftForAd(ad.id);
    if (storedDraft) {
      setReviewRating(storedDraft.rating);
      setReviewText(storedDraft.comment);
      return;
    }

    setReviewRating(5);
    setReviewText("");
  }, [ad.id, isOpen, ownReview]);

  const handleSubmitReview = useCallback(async () => {
    if (!hasReviewComment) {
      addToast({
        title: "Comment required",
        description: "Please add a short comment before publishing your review.",
        color: "warning",
      });
      return;
    }

    const trimmedComment = reviewText.trim();
    if (!authReady || !user) {
      saveStoredDraft(ad, reviewRating, trimmedComment);
      setPendingPublishAfterAuth(true);
      setIsAuthModalOpen(true);
      addToast({
        title: "Sign in required",
        description: "Sign in with Telegram to finish publishing your review.",
        color: "primary",
      });
      return;
    }

    if (!user.hasTelegram) {
      addToast({
        title: "Telegram required",
        description: "Link your Telegram account to publish reviews.",
        color: "warning",
      });
      return;
    }

    setIsSubmittingReview(true);

    try {
      await api.post(`/ads/${ad.id}/comments`, {
        rating: reviewRating,
        comment: trimmedComment,
      });

      clearStoredDraft(ad.id);

      addToast({
        title: ownReview ? "Review updated" : "Review published",
        description: "Your feedback is now visible in this ad.",
        color: "success",
      });

      await loadComments();
    } catch (error) {
      addToast({
        title: "Could not submit review",
        description: getApiErrorMessage(error),
        color: "danger",
      });
    } finally {
      setIsSubmittingReview(false);
    }
  }, [ad, authReady, hasReviewComment, loadComments, ownReview, reviewRating, reviewText, user]);

  useEffect(() => {
    if (!pendingPublishAfterAuth) return;
    if (!authReady || !user) return;

    setPendingPublishAfterAuth(false);
    void handleSubmitReview();
  }, [authReady, handleSubmitReview, pendingPublishAfterAuth, user]);

  return (
    <div className="space-y-4 rounded-2xl border border-default-200 bg-default-50/50 p-4 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
            Community feedback
          </p>
          <p className="text-lg font-semibold">
            {commentsMeta.totalReviews > 0
              ? `${commentsMeta.averageRating.toFixed(1)} / 5`
              : "No reviews yet"}
          </p>
        </div>
        {commentsMeta.totalReviews > 0 ? (
          <p className="text-sm text-ink-muted">
            {commentsMeta.totalReviews} review
            {commentsMeta.totalReviews === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      {commentsLoading ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner size="sm" />
          <span>Loading reviews...</span>
        </div>
      ) : commentsError ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm">
          <p className="text-danger">{commentsError}</p>
          <Button
            size="sm"
            variant="flat"
            color="danger"
            className="mt-2"
            onPress={() => void loadComments()}
          >
            Retry
          </Button>
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-ink-muted">No reviews yet.</p>
      ) : (
        <ScrollShadow hideScrollBar size={6} className="max-h-56 space-y-3 pr-1">
          {comments.map((item) => {
            const createdAt = new Date(item.createdAt);
            const reviewedOn = Number.isNaN(createdAt.getTime())
              ? item.createdAt
              : formatLocaleDate(createdAt, locale, {
                  year: "numeric",
                  month: "short",
                  day: "2-digit",
                });

            return (
              <article
                key={item.id}
                className="rounded-xl border border-default-200 bg-background/80 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{item.user.displayName}</p>
                  <p className="text-xs text-ink-muted">{reviewedOn}</p>
                </div>
                <p className="mt-1 text-sm text-amber-500" aria-label={`${item.rating} stars`}>
                  {STARS.map((star) => (star <= item.rating ? "★" : "☆")).join("")}
                </p>
                {item.comment ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
                    {item.comment}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-ink-muted">Rating only</p>
                )}
              </article>
            );
          })}
        </ScrollShadow>
      )}

      <div className="space-y-3 rounded-xl border border-default-200 bg-background/70 p-3">
        <p className="text-sm font-semibold">{ownReview ? "Update your review" : "Write a review"}</p>

        <div className="flex flex-wrap items-center gap-1">
          {STARS.map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setReviewRating(star)}
              className={`rounded-md px-2 py-1 text-xl leading-none transition ${
                star <= reviewRating
                  ? "text-amber-500"
                  : "text-default-300 hover:text-default-500"
              }`}
              aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
            >
              ★
            </button>
          ))}
        </div>

        <Textarea
          value={reviewText}
          onValueChange={setReviewText}
          minRows={3}
          maxRows={6}
          variant="bordered"
          placeholder="Write a short comment"
          isRequired
          isInvalid={reviewText.length > 0 && !hasReviewComment}
          errorMessage={
            reviewText.length > 0 && !hasReviewComment ? "Comment cannot be empty." : undefined
          }
        />

        <div className="flex justify-end">
          <Button
            size="sm"
            color="primary"
            onPress={() => void handleSubmitReview()}
            isLoading={isSubmittingReview}
            isDisabled={isSubmittingReview || !hasReviewComment}
            startContent={<SendHorizontal className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {ownReview ? "Update review" : "Publish review"}
          </Button>
        </div>
      </div>

      <Modal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setPendingPublishAfterAuth(false);
        }}
        size="lg"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">Sign in to publish review</ModalHeader>
          <ModalBody className="space-y-3">
            <p className="text-sm text-ink-muted">
              Finish signing in with Telegram to publish your review.
            </p>
            <div className="rounded-2xl border border-default-200 bg-background/70 p-3">
              <div ref={widgetHostRef} className="min-h-12" />
              {widgetError ? <p className="mt-2 text-xs text-danger">{widgetError}</p> : null}
            </div>
            {isAuthorizing ? (
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <Spinner size="sm" />
                <span>Signing you in...</span>
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => {
                setIsAuthModalOpen(false);
                setPendingPublishAfterAuth(false);
              }}
            >
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
