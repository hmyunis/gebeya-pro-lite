import { useEffect, useState } from "react";
import { Button, Card, CardBody, CardHeader, Spinner } from "@heroui/react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { I18nProvider, LanguageToggle, useI18n } from "@/features/i18n";
import { useTelegramAuthWidget } from "@/features/auth/hooks/useTelegramAuthWidget";
import { ArrowLeft } from "lucide-react";

export default function AuthLogin({
  telegramBot,
}: {
  telegramBot: string;
}) {
  return (
    <I18nProvider>
      <AuthLoginBody telegramBot={telegramBot} />
    </I18nProvider>
  );
}

function AuthLoginBody({
  telegramBot,
}: {
  telegramBot: string;
}) {
  const { t } = useI18n();
  const { user, authReady } = useAuth();
  const [returnTo, setReturnTo] = useState("/dashboard");
  const { widgetHostRef, isAuthorizing, widgetError } = useTelegramAuthWidget({
    telegramBot,
    returnTo,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const value = new URLSearchParams(window.location.search).get("returnTo");
    if (value && value.startsWith("/")) {
      setReturnTo(value);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user) return;
    window.location.replace(returnTo);
  }, [authReady, returnTo, user]);

  return (
    <div className="space-y-6 md:space-y-7">
      <div className="flex items-center justify-between">
        <Button
          as="a"
          href="/"
          variant="flat"
          radius="full"
          size="sm"
          startContent={<ArrowLeft size={16} />}
        >
          {t("common.home")}
        </Button>
        <LanguageToggle />
      </div>

      <div className="space-y-3 text-center">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--accent)]">Gebeya Pro</p>
        <h1 className="font-display text-3xl leading-tight text-[color:var(--ink)] md:text-4xl">
          {t("common.signIn")}
        </h1>
        <p className="text-sm text-[color:var(--ink)]/85">{t("auth.loginTelegramPrompt")}</p>
      </div>

      <Card className="w-full border border-[color:var(--border-strong)] bg-[color:var(--surface-strong)] shadow-[var(--shadow-strong)] backdrop-blur-2xl">
        <CardHeader className="flex flex-col items-start gap-2 px-6 pb-1 pt-6">
          <p className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--accent)]">
            {t("auth.telegramLoginLabel")}
          </p>
          <h2 className="font-display text-2xl leading-tight text-[color:var(--ink)]">
            {t("auth.continueToAccount")}
          </h2>
        </CardHeader>
        <CardBody className="space-y-4 px-6 pb-6 pt-3">
          <div className="rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--surface-raised)] p-4">
            <p className="mb-2 text-xs text-[color:var(--ink)]/85">{t("auth.oneTapSignIn")}</p>
            <div ref={widgetHostRef} className="min-h-12" />
            {widgetError ? <p className="mt-2 text-xs text-danger">{widgetError}</p> : null}
          </div>

          {isAuthorizing ? (
            <div className="flex items-center gap-2 text-sm text-[color:var(--ink)]/85">
              <Spinner size="sm" />
              <span>{t("auth.signingIn")}</span>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
