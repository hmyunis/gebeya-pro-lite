import { useEffect, useMemo, useState } from "react";
import { Button, Input } from "@heroui/react";
import { SlidersHorizontal } from "lucide-react";

import { stripTrailingSlash } from "@/lib/url";
import { useAds } from "@/features/products/hooks/useAds";
import { useAdFilters } from "@/features/products/hooks/useAdFilters";
import { useAuth } from "@/features/auth/hooks/useAuth";
import QueryProvider from "@/app/QueryProvider";
import { I18nProvider, useI18n } from "@/features/i18n";
import { consumeQueryFlag } from "@/lib/navigation";

import { AdFilters } from "./AdFilters";
import { AdGrid } from "./AdGrid";
import { AdPreviewModal } from "./AdPreviewModal";
import { PostAdModal } from "./PostAdModal";
import type { Ad } from "@/features/products/types";

const REVIEW_DRAFT_STORAGE_KEY = "pending-ad-review-draft-v1";

function readPendingReviewAdSnapshot(): Ad | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(REVIEW_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as
      | {
          adSnapshot?: Ad;
        }
      | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.adSnapshot || typeof parsed.adSnapshot !== "object") return null;
    if (typeof parsed.adSnapshot.id !== "number") return null;
    return parsed.adSnapshot;
  } catch {
    return null;
  }
}

export default function AdCatalog({
  apiBase,
  imageBase,
}: {
  apiBase: string;
  imageBase: string;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-home-ready", "true");
    return () => {
      document.documentElement.removeAttribute("data-home-ready");
    };
  }, []);

  return (
    <I18nProvider>
      <QueryProvider>
        <AdCatalogContent apiBase={apiBase} imageBase={imageBase} />
      </QueryProvider>
    </I18nProvider>
  );
}

