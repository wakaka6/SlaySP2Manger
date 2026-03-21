import {
  Compass,
  Layers3,
  Library,
  Save,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { getAppBootstrap, type AppBootstrap } from "../../lib/desktop";
import { SidebarNav } from "./SidebarNav";

export type ShellNavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  section?: string;
};

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [appState, setAppState] = useState<AppBootstrap | null>(null);

  useEffect(() => {
    getAppBootstrap()
      .then(setAppState)
      .catch((e) => console.error("Failed to load bootstrap:", e));
  }, [location.pathname]);

  const navItems: ShellNavItem[] = [
    { label: t("nav.library"), path: "/", icon: Library, badge: appState ? String(appState.installedCount + appState.disabledCount) : "0" },
    { label: t("nav.discover"), path: "/discover", icon: Compass },
    { label: t("nav.profiles"), path: "/profiles", icon: Layers3 },
    { label: t("nav.saves"), path: "/saves", icon: Save },
    {
      label: t("nav.settings"),
      path: "/settings",
      icon: Settings2,
      section: t("nav.system"),
    },
  ];

  return (
    <div className="app-shell">
      <SidebarNav activePath={location.pathname} items={navItems} onNavigate={navigate} />
      <main className="app-shell__content">
        <Outlet />
      </main>
    </div>
  );
}
