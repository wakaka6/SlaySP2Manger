import { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return (
    <div className="window-controls">
      <button
        className="window-controls__btn window-controls__btn--minimize"
        onClick={() => appWindow.minimize()}
        type="button"
        aria-label="Minimize"
      >
        <Minus size={8} strokeWidth={3} />
      </button>
      <button
        className="window-controls__btn window-controls__btn--maximize"
        onClick={async () => {
          await appWindow.toggleMaximize();
          setIsMaximized(await appWindow.isMaximized());
        }}
        type="button"
        aria-label="Maximize"
      >
        {isMaximized ? <Copy size={8} strokeWidth={2.5} /> : <Square size={7} strokeWidth={3} />}
      </button>
      <button
        className="window-controls__btn window-controls__btn--close"
        onClick={() => appWindow.close()}
        type="button"
        aria-label="Close"
      >
        <X size={8} strokeWidth={3} />
      </button>
    </div>
  );
}
