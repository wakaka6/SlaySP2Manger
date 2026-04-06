import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getAppBootstrap } from "../lib/desktop";

type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "restarting" | "upToDate" | "error";

type UpdateContextValue = {
  phase: UpdatePhase;
  availableVersion: string | null;
  errorMessage: string | null;
  checkForUpdates: () => void;
  installUpdate: () => void;
  dismiss: () => void;
};

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const hasAutoCheckRunRef = useRef(false);
  const lastProxyUrlRef = useRef<string | null | undefined>(undefined);

  const syncProxyUrl = useCallback(async () => {
    try {
      const bootstrap = await getAppBootstrap();
      const trimmed = bootstrap.proxyUrl?.trim();
      setProxyUrl(trimmed ? trimmed : null);
    } catch (error) {
      console.warn("Failed to load updater proxy settings:", error);
    } finally {
      setSettingsReady(true);
    }
  }, []);

  useEffect(() => {
    void syncProxyUrl();

    const handleBootstrapChanged = () => {
      void syncProxyUrl();
    };

    window.addEventListener("slaymgr:bootstrap-changed", handleBootstrapChanged);
    return () => window.removeEventListener("slaymgr:bootstrap-changed", handleBootstrapChanged);
  }, [syncProxyUrl]);

  const doCheck = useCallback(async () => {
    setPhase("checking");
    setErrorMessage(null);
    try {
      const u = await check(proxyUrl ? { proxy: proxyUrl } : undefined);
      if (u) {
        setUpdate(u);
        setPhase("available");
      } else {
        setPhase("upToDate");
        // Auto-clear "up to date" after 5s
        setTimeout(() => setPhase((p) => (p === "upToDate" ? "idle" : p)), 5000);
      }
    } catch (e) {
      console.warn("Update check failed:", e);
      setErrorMessage(String(e));
      setPhase("error");
      setTimeout(() => setPhase((p) => (p === "error" ? "idle" : p)), 5000);
    }
  }, [proxyUrl]);

  const installUpdate = useCallback(async () => {
    if (!update) return;
    setPhase("downloading");
    try {
      await update.downloadAndInstall();
      setPhase("restarting");
      await relaunch();
    } catch (e) {
      console.error("Update failed:", e);
      setErrorMessage(String(e));
      setPhase("error");
    }
  }, [update]);

  // Auto-check 2s after mount
  useEffect(() => {
    if (!settingsReady || hasAutoCheckRunRef.current) return;
    const timer = setTimeout(() => {
      if (hasAutoCheckRunRef.current) return;
      hasAutoCheckRunRef.current = true;
      void doCheck();
    }, 2000);
    return () => clearTimeout(timer);
  }, [doCheck, settingsReady]);

  useEffect(() => {
    if (!settingsReady) return;

    const previousProxyUrl = lastProxyUrlRef.current;
    lastProxyUrlRef.current = proxyUrl;

    if (previousProxyUrl === undefined || previousProxyUrl === proxyUrl) return;
    if (phase !== "available") return;

    setUpdate(null);
    setPhase("idle");
    hasAutoCheckRunRef.current = true;
    void doCheck();
  }, [doCheck, phase, proxyUrl, settingsReady]);

  return (
    <UpdateContext.Provider
      value={{
        phase,
        availableVersion: update?.version ?? null,
        errorMessage,
        checkForUpdates: () => {
          hasAutoCheckRunRef.current = true;
          void doCheck();
        },
        installUpdate: () => void installUpdate(),
        dismiss: () => setPhase("idle"),
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate() {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdate must be inside UpdateProvider");
  return ctx;
}
