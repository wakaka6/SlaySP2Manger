import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

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

  const doCheck = useCallback(async () => {
    setPhase("checking");
    setErrorMessage(null);
    try {
      const u = await check();
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
  }, []);

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
    const timer = setTimeout(() => void doCheck(), 2000);
    return () => clearTimeout(timer);
  }, [doCheck]);

  return (
    <UpdateContext.Provider
      value={{
        phase,
        availableVersion: update?.version ?? null,
        errorMessage,
        checkForUpdates: () => void doCheck(),
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
