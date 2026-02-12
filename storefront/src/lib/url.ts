export function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function joinUrl(base: string, path: string): string {
  if (!base) return path;
  if (!path) return base;

  if (base.endsWith("/") && path.startsWith("/")) {
    return `${base}${path.slice(1)}`;
  }

  if (!base.endsWith("/") && !path.startsWith("/")) {
    return `${base}/${path}`;
  }

  return `${base}${path}`;
}

