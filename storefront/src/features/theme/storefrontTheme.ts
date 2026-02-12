export type StorefrontTheme = "light" | "dark";

export const STOREFRONT_THEME_STORAGE_KEY = "gebeya-storefront-theme";

const LIGHT_THEME_COLOR = "#0b1427";
const DARK_THEME_COLOR = "#101c32";

function isStorefrontTheme(value: string | null): value is StorefrontTheme {
  return value === "light" || value === "dark";
}

export function readStoredStorefrontTheme(): StorefrontTheme | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(STOREFRONT_THEME_STORAGE_KEY);
    return isStorefrontTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function getSystemStorefrontTheme(): StorefrontTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveStorefrontTheme(): StorefrontTheme {
  return readStoredStorefrontTheme() ?? getSystemStorefrontTheme();
}

type ApplyStorefrontThemeOptions = {
  persist?: boolean;
};

export function applyStorefrontTheme(
  theme: StorefrontTheme,
  options?: ApplyStorefrontThemeOptions
) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");

  const themeColor = theme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", themeColor);
  }

  if (options?.persist === false) return;
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STOREFRONT_THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage write failures (private mode, blocked storage, etc.)
  }
}
