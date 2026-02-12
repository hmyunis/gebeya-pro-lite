export type CookieSameSite = 'lax' | 'strict' | 'none';

const AUTH_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VISITOR_COOKIE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export function resolveCookieSameSite(
  value = process.env.COOKIE_SAMESITE,
): CookieSameSite {
  const normalized = String(value ?? 'lax')
    .trim()
    .toLowerCase();
  if (
    normalized === 'lax' ||
    normalized === 'strict' ||
    normalized === 'none'
  ) {
    return normalized;
  }
  return 'lax';
}

export function resolveCookieSecure(
  value = process.env.COOKIE_SECURE,
  nodeEnv = process.env.NODE_ENV,
) {
  if (value !== undefined) {
    return value === 'true';
  }
  return nodeEnv === 'production';
}

export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: resolveCookieSecure(),
    sameSite: resolveCookieSameSite(),
    path: '/',
    maxAge: AUTH_COOKIE_TTL_MS,
  } as const;
}

export function getVisitorCookieOptions() {
  return {
    httpOnly: false,
    secure: resolveCookieSecure(),
    sameSite: 'lax' as const,
    path: '/',
    expires: new Date(Date.now() + VISITOR_COOKIE_TTL_MS),
  };
}
