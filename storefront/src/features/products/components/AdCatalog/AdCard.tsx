import { formatBirrLabel } from "@/lib/money";
import { resolveImageUrl } from "@/lib/images";
import type { Ad } from "@/features/products/types";
import { useI18n } from "@/features/i18n";
import { MapPin } from "lucide-react";

export function AdCard({
  ad,
  imageBase,
  onPreview,
}: {
  ad: Ad;
  imageBase: string;
  onPreview?: (ad: Ad) => void;
}) {
  const { t } = useI18n();
  const previewImagePath =
    ad.imageUrls && ad.imageUrls.length > 0
      ? ad.imageUrls[0]
      : ad.imageUrl;
  const image = resolveImageUrl(imageBase, previewImagePath);
  const numericPrice =
    typeof ad.price === "number" ? ad.price : Number(ad.price);
  const isFree = Number.isFinite(numericPrice) && numericPrice <= 0;
  const descriptionText =
    ad.description && ad.description.trim().length > 0
      ? ad.description
      : t("product.noDescription");
  const addressText = ad.address && ad.address.trim().length > 0 ? ad.address : "-";

  return (
    <div
      role="button"
      tabIndex={0}
      className="group glass-strong relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/60"
      onClick={() => onPreview?.(ad)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPreview?.(ad);
        }
      }}
    >
      <div className="theme-image-placeholder relative aspect-4/3 overflow-hidden p-1 text-left">
        {image ? (
          <img
            src={image}
            alt={ad.name}
            className="h-full w-full rounded-xl object-fill"
          />
        ) : (
          <div className="theme-image-placeholder h-full w-full" />
        )}

        {ad.category?.name ? (
          <span className="theme-chip absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.3em]">
            {ad.category.name}
          </span>
        ) : null}
        <span className="theme-chip-contrast absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.2em]">
          {t("product.preview")}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {isFree ? (
          <p className="text-base font-bold uppercase tracking-[0.16em] text-emerald-500 md:text-lg">
            {t("product.free")}
          </p>
        ) : (
          <p className="text-lg font-bold tracking-tight dark:text-primary text-(--cta) md:text-xl">
            {formatBirrLabel(ad.price)}
          </p>
        )}

        <h3 className="text-sm font-semibold leading-snug line-clamp-1 md:text-base">
          {ad.name}
        </h3>

        <p className="line-clamp-3 text-xs leading-relaxed text-ink-muted md:text-sm">
          {descriptionText}
        </p>

        <div className="mt-auto rounded-lg border border-default-200/80 bg-background/60 px-2.5 py-1.5">
          <p className="flex items-center gap-1.5 line-clamp-1 text-xs text-ink-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="line-clamp-1">{addressText}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
