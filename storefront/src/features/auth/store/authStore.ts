import { atom } from "nanostores";

import { api } from "@/lib/api";
import { clearAuthToken, getAuthToken, setAuthToken } from "@/features/auth/utils/token";

export type AuthUser = {
  userId: number;
  role?: string;
  firstName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  loginUsername?: string | null;
  hasTelegram?: boolean;
};

export const $user = atom<AuthUser | null>(null);
export const $authReady = atom(false);

let loadPromise: Promise<void> | null = null;

export async function loadUser(options: { force?: boolean } = {}): Promise<void> {
  const { force = false } = options;

  if (!force && $authReady.get()) return;
  if (!force && loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const response = await api.get<AuthUser>("/auth/me");
      $user.set(response.data);
    } catch {
      // If cookie auth is unavailable, try bearer token auth.
      const token = getAuthToken();
      if (!token) {
        $user.set(null);
        clearAuthToken();
      } else {
        try {
          const response = await api.get<AuthUser>("/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          $user.set(response.data);
        } catch {
          $user.set(null);
          clearAuthToken();
        }
      }
    } finally {
      $authReady.set(true);
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export function applyLoginResult(token: string | null, user?: AuthUser | null): void {
  if (token && token.trim().length > 0) {
    setAuthToken(token);
  }
  if (user) {
    $user.set(user);
    $authReady.set(true);
  }
}

export function setLoggedOut(): void {
  clearAuthToken();
  $user.set(null);
  $authReady.set(true);
}

export async function logout(): Promise<void> {
  setLoggedOut();
}

export function requireLogin(returnTo: string): void {
  if (typeof window === "undefined") return;
  const normalizedReturnTo =
    returnTo && returnTo.startsWith("/") ? returnTo : "/";
  const encoded = encodeURIComponent(normalizedReturnTo);
  window.location.assign(`/login?returnTo=${encoded}`);
}
