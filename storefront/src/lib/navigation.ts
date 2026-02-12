export function getCurrentPathWithQueryAndHash(): string {
  if (typeof window === "undefined") return "/";
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

export function getCurrentPathWithUpdatedQueryParam(
  key: string,
  value: string,
): string {
  if (typeof window === "undefined") return "/";
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function consumeQueryFlag(
  key: string,
  expectedValue = "1",
): boolean {
  if (typeof window === "undefined") return false;

  const url = new URL(window.location.href);
  if (url.searchParams.get(key) !== expectedValue) {
    return false;
  }

  url.searchParams.delete(key);
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  return true;
}
