import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_LOCALE,
  LOCALE_CHANGED_EVENT,
  LOCALE_STORAGE_KEY,
  type LocaleCode,
  getLocaleTag,
  resolveLocale,
} from "./config";
import { type TranslationKey, getTranslation } from "./translations";

type PrimitiveValue = string | number;

type TranslationParams = Record<string, PrimitiveValue | null | undefined>;

type I18nContextValue = {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  localeTag: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function applyDocumentLocale(locale: LocaleCode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = getLocaleTag(locale);
}

function readStoredLocale(): LocaleCode {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  try {
    return resolveLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

function formatTemplate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, token: string) => {
    const value = params[token];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => readStoredLocale());

  const setLocale = useCallback((nextLocale: LocaleCode) => {
    setLocaleState(nextLocale);
    applyDocumentLocale(nextLocale);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
      } catch {
        // Ignore storage issues
      }
      window.dispatchEvent(
        new CustomEvent(LOCALE_CHANGED_EVENT, {
          detail: { locale: nextLocale },
        })
      );
    }
  }, []);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== LOCALE_STORAGE_KEY) return;
      const nextLocale = resolveLocale(event.newValue);
      setLocaleState(nextLocale);
      applyDocumentLocale(nextLocale);
    };

    const onLocaleChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ locale?: string }>;
      const nextLocale = resolveLocale(customEvent.detail?.locale);
      setLocaleState(nextLocale);
      applyDocumentLocale(nextLocale);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(LOCALE_CHANGED_EVENT, onLocaleChange as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LOCALE_CHANGED_EVENT, onLocaleChange as EventListener);
    };
  }, []);

  const t = useCallback((key: TranslationKey, params?: TranslationParams) => {
    const template = getTranslation(locale, key);
    return formatTemplate(template, params);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t,
    localeTag: getLocaleTag(locale),
  }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
