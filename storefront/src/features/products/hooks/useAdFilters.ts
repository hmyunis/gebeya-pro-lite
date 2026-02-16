import { useCallback, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { Category, PriceRange } from "../types";
import { api, getApiErrorMessage } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type AdFiltersState = {
  categories: Category[];
  priceRanges: PriceRange[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
};

export function useAdFilters(baseUrl: string, queryString: string): AdFiltersState {
  const url = useMemo(() => {
    const suffix = queryString ? `?${queryString}` : "";
    return `${baseUrl}/v1/ads/filters${suffix}`;
  }, [baseUrl, queryString]);

  const debouncedUrl = useDebouncedValue(url, 250);

  const query = useQuery({
    queryKey: ["ads", "filters", debouncedUrl],
    queryFn: async () => {
      const response = await api.get(debouncedUrl);
      const payload: any = response.data;
      const categories = Array.isArray(payload?.categories)
        ? (payload.categories as Category[])
        : [];
      const priceRanges = Array.isArray(payload?.priceRanges)
        ? (payload.priceRanges as PriceRange[])
        : [];
      return { categories, priceRanges };
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const reload = useCallback(() => {
    void query.refetch();
  }, [query.refetch]);

  return {
    categories: query.data?.categories ?? [],
    priceRanges: query.data?.priceRanges ?? [],
    isLoading: query.isPending && !query.data,
    error: query.error ? getApiErrorMessage(query.error) : null,
    reload,
  };
}

