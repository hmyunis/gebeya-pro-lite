export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

export function normalizePagination(page?: string, limit?: string) {
  const parsedPage = Number.parseInt(page ?? '', 10);
  const parsedLimit = Number.parseInt(limit ?? '', 10);

  const safePage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_PAGE;
  const safeLimitRaw =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : DEFAULT_LIMIT;
  const safeLimit = Math.min(safeLimitRaw, MAX_LIMIT);
  const skip = (safePage - 1) * safeLimit;

  return { page: safePage, limit: safeLimit, skip };
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: totalPages > 0 && page < totalPages,
    hasPrev: totalPages > 0 && page > 1,
  };
}
