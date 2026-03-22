import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router-dom";
import { AppShell } from "../components/shell/AppShell";
import { LibraryPage } from "../pages/library/LibraryPage";
import { ProfilesPage } from "../pages/profiles/ProfilesPage";
import { SavesPage } from "../pages/saves/SavesPage";
import { SettingsPage } from "../pages/settings/SettingsPage";

// Lazy-load Discover page — it fires expensive network requests on mount.
// This ensures navigating TO/FROM discover never blocks the React render tree.
const DiscoverPage = lazy(() =>
  import("../pages/discover/DiscoverPage").then((m) => ({
    default: m.DiscoverPage,
  }))
);

function DiscoverFallback() {
  return (
    <section className="discover-page">
      <div className="discover-toolbar2">
        <div className="discover-toolbar2__search">
          <div className="skeleton-text" style={{ width: "100%", height: "32px", borderRadius: "8px" }} />
        </div>
      </div>
      <div className="discover-main">
        <div className="discover-scroll">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="discover-row discover-row--skeleton" key={i}>
              <div className="skeleton-text" style={{ width: "40%", height: "14px" }} />
              <div className="skeleton-text" style={{ width: "25%", height: "11px", marginTop: 4 }} />
            </div>
          ))}
        </div>
        <aside className="discover-detail2">
          <div className="discover-detail2__skeleton">
            <div className="skeleton-text" style={{ width: "60%", height: "20px", marginBottom: "10px" }} />
            <div className="skeleton-text" style={{ width: "40%", height: "12px", marginBottom: "24px" }} />
            <div className="skeleton-text" style={{ width: "100%", height: "12px", marginBottom: "6px" }} />
            <div className="skeleton-text" style={{ width: "85%", height: "12px" }} />
          </div>
        </aside>
      </div>
    </section>
  );
}

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <LibraryPage /> },
      {
        path: "discover",
        element: (
          <Suspense fallback={<DiscoverFallback />}>
            <DiscoverPage />
          </Suspense>
        ),
      },
      { path: "profiles", element: <ProfilesPage /> },
      { path: "saves", element: <SavesPage /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  }
]);
