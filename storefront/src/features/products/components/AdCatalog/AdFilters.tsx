import { Button, Radio, RadioGroup } from "@heroui/react";
import { Check } from "lucide-react";

import type { Category, PriceRange } from "@/features/products/types";
import { formatPriceRangeLabel } from "@/features/products/utils/pricing";
import { useI18n } from "@/features/i18n";
import { resolveImageUrl } from "@/lib/images";

export function AdFilters({
  categories,
  priceRanges,
  activeCategories,
  onToggleCategory,
  priceBucket,
  onPriceBucketChange,
  isLoading,
  error,
  onReset,
  onRetry,
  imageBase,
  className,
}: {
  categories: Category[];
  priceRanges: PriceRange[];
  activeCategories: Set<number>;
  onToggleCategory: (categoryId: number, checked: boolean) => void;
  priceBucket: string;
  onPriceBucketChange: (value: string) => void;
  isLoading: boolean;
  error: string | null;
  onReset: () => void;
  onRetry: () => void;
  imageBase: string;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <aside
      className={`glass-strong rounded-3xl p-4 md:p-5 text-xs ${className ?? ""}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.35em] text-ink-muted">
          {t("common.filters")}
        </p>
        <Button
          size="sm"
          variant="flat"
          className="theme-action-soft"
          onPress={onReset}
        >
          {t("common.reset")}
        </Button>
      </div>

      <div className="mt-4 space-y-5">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">{t("common.category")}</p>
            {activeCategories.size > 0 ? (
              <span className="theme-pill rounded-full px-2 py-0.5 text-[10px]">
                {activeCategories.size}
              </span>
            ) : null}
          </div>
          {isLoading ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={`cat-skeleton-${idx}`}
                  className="theme-skeleton h-14 w-full animate-pulse rounded-2xl"
                />
              ))}
            </div>
          ) : error ? (
            <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50/80 p-3 text-[11px] text-rose-700">
              <p>{t("filters.unable")}</p>
              <Button
                size="sm"
                variant="flat"
                className="mt-2 border border-rose-200 bg-rose-50"
                onPress={onRetry}
              >
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() =>
                    onToggleCategory(cat.id, !activeCategories.has(cat.id))
                  }
                  aria-pressed={activeCategories.has(cat.id)}
                  className={[
                    "group flex w-full items-center gap-3 rounded-2xl border px-2.5 py-2 text-left transition",
                    activeCategories.has(cat.id)
                      ? "border-primary/40 bg-primary/10 shadow-[0_10px_24px_-18px_rgba(37,99,235,0.7)]"
                      : "border-default-200 bg-background/65 hover:border-default-300 hover:bg-background/85",
                  ].join(" ")}
                >
                  <span className="relative shrink-0">
                    {cat.thumbnailUrl ? (
                      <img
                        src={resolveImageUrl(imageBase, cat.thumbnailUrl) ?? cat.thumbnailUrl}
                        alt={cat.name}
                        className="h-12 w-12 rounded-xl object-cover ring-1 ring-default-300/70"
                      />
                    ) : (
                      <span className="theme-image-placeholder text-ink-muted inline-flex h-12 w-12 items-center justify-center rounded-xl text-sm font-semibold ring-1 ring-default-300/70">
                        {cat.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{cat.name}</span>
                    <span className="text-ink-muted block text-[11px]">
                      {activeCategories.has(cat.id) ? "Included in results" : "Tap to include"}
                    </span>
                  </span>
                  <span
                    className={[
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                      activeCategories.has(cat.id)
                        ? "border-primary bg-primary text-white"
                        : "border-default-300 text-transparent group-hover:text-default-300",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold">{t("common.priceRangeBirr")}</p>
          {isLoading ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div
                  key={`price-skeleton-${idx}`}
                  className="theme-skeleton h-4 w-32 animate-pulse rounded-full"
                />
              ))}
            </div>
          ) : (
            <RadioGroup
              value={priceBucket}
              onValueChange={onPriceBucketChange}
              className="mt-2"
            >
              <Radio value="all">{t("common.all")}</Radio>
              {priceRanges.map((range) => (
                <Radio key={range.id} value={range.id}>
                  {formatPriceRangeLabel(range)}
                </Radio>
              ))}
            </RadioGroup>
          )}
        </div>
      </div>
    </aside>
  );
}

