import enFlag from "@/assets/locales/en.svg";
import amFlag from "@/assets/locales/am.svg";
import type { LocaleCode } from "./config";
import { useI18n } from "./provider";

const FLAGS: Record<LocaleCode, string> = {
  en: typeof enFlag === "string" ? enFlag : enFlag.src,
  am: typeof amFlag === "string" ? amFlag : amFlag.src,
};

export function LanguageToggle({
  className,
}: {
  className?: string;
}) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("locale.switcherLabel")}
      className={[
        "inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/70 p-1 shadow-[0_10px_26px_-20px_rgba(16,19,25,0.8)]",
        className ?? "",
      ].join(" ")}
    >
      {(["en", "am"] as const).map((option) => {
        const isActive = option === locale;
        const label = t(option === "en" ? "locale.en" : "locale.am");
        return (
          <button
            key={option}
            type="button"
            onClick={() => setLocale(option)}
            aria-pressed={isActive}
            aria-label={label}
            className={[
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition",
              isActive
                ? "bg-[#0f2a4d] text-white"
                : "text-[#12141a] hover:bg-black/5",
            ].join(" ")}
          >
            <img src={FLAGS[option]} alt={label} className="h-4 w-4 rounded-full object-cover" />
          </button>
        );
      })}
    </div>
  );
}
