import { useEffect, useRef, useState } from "react";
import enFlag from "@/assets/locales/en.svg";
import amFlag from "@/assets/locales/am.svg";

import {
  LOCALE_CHANGED_EVENT,
  LOCALE_STORAGE_KEY,
  type LocaleCode,
  getLocaleTag,
  isSupportedLocale,
} from "@/features/i18n/config";

const FLAGS: Record<LocaleCode, string> = {
  en: typeof enFlag === "string" ? enFlag : enFlag.src,
  am: typeof amFlag === "string" ? amFlag : amFlag.src,
};

function applyLocale(nextLocale: LocaleCode) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = getLocaleTag(nextLocale);
  }

  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  } catch {
    // Ignore storage issues.
  }

  window.dispatchEvent(
    new CustomEvent(LOCALE_CHANGED_EVENT, {
      detail: { locale: nextLocale },
    }),
  );
}

export default function LocalePreferenceModal() {
  const [isOpen, setIsOpen] = useState(false);
  const englishButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isSupportedLocale(storedLocale)) {
        return;
      }
    } catch {
      applyLocale("en");
      return;
    }

    applyLocale("en");
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    englishButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      applyLocale("en");
      setIsOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSelect = (nextLocale: LocaleCode) => {
    applyLocale(nextLocale);
    setIsOpen(false);
  };

  const handleDefaultToEnglish = () => {
    handleSelect("en");
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="locale-preference-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleDefaultToEnglish();
        }
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0f1f39] p-5 text-white shadow-[0_36px_80px_-28px_rgba(0,0,0,0.75)] sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="locale-preference-title" className="text-xl font-semibold tracking-tight">
              Choose your language
            </h2>
            <p className="mt-1 text-sm text-white/75">ቋንቋ ይምረጡ</p>
          </div>
          <button
            type="button"
            onClick={handleDefaultToEnglish}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Close language selection"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              x
            </span>
          </button>
        </div>

        <p className="mb-4 text-sm text-white/70">
          Select a language to continue.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            ref={englishButtonRef}
            type="button"
            onClick={() => handleSelect("en")}
            className="inline-flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-left font-semibold text-white transition hover:bg-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <img
              src={FLAGS.en}
              alt="English"
              className="h-5 w-5 rounded-full object-cover"
            />
            English
          </button>
          <button
            type="button"
            onClick={() => handleSelect("am")}
            className="inline-flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-left font-semibold text-white transition hover:bg-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <img
              src={FLAGS.am}
              alt="አማርኛ"
              className="h-5 w-5 rounded-full object-cover"
            />
            አማርኛ
          </button>
        </div>
      </div>
    </div>
  );
}
