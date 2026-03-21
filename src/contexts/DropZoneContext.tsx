import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type PropsWithChildren,
} from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

type DropZoneContextValue = {
  /** True when a file is being dragged over the window */
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  /** File path queued for import (set on drop, consumed by LibraryPage) */
  pendingDropPath: string | null;
  setPendingDropPath: (path: string | null) => void;
  /** Consume (clear) the pending drop path and return it */
  consumeDropPath: () => string | null;
};

const DropZoneContext = createContext<DropZoneContextValue | null>(null);

export function DropZoneProvider({ children }: PropsWithChildren) {
  const [isDragging, setIsDragging] = useState(false);
  const [pendingDropPath, setPendingDropPath] = useState<string | null>(null);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "enter" || event.payload.type === "over") {
        setIsDragging(true);
      } else if (event.payload.type === "leave") {
        setIsDragging(false);
      } else if (event.payload.type === "drop") {
        setIsDragging(false);
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          const file = paths[0];
          if (file.toLowerCase().endsWith(".zip")) {
            setPendingDropPath(file);
          }
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn()).catch(console.error);
    };
  }, []);

  const consumeDropPath = useCallback(() => {
    let consumed: string | null = null;
    setPendingDropPath((prev) => {
      consumed = prev;
      return null;
    });
    return consumed;
  }, []);

  return (
    <DropZoneContext.Provider
      value={{
        isDragging,
        setIsDragging,
        pendingDropPath,
        setPendingDropPath,
        consumeDropPath,
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
