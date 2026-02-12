import type { AuthUser } from "@/features/auth/store/authStore";
import { stripTrailingSlash } from "@/lib/url";

export function getUserDisplayName(user: AuthUser | null): string {
  if (!user) return "";
  const firstName = user.firstName?.trim();
  if (firstName) return firstName;

  const username = user.username?.trim();
  if (username) return username.startsWith("@") ? username : `@${username}`;

  const loginUsername = user.loginUsername?.trim();
  if (loginUsername) {
    return loginUsername.startsWith("@") ? loginUsername : `@${loginUsername}`;
  }

  return `User ${user.userId}`;
}

export function getInitials(displayName: string): string {
  const clean = displayName.replace(/^@/, "").trim();
  if (!clean) return "GP";

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "GP";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function getAvatarSrc(user: AuthUser | null, apiBase: string): string | null {
  if (!user?.avatarUrl) return null;
  const value = user.avatarUrl.trim();
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  const normalizedBase = stripTrailingSlash(apiBase);
  const normalizedPath = value.startsWith("/") ? value : `/${value}`;
  return `${normalizedBase}${normalizedPath}`;
}
