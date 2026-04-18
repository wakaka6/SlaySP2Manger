import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router-dom";
import { AppShell } from "../components/shell/AppShell";
import { LibraryPage } from "../pages/library/LibraryPage";
import { ProfilesPage } from "../pages/profiles/ProfilesPage";
import { SavesPage } from "../pages/saves/SavesPage";
import { SettingsPage } from "../pages/settings/SettingsPage";

const CompendiumPage = lazy(() =>
  import("../pages/compendium/CompendiumPage").then((m) => ({
    default: m.CompendiumPage,
  }))
);

const DiscoverPage = lazy(() =>
  import("../pages/discover/DiscoverPage").then((m) => ({
    default: m.DiscoverPage,
  }))
);

function CompendiumFallback() {
  return (
    <section className="page compendium-page">
      <div className="panel compendium-toolbar">
        <div
          className="skeleton-text"
          style={{ width: "100%", height: "46px", borderRadius: "12px" }}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="skeleton-text"
              style={{ width: 168, height: 38, borderRadius: "12px" }}
            />
          ))}
        </div>
      </div>

      <div className="compendium-layout">
        <section className="panel compendium-gallery">
          <div className="compendium-gallery__grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-text"
                style={{ width: "100%", aspectRatio: "0.714 / 1", borderRadius: "26px" }}
              />
            ))}
          </div>
        </section>

        <aside className="compendium-detail-rail">
          <section className="panel compendium-inspector">
            <div
              className="skeleton-text"
              style={{ width: "72%", height: "24px", marginBottom: "14px" }}
            />
            <div
              className="skeleton-text"
              style={{ width: "100%", height: "14px", marginBottom: "8px" }}
            />
            <div
              className="skeleton-text"
              style={{ width: "88%", height: "14px", marginBottom: "20px" }}
            />
            <div
              className="skeleton-text"
              style={{ width: "100%", height: "220px", borderRadius: "18px" }}
            />
          </section>
        </aside>
      </div>
    </section>
  );
}

function DiscoverFallback() {
  return (
    <section className="discover-page">
      <div className="discover-toolbar2">
        <div className="discover-toolbar2__search">
          <div
            className="skeleton-text"
            style={{ width: "100%", height: "32px", borderRadius: "8px" }}
          />
        </div>
      </div>
      <div className="discover-main">
        <div className="discover-scroll">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="discover-row discover-row--skeleton" key={i}>
              <div className="skeleton-text" style={{ width: "40%", height: "14px" }} />
              <div
                className="skeleton-text"
                style={{ width: "25%", height: "11px", marginTop: 4 }}
              />
            </div>
          ))}
        </div>
        <aside className="discover-detail2">
          <div className="discover-detail2__skeleton">
            <div
              className="skeleton-text"
              style={{ width: "60%", height: "20px", marginBottom: "10px" }}
            />
            <div
              className="skeleton-text"
              style={{ width: "40%", height: "12px", marginBottom: "24px" }}
            />
            <div
              className="skeleton-text"
              style={{ width: "100%", height: "12px", marginBottom: "6px" }}
            />
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
        path: "compendium",
        element: (
          <Suspense fallback={<CompendiumFallback />}>
            <CompendiumPage />
          </Suspense>
        ),
      },
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
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
