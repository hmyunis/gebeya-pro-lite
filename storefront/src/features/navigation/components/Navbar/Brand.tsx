import { NavbarBrand } from "@heroui/react";
import appLogo from "@/assets/logo.png";
import { useI18n } from "@/features/i18n";

const appLogoSrc = typeof appLogo === "string" ? appLogo : appLogo.src;

export function Brand() {
  const { t } = useI18n();

  return (
    <NavbarBrand>
      <a
        href="/"
        className="flex min-w-0 items-center gap-2 rounded-xl px-1 py-1 outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/60 sm:gap-3"
        aria-label={t("brand.goHome")}
      >
        <img
          src={appLogoSrc}
          alt={t("brand.logoAlt")}
          className="h-10 w-10 shrink-0 rounded-xl object-contain shadow-[0_12px_30px_-18px_rgba(11,36,71,0.8)] sm:h-11 sm:w-11"
        />
        <div className="min-w-0 flex flex-col leading-none">
          <span className="truncate text-base font-semibold tracking-tight sm:text-lg">
            Gebeya Pro
          </span>
          <span className="hidden text-[11px] uppercase tracking-[0.35em] text-ink-muted sm:block">
            {t("common.marketplace")}
          </span>
        </div>
      </a>
    </NavbarBrand>
  );
}
