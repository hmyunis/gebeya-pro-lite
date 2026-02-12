import { useEffect } from "react";
import { HeroUIProvider } from "@heroui/react";

import QueryProvider from "@/app/QueryProvider";
import RequireAuth from "@/features/auth/components/RequireAuth";
import DashboardPage from "@/features/dashboard/components/DashboardPage";
import { I18nProvider } from "@/features/i18n";

export default function DashboardApp() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-dashboard-ready", "true");

    return () => {
      document.documentElement.removeAttribute("data-dashboard-ready");
    };
  }, []);

  return (
    <I18nProvider>
      <HeroUIProvider>
        <QueryProvider>
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        </QueryProvider>
      </HeroUIProvider>
    </I18nProvider>
  );
}
