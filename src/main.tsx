import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { I18nProvider } from "./i18n/I18nProvider";
import { ThemeProvider } from "./theme/ThemeProvider";
import { DownloadProvider } from "./contexts/DownloadContext";
import { DropZoneProvider } from "./contexts/DropZoneContext";
import { UpdateProvider } from "./contexts/UpdateContext";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <DropZoneProvider>
          <UpdateProvider>
            <DownloadProvider>
              <RouterProvider router={router} />
            </DownloadProvider>
          </UpdateProvider>
        </DropZoneProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
