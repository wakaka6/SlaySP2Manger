import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, X, Loader2, ArrowUpCircle } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";

export function UpdateChecker() {
  const { t } = useI18n();
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<"idle" | "prompt" | "downloading" | "restarting">("idle");

  useEffect(() => {
    // Check for updates 2 seconds after app launch
    const timer = setTimeout(() => {
      check()
        .then((u) => {
          if (u) {
            setUpdate(u);
            setPhase("prompt");
          }
        })
        .catch((e) => console.warn("Update check failed:", e));
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  async function handleInstall() {
    if (!update) return;
    setPhase("downloading");
    try {
      await update.downloadAndInstall();
      setPhase("restarting");
      await relaunch();
    } catch (e) {
      console.error("Update failed:", e);
      setPhase("idle");
    }
  }

  if (phase === "idle" || !update) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog-card" style={{ maxWidth: 440 }}>
        <div className="dialog-card__header">
          <h2><ArrowUpCircle size={18} style={{ marginRight: 8, verticalAlign: -3 }} />{t("updater.available")}</h2>
        </div>

        {phase === "prompt" && (
          <>
            <div className="dialog-card__body" style={{ textAlign: "center" }}>
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
                {t("updater.body").replace("{version}", update.version)}
              </p>
            </div>
            <div className="dialog-card__body" style={{ display: "flex", gap: 10, justifyContent: "center", paddingTop: 0 }}>
              <button className="button button--secondary" onClick={() => setPhase("idle")}>
                <X size={14} />
                {t("updater.later")}
              </button>
              <button className="button button--primary" onClick={() => void handleInstall()}>
                <Download size={14} />
                {t("updater.install")}
              </button>
            </div>
          </>
        )}

        {phase === "downloading" && (
          <div className="dialog-card__body" style={{ textAlign: "center", padding: "24px 0" }}>
            <Loader2 size={24} className="spin-icon" style={{ color: "var(--accent)" }} />
            <p style={{ marginTop: 12, fontSize: 14, color: "var(--text-secondary)" }}>
              {t("updater.downloading")}
            </p>
          </div>
        )}

        {phase === "restarting" && (
          <div className="dialog-card__body" style={{ textAlign: "center", padding: "24px 0" }}>
            <Loader2 size={24} className="spin-icon" style={{ color: "var(--accent)" }} />
            <p style={{ marginTop: 12, fontSize: 14, color: "var(--text-secondary)" }}>
              {t("updater.restarting")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
