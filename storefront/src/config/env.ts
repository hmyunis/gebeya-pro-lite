import { stripTrailingSlash } from "@/lib/url";

const DEFAULT_API_BASE = "http://localhost:3000";
const DEFAULT_SITE_URL = "https://gebeya.pro";
const DEFAULT_SITE_NAME = "Gebeya Pro";
const DEFAULT_AUTHOR = "Hamdi Mohammed";
const DEFAULT_DESCRIPTION =
  "Gebeya Pro is a mobile-first marketplace for connecting buyers with merchant ads.";

export const PUBLIC_API_BASE: string =
  (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? DEFAULT_API_BASE;

export const API_BASE: string = stripTrailingSlash(PUBLIC_API_BASE);

export const PUBLIC_SITE_URL: string =
  stripTrailingSlash(
    (import.meta.env.PUBLIC_SITE_URL as string | undefined) ?? DEFAULT_SITE_URL
  );

export const PUBLIC_SITE_NAME: string =
  (import.meta.env.PUBLIC_SITE_NAME as string | undefined) ?? DEFAULT_SITE_NAME;

export const PUBLIC_AUTHOR_NAME: string =
  (import.meta.env.PUBLIC_AUTHOR_NAME as string | undefined) ?? DEFAULT_AUTHOR;

export const PUBLIC_DEFAULT_SEO_DESCRIPTION: string =
  (import.meta.env.PUBLIC_DEFAULT_SEO_DESCRIPTION as string | undefined) ??
  DEFAULT_DESCRIPTION;

export const PUBLIC_DEFAULT_OG_IMAGE: string =
  (import.meta.env.PUBLIC_DEFAULT_OG_IMAGE as string | undefined) ??
  `${PUBLIC_SITE_URL}/favicons/web-app-manifest-512x512.png`;

export const PUBLIC_TELEGRAM_BOT_NAME: string =
  (import.meta.env.PUBLIC_TELEGRAM_BOT_NAME as string | undefined) ??
  "YOUR_BOT_NAME";

export const PUBLIC_CONTACT_EMAIL: string =
  (import.meta.env.PUBLIC_CONTACT_EMAIL as string | undefined) ??
  "contact@gebeya.pro";

export const PUBLIC_SOCIAL_GITHUB_URL: string =
  (import.meta.env.PUBLIC_SOCIAL_GITHUB_URL as string | undefined) ??
  "https://github.com";

export const PUBLIC_SOCIAL_TIKTOK_URL: string =
  (import.meta.env.PUBLIC_SOCIAL_TIKTOK_URL as string | undefined) ??
  "https://www.tiktok.com";

export const PUBLIC_SOCIAL_TELEGRAM_URL: string =
  (import.meta.env.PUBLIC_SOCIAL_TELEGRAM_URL as string | undefined) ??
  (PUBLIC_TELEGRAM_BOT_NAME && PUBLIC_TELEGRAM_BOT_NAME !== "YOUR_BOT_NAME"
    ? `https://t.me/${PUBLIC_TELEGRAM_BOT_NAME}`
    : "https://t.me");
