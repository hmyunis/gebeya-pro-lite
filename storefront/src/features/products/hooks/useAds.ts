import { useCallback, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { Ad } from "../types";
import { api, getApiErrorMessage } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type AdsState = {
  ads: Ad[];
  resultCount: number;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
};

export function useAds(baseUrl: string, queryString: string): AdsState {
  const url = useMemo(() => {
    const suffix = queryString ? `?${queryString}` : "";
    return `${baseUrl}/v1/ads${suffix}`;
  }, [baseUrl, queryString]);

  const debouncedUrl = useDebouncedValue(url, 300);

  const query = useQuery({
    queryKey: ["ads", debouncedUrl],
    queryFn: async ({ signal }) => {
      const response = await api.get(debouncedUrl, { signal });
      const payload: any = response.data;
      const data = Array.isArray(payload) ? payload : payload?.data;
      const meta = payload?.meta ?? {};

      const items = Array.isArray(data) ? (data as Ad[]) : [];
      const total = typeof meta.total === "number" ? meta.total : items.length;
      return { items, total };
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const reload = useCallback(() => {
    void query.refetch();
  }, [query.refetch]);

  return {
    ads: query.data?.items ?? [],
    resultCount: query.data?.total ?? 0,
    isLoading: query.isPending && !query.data,
    error: query.error ? getApiErrorMessage(query.error) : null,
    reload,
  };
}

