import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { Home, LayoutDashboard, Plus } from "lucide-react";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { I18nProvider, useI18n } from "@/features/i18n";

export default function MobileBottomNav() {
  return (
    <I18nProvider>
      <MobileBottomNavContent />
    </I18nProvider>
  );
}

function MobileBottomNavContent() {
  const { user } = useAuth();
  const { t } = useI18n();
  const dashboardHref = user ? "/dashboard" : "/login";
  const [hasOpenModal, setHasOpenModal] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncModalState = () => {
      const modalIsOpen = Boolean(
        document.querySelector(
          '[role="dialog"][aria-modal="true"], [data-slot="backdrop"]',
        ),
      );
      setHasOpenModal(modalIsOpen);
    };

    syncModalState();

    const observer = new MutationObserver(syncModalState);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-modal", "role", "data-slot", "class"],
    });

    return () => observer.disconnect();
  }, []);

  const handlePostAd = () => {
    const pathname = window.location.pathname.toLowerCase();
    const isHome = pathname === "/" || pathname === "/index.html";

    if (isHome) {
      const event = new CustomEvent("open-post-ad", { cancelable: true });
      const wasHandled = !window.dispatchEvent(event);
      if (wasHandled) {
        return;
      }
    }

    window.location.assign("/?openPostAd=1");
  };

  if (hasOpenModal) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-3 z-[70] mx-auto w-[min(420px,calc(100%-1.25rem))] sm:hidden">
      <div className="relative rounded-full border border-white/30 bg-black/80 px-6 pb-[calc(0.55rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
        <div className="grid grid-cols-3 items-end">
          <Button
            as="a"
            href="/"
            variant="light"
            className="h-auto min-w-0 flex-col gap-1 rounded-2xl py-1 text-white/90"
          >
            <Home className="h-5 w-5" />
            <span className="text-[10px]">{t("common.home")}</span>
          </Button>

          <div className="flex items-center justify-center">
            <Button
              isIconOnly
              radius="full"
              color="primary"
              className="-mt-6 h-14 w-14 border-4 border-white/85 shadow-[0_20px_35px_-15px_rgba(0,0,0,0.7)]"
              aria-label={t("common.postAd")}
              onPress={handlePostAd}
              onClick={handlePostAd}
            >
              <Plus className="h-6 w-6" />
            </Button>
          </div>

          <Button
            as="a"
            href={dashboardHref}
            variant="light"
            className="h-auto min-w-0 flex-col gap-1 rounded-2xl py-1 text-white/90"
          >
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-[10px]">{t("navbar.dashboard")}</span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
