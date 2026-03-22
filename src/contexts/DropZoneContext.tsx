import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type PropsWithChildren,
} from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

type DropZoneContextValue = {
  /** True when a file is being dragged over the window */
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  /** File paths queued for import (set on drop, consumed by LibraryPage) */
  pendingDropPaths: string[];
  setPendingDropPaths: (paths: string[]) => void;
  /** Consume (clear) the pending drop paths and return them */
  consumeDropPaths: () => string[];
  /** Mark import as busy — drop events will be ignored */
  isBusy: boolean;
  setIsBusy: (v: boolean) => void;
};

const DropZoneContext = createContext<DropZoneContextValue | null>(null);

/** Supported archive extensions for drag-and-drop import */
const SUPPORTED_EXTENSIONS = [".zip", ".7z"];

function isSupportedArchive(path: string): boolean {
  const lower = path.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Debounce delay (ms) — collapses rapid successive drops into one */
const DROP_DEBOUNCE_MS = 400;

export function DropZoneProvider({ children }: PropsWithChildren) {
  const [isDragging, setIsDragging] = useState(false);
  const [pendingDropPaths, setPendingDropPaths] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedPathsRef = useRef<string[]>([]);

  // Keep ref in sync with state so the event listener closure sees latest value
  useEffect(() => {
    isBusyRef.current = isBusy;
  }, [isBusy]);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "enter" || event.payload.type === "over") {
        setIsDragging(true);
      } else if (event.payload.type === "leave") {
        setIsDragging(false);
      } else if (event.payload.type === "drop") {
        setIsDragging(false);

        // Ignore drops while a previous import is processing
        if (isBusyRef.current) return;

        const paths = event.payload.paths;
        if (!paths || paths.length === 0) return;

        // Collect all supported archive files AND folders (folders don't have extensions)
        const importable = paths.filter((p) => {
          if (isSupportedArchive(p)) return true;
          // Treat paths without a dot-extension as potential folders
          const basename = p.split(/[\\/]/).pop() || "";
          return !basename.includes(".");
        });

        if (importable.length === 0) return;

        // Debounce: accumulate paths from rapid drops and flush after delay
        accumulatedPathsRef.current = [
          ...accumulatedPathsRef.current,
          ...importable,
        ];

        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          // Deduplicate
          const unique = [...new Set(accumulatedPathsRef.current)];
          accumulatedPathsRef.current = [];
          debounceTimerRef.current = null;
          if (unique.length > 0) {
            setPendingDropPaths(unique);
          }
        }, DROP_DEBOUNCE_MS);
      }
    });

    return () => {
      unlisten.then((fn) => fn()).catch(console.error);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const consumeDropPaths = useCallback(() => {
    let consumed: string[] = [];
    setPendingDropPaths((prev) => {
      consumed = prev;
      return [];
    });
    return consumed;
  }, []);

  return (
    <DropZoneContext.Provider
      value={{
        isDragging,
        setIsDragging,
        pendingDropPaths,
        setPendingDropPaths,
        consumeDropPaths,
        isBusy,
        setIsBusy,
      }}
    >
      {children}
    </DropZoneContext.Provider>
  );
}

export function useDropZone() {
  const context = useContext(DropZoneContext);
  if (!context) {
    throw new Error("useDropZone must be used within DropZoneProvider");
  }
  return context;
}
