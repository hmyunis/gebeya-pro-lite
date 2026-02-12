import { QueryClient } from "@tanstack/react-query";

const QUERY_CLIENT_KEY = "__GEBEYA_STOREFRONT_QUERY_CLIENT__";

type QueryClientGlobal = typeof globalThis & {
  [QUERY_CLIENT_KEY]?: QueryClient;
};

export function getQueryClient(): QueryClient {
  const globalScope = globalThis as QueryClientGlobal;
  const existing = globalScope[QUERY_CLIENT_KEY];
  if (existing) return existing;

  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  globalScope[QUERY_CLIENT_KEY] = client;
  return client;
}

