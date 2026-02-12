import { I18nProvider, useI18n } from "@/features/i18n";
import { SearchX } from "lucide-react";

export default function NotFoundContent() {
  return (
    <I18nProvider>
      <NotFoundContentBody />
    </I18nProvider>
  );
}

function NotFoundContentBody() {
  const { t } = useI18n();

  return (
    <section className="glass-strong mx-auto max-w-2xl rounded-3xl px-6 py-10 text-center md:px-10 md:py-14">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-black/10 bg-white/75 shadow-[0_16px_35px_-20px_rgba(18,20,26,0.55)]">
        <SearchX className="h-7 w-7 text-[#0f2a4d]" aria-hidden="true" />
      </div>
      <p className="mt-4 text-[11px] uppercase tracking-[0.35em] text-[#0f2a4d]">
        {t("notFound.error")}
      </p>
      <h1 className="font-display mt-3 text-3xl leading-tight md:text-5xl">
        {t("notFound.heading")}
      </h1>
      <p className="mt-4 text-sm text-ink-muted md:text-base">{t("notFound.body")}</p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <a
          href="/"
          className="rounded-full bg-[#12141a] px-5 py-2.5 text-xs font-semibold text-white shadow-[0_16px_40px_-24px_rgba(18,20,26,0.7)] transition-transform duration-300 hover:-translate-y-0.5"
        >
          {t("notFound.goHome")}
        </a>
        <a
          href="/login"
          className="rounded-full border border-black/10 bg-white/80 px-5 py-2.5 text-xs font-semibold text-[#12141a] shadow-[0_16px_40px_-28px_rgba(18,20,26,0.55)] transition-transform duration-300 hover:-translate-y-0.5"
        >
          {t("common.signIn")}
        </a>
      </div>
    </section>
  );
}
