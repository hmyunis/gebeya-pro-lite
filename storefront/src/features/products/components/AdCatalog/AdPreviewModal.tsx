import { Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ScrollShadow } from "@heroui/react";
import { useEffect, useState } from "react";
import { MapPin, PhoneCall } from "lucide-react";
import type { Ad } from "@/features/products/types";
import { resolveImageUrl } from "@/lib/images";
import { formatBirrLabel } from "@/lib/money";
import { formatLocaleDate, useI18n } from "@/features/i18n";
import { formatEthiopianPhoneForDisplay } from "@/features/products/utils/phoneNumber";
import { API_BASE } from "@/config/env";
import { AdImageCarousel } from "./AdImageCarousel";
import { AdReviewsPanel } from "./AdReviewsPanel";

const ANALYTICS_SCHEMA_VERSION = 2;
const ANALYTICS_SESSION_STORAGE_KEY = "gebeya-analytics-session-id";

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

function maskPhoneNumber(value: string): string {
  const chars = value.split("");
  let digitsSeen = 0;
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    if (!/\d/.test(chars[i])) continue;
    digitsSeen += 1;
    if (digitsSeen > 2) {
      chars[i] = "•";
    }
  }
  return chars.join("");
}

export function AdPreviewModal({
  isOpen,
  onClose,
  ad,
  imageBase,
}: {
  isOpen: boolean;
  onClose: () => void;
  ad: Ad | null;
  imageBase: string;
}) {
  const { locale, t } = useI18n();
  const [isPhoneRevealed, setIsPhoneRevealed] = useState(false);
  const telHref = (() => {
    const rawPhone = String(ad?.phoneNumber ?? "").trim();
    if (!rawPhone) return null;
    const normalized = rawPhone.replace(/[^\d+]/g, "");
    return normalized ? `tel:${normalized}` : null;
  })();

  const rawImagePaths =
    ad?.imageUrls && ad.imageUrls.length > 0
      ? ad.imageUrls
      : ad?.imageUrl
        ? [ad.imageUrl]
        : [];

  const images = rawImagePaths
    .map((path) => resolveImageUrl(imageBase, path))
    .filter((path): path is string => Boolean(path));
  const numericPrice =
    typeof ad?.price === "number" ? ad.price : Number(ad?.price ?? 0);
  const isFree = Number.isFinite(numericPrice) && numericPrice <= 0;
  const lastUpdatedSource = ad?.updatedAt || ad?.createdAt;
  const lastUpdatedDate = lastUpdatedSource ? new Date(lastUpdatedSource) : null;
  const hasValidLastUpdatedDate =
    lastUpdatedDate !== null && !Number.isNaN(lastUpdatedDate.getTime());
  const lastUpdatedLabel = hasValidLastUpdatedDate
    ? t("product.lastUpdated", {
        date: formatLocaleDate(lastUpdatedDate, locale, {
          year: "numeric",
          month: "short",
          day: "2-digit",
        }),
      })
    : t("product.lastUpdatedRecently");
  const descriptionText =
    ad?.description && ad.description.trim().length > 0
      ? ad.description
      : t("product.noDescription");
  const shouldShowReviews = (ad?.status ?? "APPROVED") === "APPROVED";
  const trackPhoneInteraction = (
    clickTarget: "phone_reveal" | "phone_call",
  ) => {
    if (!ad || !telHref || typeof window === "undefined") return;
    const endpoint = `${API_BASE}/v1/analytics/visits`;
    const payload = {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      eventId: createAnalyticsId(),
      sessionId: getAnalyticsSessionId(),
      sentAt: new Date().toISOString(),
      eventType: "ad_click",
      path: `${window.location.pathname}${window.location.search}`,
      referrer: document.referrer || undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
      language: navigator.language || undefined,
      metadata: {
        adId: ad.id,
        adSlug: ad.slug ?? null,
        clickTarget,
      },
    };
    const serialized = JSON.stringify(payload);
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([serialized], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
      return;
    }
    void fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: serialized,
      keepalive: true,
    });
  };

  useEffect(() => {
    if (!isOpen) {
      setIsPhoneRevealed(false);
      return;
    }
    setIsPhoneRevealed(false);
  }, [ad?.id, isOpen]);

  const handleRevealPhoneClick = () => {
    if (isPhoneRevealed) return;
    setIsPhoneRevealed(true);
    trackPhoneInteraction("phone_reveal");
  };

  const handlePhoneClick = () => {
    trackPhoneInteraction("phone_call");
  };

  const formattedPhone = formatEthiopianPhoneForDisplay(ad?.phoneNumber);
  const maskedPhone = maskPhoneNumber(formattedPhone);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold md:text-lg">
            {ad?.name ?? t("product.previewTitleFallback")}
          </p>
        </ModalHeader>
        <ModalBody className="min-w-0 overflow-x-hidden pt-0">
          {ad ? (
            <div className="grid min-w-0 gap-5 pb-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="aspect-square min-w-0">
                <AdImageCarousel images={images} adName={ad.name} />
              </div>
              <div className="min-w-0 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {ad.category?.name ? (
                    <Chip size="sm" variant="flat">
                      {ad.category.name}
                    </Chip>
                  ) : null}
                  <Chip size="sm" variant="flat">
                    {lastUpdatedLabel}
                  </Chip>
                </div>
                {isFree ? (
                  <p className="text-2xl font-semibold uppercase tracking-[0.2em] text-green-600">
                    {t("product.free")}
                  </p>
                ) : (
                  <p className="text-2xl font-semibold">{formatBirrLabel(ad.price)}</p>
                )}
                <ScrollShadow hideScrollBar size={5} className="h-44">
                  <p className="wrap-break-word text-ink-muted whitespace-pre-wrap text-sm leading-relaxed">
                    {descriptionText}
                  </p>
                </ScrollShadow>
                <div className="rounded-2xl border border-default-200 p-3 text-sm">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-ink-muted">
                    {t("adPreview.contact")}
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-ink-muted">
                      <PhoneCall className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {telHref ? (
                        isPhoneRevealed ? (
                          <a
                            href={telHref}
                            onClick={handlePhoneClick}
                            className="font-medium text-primary hover:underline"
                            aria-label={t("adPreview.callAria", {
                              phone: formattedPhone,
                            })}
                          >
                            {formattedPhone}
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={handleRevealPhoneClick}
                            className="group inline-flex items-center gap-2 rounded-md text-primary"
                            aria-label={t("adPreview.revealPhoneAria")}
                          >
                            <span className="font-medium blur-[3px] transition duration-150 group-hover:blur-[2px]">
                              {maskedPhone}
                            </span>
                            <span className="text-[10px] uppercase tracking-[0.14em] text-default-500">
                              {t("adPreview.clickToReveal")}
                            </span>
                          </button>
                        )
                      ) : (
                        <span>-</span>
                      )}
                    </div>
                    <div className="flex items-start gap-2 text-ink-muted">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{ad.address || "-"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {shouldShowReviews ? <AdReviewsPanel ad={ad} isOpen={isOpen} /> : null}
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            {t("common.close")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
