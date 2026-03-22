import {
  Compass,
  Layers3,
  Library,
  Save,
  Settings2,
  DownloadCloud,
  type LucideIcon,
} from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useTransition, useCallback } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { getAppBootstrap, type AppBootstrap } from "../../lib/desktop";
import { SidebarNav } from "./SidebarNav";
import { WelcomeGuide } from "./WelcomeGuide";
import { UpdateChecker } from "./UpdateChecker";
import { useDropZone } from "../../contexts/DropZoneContext";
import { WindowControls } from "./WindowControls";

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
  const { pendingDropPaths, isDragging } = useDropZone();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });

  // Use transition so bootstrap refetch doesn't block navigation interactions
  const [, startTransition] = useTransition();

  const fetchAppState = useCallback((force = false) => {
    getAppBootstrap()
      .then((data) => {
        startTransition(() => setAppState(data));
      })
      .catch((e) => console.error("Failed to load bootstrap:", e));
  }, []);

  // Re-fetch on route change
  useEffect(() => {
    fetchAppState();
  }, [location.pathname, fetchAppState]);

  // Listen for bootstrap invalidation events (triggered by any mutation like mod import/enable/disable)
  // This ensures the sidebar badge count stays in sync without waiting for route changes
  useEffect(() => {
    const handler = () => fetchAppState(true);
    window.addEventListener("slaymgr:bootstrap-changed", handler);
    return () => window.removeEventListener("slaymgr:bootstrap-changed", handler);
  }, [fetchAppState]);

  // Navigate to library magically when dropping a file on any page
  useEffect(() => {
    if (pendingDropPaths.length > 0 && location.pathname !== "/") {
      navigate("/");
    }
  }, [pendingDropPaths, location.pathname, navigate]);

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
    <div className={`app-shell${sidebarCollapsed ? " app-shell--collapsed" : ""}`}>
      <SidebarNav
        activePath={location.pathname}
        items={navItems}
        onNavigate={navigate}
        collapsed={sidebarCollapsed}
        onToggle={() => {
          setSidebarCollapsed((v) => {
            const next = !v;
            try { localStorage.setItem("sidebar-collapsed", String(next)); } catch {}
            return next;
          });
        }}
      />
      <main className="app-shell__content">
        <div className="app-shell__drag-bar" data-tauri-drag-region />
        <Outlet />
      </main>
      <WindowControls />

      {isDragging && (
        <div className="drop-overlay">
          <div className="drop-overlay__inner">
            <div className="drop-overlay__icon">
              <DownloadCloud size={48} />
            </div>
            <h2 className="drop-overlay__title">{t("library.dropTitle")}</h2>
            <p className="drop-overlay__subtitle">{t("library.dropSubtitle")}</p>
          </div>
        </div>
      )}

      {appState && !appState.gameDirectoryValid && (
        <WelcomeGuide onSuccess={fetchAppState} />
      )}

      <UpdateChecker />
    </div>
  );
}
