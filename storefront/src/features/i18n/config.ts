export const SUPPORTED_LOCALES = ["en", "am"] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: LocaleCode = "am";

export const LOCALE_STORAGE_KEY = "gebeya-storefront-locale";
export const LOCALE_CHANGED_EVENT = "gebeya:locale-changed";

export const LOCALE_TAGS: Record<LocaleCode, string> = {
  en: "en-US",
  am: "am-ET",
};

export const LOCALE_LABELS: Record<LocaleCode, string> = {
  en: "English",
  am: "Amharic",
};

export function isSupportedLocale(value: string | null | undefined): value is LocaleCode {
  return value === "en" || value === "am";
}

export function resolveLocale(value: string | null | undefined): LocaleCode {
  if (isSupportedLocale(value ?? null)) {
    return value as LocaleCode;
  }
  return DEFAULT_LOCALE;
}

export function getLocaleTag(locale: LocaleCode): string {
  return LOCALE_TAGS[locale];
}
