import {
  BookImage,
  Compass,
  Layers3,
  Library,
  Save,
  Settings2,
  DownloadCloud,
  type LucideIcon,
} from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useTransition, useCallback, useRef } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { getAppBootstrap, previewPresetBundle, type AppBootstrap } from "../../lib/desktop";
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

export type ShellNavigateOptions = {
  replace?: boolean;
  state?: unknown;
};

const COMPACT_SIDEBAR_MEDIA_QUERY = "(max-width: 980px)";

function getCompactSidebarMatches() {
  return typeof window !== "undefined" && window.matchMedia(COMPACT_SIDEBAR_MEDIA_QUERY).matches;
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [appState, setAppState] = useState<AppBootstrap | null>(null);
  const { pendingDropPaths, isDragging, setPendingDropPaths } = useDropZone();
  const [compactSidebar, setCompactSidebar] = useState(getCompactSidebarMatches);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });
  const effectiveCollapsed = compactSidebar || sidebarCollapsed;

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

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_SIDEBAR_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setCompactSidebar(event.matches);

    setCompactSidebar(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Listen for bootstrap invalidation events (triggered by any mutation like mod import/enable/disable)
  // This ensures the sidebar badge count stays in sync without waiting for route changes
  useEffect(() => {
    const handler = () => fetchAppState(true);
    window.addEventListener("slaymgr:bootstrap-changed", handler);
    return () => window.removeEventListener("slaymgr:bootstrap-changed", handler);
  }, [fetchAppState]);

  // Navigate to the right page when dropping a file
  const bundleCheckRef = useRef(false);
  useEffect(() => {
    if (pendingDropPaths.length === 0 || bundleCheckRef.current) return;

    // Single .zip? Check if it's a preset bundle first
    if (pendingDropPaths.length === 1 && pendingDropPaths[0].toLowerCase().endsWith(".zip")) {
      bundleCheckRef.current = true;
      const archivePath = pendingDropPaths[0];
      previewPresetBundle(archivePath)
        .then((preview) => {
          if (preview.hasManifest) {
            // It's a preset bundle — consume drop paths and navigate to profiles
            setPendingDropPaths([]);
            navigate("/profiles", { state: { bundlePath: archivePath, bundlePreview: preview } });
          } else {
            // Regular mod archive — go to library
            if (location.pathname !== "/") navigate("/");
          }
        })
        .catch(() => {
          // On error, fall through to library import
          if (location.pathname !== "/") navigate("/");
        })
        .finally(() => {
          bundleCheckRef.current = false;
        });
    } else {
      // Multiple files or non-zip — regular library import
      if (location.pathname !== "/") navigate("/");
    }
  }, [pendingDropPaths, location.pathname, navigate, setPendingDropPaths]);

  const navItems: ShellNavItem[] = [
    { label: t("nav.library"), path: "/", icon: Library, badge: appState ? String(appState.installedCount + appState.disabledCount) : "0" },
    { label: locale === "en-US" ? "Compendium" : "卡牌图鉴", path: "/compendium", icon: BookImage },
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
    <div className={`app-shell${effectiveCollapsed ? " app-shell--collapsed" : ""}${compactSidebar ? " app-shell--compact" : ""}`}>
      <SidebarNav
        activePath={location.pathname}
        items={navItems}
        onNavigate={(path, options) => navigate(path, options)}
        collapsed={effectiveCollapsed}
        compact={compactSidebar}
        activeProfileName={appState?.activeProfileName ?? ""}
        appVersion={appState?.appVersion ?? ""}
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
