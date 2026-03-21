import { createHashRouter } from "react-router-dom";
import { AppShell } from "../components/shell/AppShell";
import { DiscoverPage } from "../pages/discover/DiscoverPage";
import { LibraryPage } from "../pages/library/LibraryPage";
import { ProfilesPage } from "../pages/profiles/ProfilesPage";
import { SavesPage } from "../pages/saves/SavesPage";
import { SettingsPage } from "../pages/settings/SettingsPage";

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <LibraryPage /> },
      { path: "discover", element: <DiscoverPage /> },
      { path: "profiles", element: <ProfilesPage /> },
      { path: "saves", element: <SavesPage /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  }
]);
