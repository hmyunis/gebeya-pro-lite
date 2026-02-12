import { Button, HeroUIProvider, Navbar, NavbarContent, addToast } from "@heroui/react";
import type { Key } from "react";
import { useEffect, useMemo, useState } from "react";
import { MoonStar, SunMedium } from "lucide-react";

import { API_BASE } from "@/config/env";
import { api, getApiErrorMessage } from "@/lib/api";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { logout } from "@/features/auth/store/authStore";
import {
  getAvatarSrc,
  getInitials,
  getUserDisplayName,
} from "@/features/auth/utils/userDisplay";
import {
  STOREFRONT_THEME_STORAGE_KEY,
  applyStorefrontTheme,
  resolveStorefrontTheme,
  type StorefrontTheme,
} from "@/features/theme/storefrontTheme";
import { I18nProvider, LanguageToggle, useI18n } from "@/features/i18n";

import { Brand } from "./Brand";
import { UserMenu } from "./UserMenu";

export default function AppNavbar() {
  return (
    <I18nProvider>
      <HeroUIProvider>
        <NavbarContentRoot />
      </HeroUIProvider>
    </I18nProvider>
  );
}

function NavbarContentRoot() {
  const { t } = useI18n();
  const { user, authReady } = useAuth();

  const [theme, setTheme] = useState<StorefrontTheme>("light");
  const [themeReady, setThemeReady] = useState(false);
  const [showMobileLangToggle, setShowMobileLangToggle] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const displayName = useMemo(() => getUserDisplayName(user), [user]);
  const initials = useMemo(() => getInitials(displayName), [displayName]);
  const avatarSrc = useMemo(() => getAvatarSrc(user, API_BASE), [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const initialTheme = resolveStorefrontTheme();
    setTheme(initialTheme);
    setThemeReady(true);
    applyStorefrontTheme(initialTheme, { persist: false });

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STOREFRONT_THEME_STORAGE_KEY) return;
      const nextTheme = resolveStorefrontTheme();
      setTheme(nextTheme);
      applyStorefrontTheme(nextTheme, { persist: false });
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let lastY = window.scrollY;
    const threshold = 2;

    const onScroll = () => {
      const currentY = window.scrollY;

      if (currentY <= 20) {
        setShowMobileLangToggle(true);
        lastY = currentY;
        return;
      }

      if (currentY > lastY + threshold) {
        setShowMobileLangToggle(false);
      } else if (currentY < lastY - threshold) {
        setShowMobileLangToggle(true);
      }

      lastY = currentY;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    const serverOk = await api
      .post("/auth/logout")
      .then(() => true)
      .catch((error: unknown) => {
        addToast({
          title: t("navbar.toast.logoutWarning.title"),
          description: getApiErrorMessage(error),
          color: "warning",
        });
        return false;
      });

    await logout();
    setIsLoggingOut(false);

    addToast({
      title: t("navbar.toast.loggedOut.title"),
      description: serverOk
        ? t("navbar.toast.loggedOut.description.server")
        : t("navbar.toast.loggedOut.description.local"),
      color: "success",
    });
    window.location.replace("/");
  };

  const handleUserMenuAction = (key: Key) => {
    if (key === "dashboard") {
      window.location.assign("/dashboard");
      return;
    }
    if (key === "logout") {
      void handleLogout();
    }
  };

  const toggleTheme = () => {
    const nextTheme: StorefrontTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyStorefrontTheme(nextTheme);
  };

  const isDarkTheme = themeReady && theme === "dark";
  const themeToggleLabel = isDarkTheme
    ? t("navbar.switchToLight")
    : t("navbar.switchToDark");

  return (
    <>
      <Navbar
        isBordered
        className="theme-nav fixed top-0 left-0 w-full backdrop-blur-xl"
      >
        <Brand />

        <NavbarContent justify="end" className="gap-1 sm:gap-2">
          <div className="hidden sm:block">
            <LanguageToggle />
          </div>
          <Button
            isIconOnly
            variant="light"
            radius="full"
            aria-label={themeToggleLabel}
            title={themeToggleLabel}
            onPress={toggleTheme}
            className="theme-action-soft"
          >
            {isDarkTheme ? (
              <SunMedium className="h-4 w-4" />
            ) : (
              <MoonStar className="h-4 w-4" />
            )}
          </Button>
          <UserMenu
            isAuthenticated={Boolean(user)}
            isLoading={!authReady}
            avatarSrc={avatarSrc}
            initials={initials}
            displayName={displayName}
            onAction={handleUserMenuAction}
          />
        </NavbarContent>
      </Navbar>
      <div
        className={[
          "fixed right-3 top-[calc(env(safe-area-inset-top)+4.4rem)] z-[55] transition-all duration-200 sm:hidden",
          showMobileLangToggle
            ? "translate-y-0 opacity-100"
            : "-translate-y-2 pointer-events-none opacity-0",
        ].join(" ")}
      >
        <LanguageToggle />
      </div>
    </>
  );
}
