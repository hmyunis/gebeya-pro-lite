import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Spinner } from "@heroui/react";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { requireLogin } from "@/features/auth/store/authStore";
import { getCurrentPathWithQueryAndHash } from "@/lib/navigation";
import { I18nProvider, useI18n } from "@/features/i18n";

export default function RequireAuth({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <RequireAuthBody>{children}</RequireAuthBody>
    </I18nProvider>
  );
}

function RequireAuthBody({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user, authReady } = useAuth();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (!authReady) return;
    if (user) return;
    if (hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    requireLogin(getCurrentPathWithQueryAndHash());
  }, [authReady, user]);

  if (!authReady) {
    return (
      <section className="mx-auto flex min-h-[40vh] max-w-lg items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white/75 px-5 py-4 text-sm text-ink-muted shadow-[0_20px_40px_-28px_rgba(17,20,30,0.6)]">
          <Spinner size="sm" />
          <span>{t("requireAuth.checking")}</span>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="mx-auto flex min-h-[40vh] max-w-lg items-center justify-center">
        <div className="rounded-2xl border border-black/10 bg-white/75 px-5 py-4 text-sm text-ink-muted shadow-[0_20px_40px_-28px_rgba(17,20,30,0.6)]">
          {t("requireAuth.redirecting")}
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