function AdCatalogContent({
  apiBase,
  imageBase,
}: {
  apiBase: string;
  imageBase: string;
}) {
  const { t } = useI18n();
  const baseUrl = useMemo(() => stripTrailingSlash(apiBase), [apiBase]);
  const { user, authReady } = useAuth();

  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isCompactFiltersViewport, setIsCompactFiltersViewport] =
    useState(false);
  const [search, setSearch] = useState("");
  const [previewAd, setPreviewAd] = useState<Ad | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<number>>(
    () => new Set(),
  );
  const [priceBucket, setPriceBucket] = useState("all");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const syncViewport = () => setIsCompactFiltersViewport(mediaQuery.matches);

    syncViewport();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  useEffect(() => {
    if (!isCompactFiltersViewport) {
      setIsFilterDrawerOpen(false);
    }
  }, [isCompactFiltersViewport]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!authReady) return;
    if (!consumeQueryFlag("openPostAd")) return;
    setIsPostModalOpen(true);
  }, [authReady]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!authReady) return;
    if (!consumeQueryFlag("resumeReview")) return;

    const adSnapshot = readPendingReviewAdSnapshot();
    if (adSnapshot) {
      setPreviewAd(adSnapshot);
    }
  }, [authReady]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const openFromBottomNav = (event: Event) => {
      event.preventDefault();
      setIsPostModalOpen(true);
    };
    window.addEventListener("open-post-ad", openFromBottomNav);
    return () => window.removeEventListener("open-post-ad", openFromBottomNav);
  }, []);

  const activeCategoryIds = useMemo(
    () => Array.from(activeCategories),
    [activeCategories],
  );

  const filtersQuery = useMemo(() => {
    const params = new URLSearchParams();
    const trimmed = search.trim();

    if (trimmed) {
      params.set("q", trimmed);
    }

    if (activeCategoryIds.length > 0) {
      params.set("categoryIds", activeCategoryIds.join(","));
    }

    return params.toString();
  }, [activeCategoryIds, search]);

  const {
    categories,
    priceRanges,
    isLoading: filtersLoading,
    error: filtersError,
    reload: reloadFilters,
  } = useAdFilters(baseUrl, filtersQuery);

  const selectedRange = useMemo(
    () => priceRanges.find((range) => range.id === priceBucket),
    [priceBucket, priceRanges],
  );

  useEffect(() => {
    if (priceBucket === "all") return;
    if (!selectedRange) {
      setPriceBucket("all");
    }
  }, [priceBucket, selectedRange]);

  const adQuery = useMemo(() => {
    const params = new URLSearchParams();
    const trimmed = search.trim();

    if (trimmed) {
      params.set("q", trimmed);
    }

    if (activeCategoryIds.length > 0) {
      params.set("categoryIds", activeCategoryIds.join(","));
    }

    if (priceBucket !== "all" && selectedRange) {
      params.set("minPrice", String(selectedRange.min));
      params.set("maxPrice", String(selectedRange.max));
    }

    params.set("page", "1");
    params.set("limit", "100");
    params.set("status", "APPROVED");
    return params.toString();
  }, [activeCategoryIds, priceBucket, search, selectedRange]);

  const { ads, resultCount, isLoading, error, reload } = useAds(
    baseUrl,
    adQuery,
  );

  const clearFilters = () => {
    setSearch("");
    setActiveCategories(new Set());
    setPriceBucket("all");
  };

  const handleToggleCategory = (categoryId: number, checked: boolean) => {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(categoryId);
      } else {
        next.delete(categoryId);
      }
      return next;
    });
  };

  return (
    <section id="collection" className="mt-10 pb-24">
      <div className="flex flex-col items-center gap-4">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-[0.35em] text-[color:var(--accent-2)]">
            {t("product.browse")}
          </p>
          <h2 className="font-display mt-2 text-2xl md:text-3xl">
            {t("product.findFits")}
          </h2>
        </div>
        <div className="flex w-full max-w-2xl items-center gap-2">
          {isCompactFiltersViewport ? (
            <Button
              isIconOnly
              variant="flat"
              radius="full"
              aria-label={t("product.openFilters")}
              className="theme-action-soft shrink-0"
              onPress={() => setIsFilterDrawerOpen(true)}
            >
              <SlidersHorizontal size={18} />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <Input
              size="md"
              value={search}
              onValueChange={setSearch}
              placeholder={t("product.searchPlaceholder")}
              variant="bordered"
              radius="full"
              classNames={{
                inputWrapper: "theme-field shadow-[var(--shadow-soft)]",
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {!isCompactFiltersViewport ? (
          <AdFilters
            categories={categories}
            priceRanges={priceRanges}
            activeCategories={activeCategories}
            onToggleCategory={handleToggleCategory}
            priceBucket={priceBucket}
            onPriceBucketChange={setPriceBucket}
            isLoading={filtersLoading}
            error={filtersError}
            onReset={clearFilters}
            onRetry={reloadFilters}
            imageBase={imageBase}
          />
        ) : null}

        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="theme-pill rounded-full px-3 py-1 text-[11px]">
              {isLoading
                ? t("common.loading")
                : t("product.results", { count: resultCount })}
            </span>
            {search ? (
              <span className="theme-pill rounded-full px-3 py-1 text-[11px]">
                {t("product.searchTag", { query: search })}
              </span>
            ) : null}
          </div>

          <AdGrid
            ads={ads}
            isLoading={isLoading}
            error={error}
            imageBase={imageBase}
            onRetry={reload}
            onPreview={setPreviewAd}
          />
        </div>
      </div>

      {isCompactFiltersViewport ? (
        <div
          className={`fixed inset-0 z-50 ${isFilterDrawerOpen ? "pointer-events-auto" : "pointer-events-none"}`}
          aria-hidden={!isFilterDrawerOpen}
        >
          <div
            className={`theme-overlay absolute inset-0 transition-opacity ${isFilterDrawerOpen ? "opacity-100" : "opacity-0"}`}
            onClick={() => setIsFilterDrawerOpen(false)}
          ></div>

          <div
            className={`theme-drawer absolute left-0 top-0 h-full w-[80%] max-w-105 transform overflow-hidden shadow-2xl backdrop-blur-xl transition-transform sm:w-[40%] ${isFilterDrawerOpen ? "translate-x-0" : "-translate-x-full"}`}
            role={isFilterDrawerOpen ? "dialog" : undefined}
            aria-modal={isFilterDrawerOpen ? "true" : undefined}
            aria-hidden={!isFilterDrawerOpen}
          >
            <div className="theme-divider flex items-center justify-between border-b px-5 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.35em] text-ink-muted">
                  {t("common.filters")}
                </p>
                <p className="text-lg font-semibold">{t("product.refine")}</p>
              </div>
              <Button
                isIconOnly
                variant="light"
                radius="full"
                aria-label={t("product.closeFilters")}
                className="theme-action-soft"
                onPress={() => setIsFilterDrawerOpen(false)}
              >
                ✕
              </Button>
            </div>

            <AdFilters
              categories={categories}
              priceRanges={priceRanges}
              activeCategories={activeCategories}
              onToggleCategory={handleToggleCategory}
              priceBucket={priceBucket}
              onPriceBucketChange={setPriceBucket}
              isLoading={filtersLoading}
              error={filtersError}
              onReset={clearFilters}
              onRetry={reloadFilters}
              imageBase={imageBase}
              className="h-[calc(100%-81px)] overflow-y-auto rounded-none border-0 bg-transparent p-5 shadow-none backdrop-blur-none"
            />
          </div>
        </div>
      ) : null}

      <AdPreviewModal
        isOpen={Boolean(previewAd)}
        onClose={() => setPreviewAd(null)}
        ad={previewAd}
        imageBase={imageBase}
      />

      <PostAdModal
        isOpen={isPostModalOpen}
        onClose={() => setIsPostModalOpen(false)}
        categories={categories}
        isLoggedIn={Boolean(user)}
        onPosted={() => reload()}
      />
    </section>
  );
}

