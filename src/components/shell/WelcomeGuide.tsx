import { useState } from "react";
import { Folder, AlertCircle, Compass, PlayCircle, Loader2 } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { updateGameRootDir, getAppBootstrap } from "../../lib/desktop";

type WelcomeGuideProps = {
  onSuccess: () => void;
};

export function WelcomeGuide({ onSuccess }: WelcomeGuideProps) {
  const { t } = useI18n();
  const [path, setPath] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!path.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      // Save the user-provided path
      await updateGameRootDir(path.trim());
      // Re-fetch bootstrap to check validity
      const bootstrap = await getAppBootstrap();
      if (bootstrap.gameDirectoryValid) {
        onSuccess();
      } else {
        // If the backend says it's not valid (SlayTheSpire2.exe not found)
        setError(t("welcome.error"));
        // Clear the bad directory setting
        await updateGameRootDir("");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="welcome-overlay">
      <div className="welcome-modal">
        <div className="welcome-modal__icon">
          <Compass size={40} />
        </div>
        <h1 className="welcome-modal__title">{t("welcome.title")}</h1>
        <p className="welcome-modal__subtitle">{t("welcome.subtitle")}</p>

        <form onSubmit={(e) => void handleSubmit(e)} className="welcome-form">
          <div className="welcome-steps">
            <div className="welcome-step">
              <div className="welcome-step__num">1</div>
              <p>{t("welcome.step1")}</p>
            </div>
            <div className="welcome-step">
              <div className="welcome-step__num">2</div>
              <p>{t("welcome.step2")}</p>
            </div>
            <div className="welcome-step">
              <div className="welcome-step__num">3</div>
              <p>{t("welcome.step3")}</p>
            </div>
          </div>

          <div className="welcome-input-group">
            <div className="input-wrapper" style={{ display: 'flex', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Folder size={16} className="input-icon" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '12px' }} />
                <input
                  type="text"
                  className="input welcome-input"
                  placeholder={t("welcome.placeholder")}
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  autoFocus
                />
              </div>
              <button 
                type="button" 
                className="button button--secondary" 
                onClick={async () => {
                  const { pickImportFolder } = await import("../../lib/desktop");
                  const folder = await pickImportFolder();
                  if (folder) setPath(folder);
                }}
              >
                {t("welcome.browse")}
              </button>
            </div>
            {error && (
              <div className="welcome-error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <button 
            type="submit" 
            className="button button--primary welcome-submit"
            disabled={!path.trim() || isSubmitting}
          >
            {isSubmitting ? <Loader2 size={16} className="spin-icon" /> : <PlayCircle size={16} />}
            {t("welcome.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
