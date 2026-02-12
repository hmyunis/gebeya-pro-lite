import axios from 'axios';

const envApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
// Prefer same-origin API path in dev/tunnel mode; override with VITE_API_URL when needed.
export const API_URL = envApiUrl && envApiUrl.length > 0 ? envApiUrl : '/v1';

const AUTH_TOKEN_STORAGE_KEY = 'adminAuthToken';

function getAdminLoginPath(): string {
  const pathname = window.location.pathname;
  const isAdminSubpath =
    pathname === '/admin' || pathname.startsWith('/admin/');
  return isAdminSubpath ? '/admin/login' : '/login';
}

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Crucial: Sends the JWT Cookie
});

export function getAuthToken(): string | null {
  try {
    return window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string) {
  try {
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage errors (e.g. blocked storage in private mode)
  }
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export function clearAuthToken() {
  try {
    window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore
  }
  delete api.defaults.headers.common.Authorization;
}

// Attach Authorization header as a fallback when cookies are blocked (e.g. cross-site tunnels / 3rd-party cookie blocking).
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response Interceptor: Handle 401 (Unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthToken();
      // Redirect to login if session expires
      const loginPath = getAdminLoginPath();
      if (window.location.pathname !== loginPath) {
        window.location.assign(loginPath);
      }
    }
    return Promise.reject(error);
  }
);

// Initialize default Authorization header on first load (if present).
const bootToken = getAuthToken();
if (bootToken) {
  api.defaults.headers.common.Authorization = `Bearer ${bootToken}`;
}

