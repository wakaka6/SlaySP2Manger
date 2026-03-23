import { Download, X, Loader2, ArrowUpCircle } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { useUpdate } from "../../contexts/UpdateContext";

export function UpdateChecker() {
  const { t } = useI18n();
  const { phase, availableVersion, installUpdate, dismiss } = useUpdate();

  // Only show modal in these phases
  if (phase !== "available" && phase !== "downloading" && phase !== "restarting") return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog-card" style={{ maxWidth: 440 }}>
        <div className="dialog-card__header">
          <h2><ArrowUpCircle size={18} style={{ marginRight: 8, verticalAlign: -3 }} />{t("updater.available")}</h2>
        </div>

        {phase === "available" && (
          <>
            <div className="dialog-card__body" style={{ textAlign: "center" }}>
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
                {t("updater.body").replace("{version}", availableVersion ?? "")}
              </p>
            </div>
            <div className="dialog-card__body" style={{ display: "flex", gap: 10, justifyContent: "center", paddingTop: 0 }}>
              <button className="button button--secondary" onClick={dismiss}>
                <X size={14} />
                {t("updater.later")}
              </button>
              <button className="button button--primary" onClick={installUpdate}>
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
