import {
  createContext,
  useContext,
  useState,
  useCallback,
  type PropsWithChildren,
} from "react";
import {
  getModFiles,
  downloadAndInstallMod,
  type RemoteMod,
  type ModFileInfo,
} from "../lib/desktop";

export type DownloadTask = {
  modId: string;
  modName: string;
  status: "pending" | "fetching_files" | "downloading" | "installing" | "done" | "error";
  error?: string;
};

type DownloadContextValue = {
  tasks: DownloadTask[];
  activeCount: number;
  startDownload: (mod: RemoteMod) => void;
  dismissTask: (modId: string) => void;
  clearFinished: () => void;
  isDownloading: (modId: string) => boolean;
};

const DownloadContext = createContext<DownloadContextValue | null>(null);

export function DownloadProvider({ children }: PropsWithChildren) {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);

  const updateTask = useCallback((modId: string, patch: Partial<DownloadTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.modId === modId ? { ...t, ...patch } : t))
    );
  }, []);

  const startDownload = useCallback(
    (mod: RemoteMod) => {
      const taskId = mod.remoteId;
      const modIdNum = parseInt(mod.remoteId, 10);

      // Don't duplicate
      setTasks((prev) => {
        if (prev.some((t) => t.modId === taskId && !["done", "error"].includes(t.status))) {
          return prev;
        }
        return [
          ...prev.filter((t) => t.modId !== taskId),
          { modId: taskId, modName: mod.name, status: "fetching_files" as const },
        ];
      });

      // Async download flow
      (async () => {
        try {
          // 1. Get file list
          const files: ModFileInfo[] = await getModFiles(modIdNum);
          const mainFile =
            files.find((f) => f.isPrimary && f.category === "MAIN") ??
            files.find((f) => f.category === "MAIN") ??
            files[0];

          if (!mainFile) {
            updateTask(taskId, { status: "error", error: "ERROR_NO_FILES" });
            return;
          }

          // 2. Download & install
          updateTask(taskId, { status: "downloading" });

          // Brief pause to let UI update before blocking call
          await new Promise((r) => setTimeout(r, 100));

          updateTask(taskId, { status: "installing" });

          await downloadAndInstallMod(
            modIdNum,
            mainFile.fileId,
            mainFile.fileName || `mod_${modIdNum}.zip`
          );

          updateTask(taskId, { status: "done" });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          // Check for premium-only 403 error
          let userFriendlyError = errMsg;
          if (errMsg.includes("403") || errMsg.includes("Forbidden")) {
            userFriendlyError = "ERROR_PREMIUM_REQUIRED";
          }
          updateTask(taskId, { status: "error", error: userFriendlyError });
        }
      })();
    },
    [updateTask]
  );

  const dismissTask = useCallback((modId: string) => {
    setTasks((prev) => prev.filter((t) => t.modId !== modId));
  }, []);

  const clearFinished = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status !== "done" && t.status !== "error"));
  }, []);

  const isDownloading = useCallback(
    (modId: string) => {
      return tasks.some(
        (t) => t.modId === modId && !["done", "error"].includes(t.status)
      );
    },
    [tasks]
  );

  const activeCount = tasks.filter(
    (t) => t.status !== "done" && t.status !== "error"
  ).length;

  return (
    <DownloadContext.Provider
      value={{ tasks, activeCount, startDownload, dismissTask, clearFinished, isDownloading }}
    >
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloads() {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error("useDownloads must be used within DownloadProvider");
  }
  return context;
}
