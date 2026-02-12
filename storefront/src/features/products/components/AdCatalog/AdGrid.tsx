import { Button } from "@heroui/react";

import type { Ad } from "@/features/products/types";
import { useI18n } from "@/features/i18n";
import { AdCard } from "./AdCard";

export function AdGrid({
  ads,
  isLoading,
  error,
  imageBase,
  onRetry,
  onPreview,
}: {
  ads: Ad[];
  isLoading: boolean;
  error: string | null;
  imageBase: string;
  onRetry: () => void;
  onPreview: (ad: Ad) => void;
}) {
  const { t } = useI18n();

  if (error) {
    return (
      <div className="glass col-span-full rounded-3xl p-8 text-center">
        <p className="font-display text-xl">{t("grid.snag")}</p>
        <p className="text-ink-muted mt-1 text-sm">{error}</p>
        <Button
          size="sm"
          variant="flat"
          className="theme-action-soft mt-4"
          onPress={onRetry}
        >
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {isLoading ? (
        Array.from({ length: 8 }).map((_, idx) => (
          <div
            key={`ad-skeleton-${idx}`}
            className="glass-strong relative flex h-full flex-col overflow-hidden rounded-2xl"
          >
            <div className="theme-skeleton relative aspect-4/3 overflow-hidden animate-pulse" />
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="theme-skeleton h-4 w-3/4 rounded-full animate-pulse" />
              <div className="mt-auto flex items-center justify-between">
                <div className="theme-skeleton h-4 w-16 rounded-full animate-pulse" />
                <div className="theme-skeleton h-3 w-10 rounded-full animate-pulse" />
              </div>
              <div className="theme-skeleton h-9 rounded-full animate-pulse" />
            </div>
          </div>
        ))
      ) : ads.length === 0 ? (
        <div className="glass col-span-full rounded-3xl p-8 text-center">
          <p className="font-display text-xl">{t("grid.noAds")}</p>
          <p className="text-ink-muted mt-1 text-sm">
            {t("grid.adjustFilters")}
          </p>
        </div>
      ) : (
        ads.map((ad) => (
          <AdCard
            key={ad.id}
            ad={ad}
            imageBase={imageBase}
            onPreview={onPreview}
          />
        ))
      )}
    </div>
  );
}

