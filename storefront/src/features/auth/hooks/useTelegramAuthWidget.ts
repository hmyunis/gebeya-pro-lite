import { useEffect, useRef, useState } from "react";
import { addToast } from "@heroui/react";
import { useI18n } from "@/features/i18n";
import { api, getApiErrorMessage } from "@/lib/api";
import { applyLoginResult, loadUser } from "@/features/auth/store/authStore";

export type TelegramAuthPayload = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

export function useTelegramAuthWidget({
  telegramBot,
  returnTo,
  onAuthenticated,
}: {
  telegramBot: string;
  returnTo: string;
  onAuthenticated?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const widgetHostRef = useRef<HTMLDivElement | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!widgetHostRef.current) return;

    if (!telegramBot || telegramBot === "YOUR_BOT_NAME") {
      setWidgetError(t("auth.telegramNotConfigured"));
      return;
    }

    const widgetHost = widgetHostRef.current;
    widgetHost.innerHTML = "";
    setWidgetError(null);

    let cancelled = false;

    window.onTelegramAuth = async (telegramUser: TelegramAuthPayload) => {
      if (cancelled) return;
      setIsAuthorizing(true);
      addToast({
        title: t("auth.toast.telegramSigningIn"),
        description: t("auth.toast.telegramFinalizing"),
        color: "primary",
      });

      try {
        const response = await api.post("/auth/telegram", telegramUser);
        const responseToken =
          typeof response.data?.token === "string" ? response.data.token : null;
        const responseUser =
          response.data && typeof response.data === "object"
            ? response.data.user
            : null;

        applyLoginResult(responseToken, responseUser ?? null);
        await loadUser({ force: true });

        if (onAuthenticated) {
          await onAuthenticated();
        } else {
          addToast({
            title: t("auth.welcomeBack"),
            description: t("auth.redirecting"),
            color: "success",
          });

          window.location.replace(returnTo);
        }
      } catch (error) {
        addToast({
          title: t("auth.toast.telegramLoginFailed"),
          description: getApiErrorMessage(error),
          color: "danger",
        });
      } finally {
        if (!cancelled) {
          setIsAuthorizing(false);
        }
      }
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", telegramBot);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.onerror = () => {
      if (cancelled) return;
      setWidgetError(t("auth.telegramWidgetFailed"));
    };

    widgetHost.appendChild(script);

    return () => {
      cancelled = true;
      window.onTelegramAuth = undefined;
      if (widgetHostRef.current) {
        widgetHostRef.current.innerHTML = "";
      }
    };
  }, [onAuthenticated, t, telegramBot, returnTo]);

  return {
    widgetHostRef,
    isAuthorizing,
    widgetError,
  };
}
