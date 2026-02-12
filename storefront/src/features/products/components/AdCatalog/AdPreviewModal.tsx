import { Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ScrollShadow } from "@heroui/react";
import { MapPin, PhoneCall } from "lucide-react";
import type { Ad } from "@/features/products/types";
import { resolveImageUrl } from "@/lib/images";
import { formatBirrLabel } from "@/lib/money";
import { formatLocaleDate, useI18n } from "@/features/i18n";
import { formatEthiopianPhoneForDisplay } from "@/features/products/utils/phoneNumber";
import { AdImageCarousel } from "./AdImageCarousel";
import { AdReviewsPanel } from "./AdReviewsPanel";

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
                    Contact
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-ink-muted">
                      <PhoneCall className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {telHref ? (
                        <a
                          href={telHref}
                          className="font-medium text-primary hover:underline"
                          aria-label={`Call ${formatEthiopianPhoneForDisplay(ad.phoneNumber)}`}
                        >
                          {formatEthiopianPhoneForDisplay(ad.phoneNumber)}
                        </a>
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

              <AdReviewsPanel ad={ad} isOpen={isOpen} />
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
