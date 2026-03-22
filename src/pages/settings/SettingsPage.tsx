import { useEffect, useRef, useState } from "react";
import { PageHeader } from "../../components/common/PageHeader";
import { useI18n } from "../../i18n/I18nProvider";
import {
  detectGameInstall,
  getAppBootstrap,
  updateAppLocale,
  updateGameRootDir,
  updateNexusApiKey,
  openUrlInBrowser,
} from "../../lib/desktop";
import { useTheme, type ThemeMode } from "../../theme/ThemeProvider";
import { Eye, EyeOff, Clipboard, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";

export function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const { themeMode, resolvedTheme, setThemeMode } = useTheme();
  const [gameRootDir, setGameRootDir] = useState("");
  const [saved, setSaved] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const isActionRunningRef = useRef(false);

  useEffect(() => {
    void getAppBootstrap().then((bootstrap) => {
      if (bootstrap.gameDirectory) {
        setGameRootDir(bootstrap.gameDirectory);
      }
      if (bootstrap.nexusApiKey) {
        setApiKey(bootstrap.nexusApiKey);
      }
      setApiKeyLoaded(true);
      setLocale(bootstrap.locale === "en-US" ? "en-US" : "zh-CN");
    });
  }, [setLocale]);

  async function handleSaveDirectory() {
    if (isActionRunningRef.current) return;
    isActionRunningRef.current = true;
    try {
      await updateGameRootDir(gameRootDir);
      setSaved(gameRootDir.trim() ? t("settings.savedGameDirectory") : t("settings.clearedGameDirectory"));
    } finally {
      isActionRunningRef.current = false;
    }
  }

  async function handleDetect() {
    if (isActionRunningRef.current) return;
    isActionRunningRef.current = true;
    try {
      const detected = await detectGameInstall();
      if (detected?.rootDir) {
        setGameRootDir(detected.rootDir);
        await updateGameRootDir(detected.rootDir);
        setSaved(t("settings.detectedGameDirectory"));
        return;
      }
      setSaved(t("settings.gameNotFound"));
    } finally {
      isActionRunningRef.current = false;
    }
  }

  async function handleLocaleChange(nextLocale: "zh-CN" | "en-US") {
    setLocale(nextLocale);
    await updateAppLocale(nextLocale);
    setSaved(t("settings.savedLanguage"));
  }

  function handleThemeChange(nextThemeMode: ThemeMode) {
    setThemeMode(nextThemeMode);
    setSaved(t("settings.themeApplied"));
  }

  async function handleSaveApiKey(value?: string | unknown) {
    const keyToSave = typeof value === "string" ? value : apiKey;
    if (isActionRunningRef.current) return;
    isActionRunningRef.current = true;
    try {
      await updateNexusApiKey(keyToSave);
      setApiKeySaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setApiKeySaved(false), 3000);
    } catch (e) {
      setSaved(String(e));
    } finally {
      isActionRunningRef.current = false;
    }
  }

  async function handlePasteApiKey() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setApiKey(text);
        void handleSaveApiKey(text);
      }
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  }

  function handleOpenUrl(url: string) {
    openUrlInBrowser(url).catch(() => {
      window.open(url, "_blank");
    });
  }

  type TutorialStep = {
    text: string;
    linkLabel?: string;
    linkUrl?: string;
  };

  const tutorialSteps: TutorialStep[] = [
    {
      text: "",
      linkLabel: t("settings.tutorialLinkSite"),
      linkUrl: "https://www.nexusmods.com/",
    },
    { text: t("settings.tutorialStep2") },
    {
      text: "",
      linkLabel: t("settings.tutorialLinkApi"),
      linkUrl: "https://www.nexusmods.com/users/myaccount?tab=api",
    },
    { text: t("settings.tutorialStep4") },
    { text: t("settings.tutorialStep5") },
    { text: t("settings.tutorialStep6") },
  ];

  return (
    <section className="page">
      <PageHeader description={t("settings.description")} title={t("settings.title")} />

      <div className="settings-layout">
        <div className="settings-column">
          <section className="panel profile-panel">
            <div className="panel__header">
              <h2>{t("settings.gameDirectory")}</h2>
            </div>
            <div className="form-stack">
              <label className="field">
                <span>{t("settings.gameRoot")}</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    className="input"
                    onChange={(event) => setGameRootDir(event.target.value)}
                    placeholder="D:\\SteamLibrary\\steamapps\\common\\Slay the Spire 2"
                    value={gameRootDir}
                    style={{ flex: 1 }}
                  />
                  <button 
                    type="button" 
                    className="button button--secondary" 
                    onClick={async () => {
                      const { pickImportFolder } = await import("../../lib/desktop");
                      const folder = await pickImportFolder();
                      if (folder) setGameRootDir(folder);
                    }}
                  >
                    {t("welcome.browse")}
                  </button>
                </div>
              </label>

              <div className="action-row">
                <button className="button button--secondary" onClick={() => void handleDetect()} type="button">
                  {t("settings.autoDetect")}
                </button>
                <button className="button button--primary" onClick={() => void handleSaveDirectory()} type="button">
                  {t("settings.saveDirectory")}
                </button>
              </div>
              {saved ? <p className="inline-note">{saved}</p> : null}
            </div>
          </section>

          <section className="panel profile-panel">
            <div className="panel__header">
              <h2>{t("settings.preferences")}</h2>
            </div>
            <div className="form-stack">
              <label className="field">
                <span>{t("settings.language")}</span>
                <select
                  className="input"
                  onChange={(event) => void handleLocaleChange(event.target.value as "zh-CN" | "en-US")}
                  value={locale}
                >
                  <option value="zh-CN">{t("settings.languageZh")}</option>
                  <option value="en-US">{t("settings.languageEn")}</option>
                </select>
                <span className="panel__meta">{t("settings.languageHelp")}</span>
              </label>
              <label className="field">
                <span>{t("settings.theme")}</span>
                <select
                  className="input"
                  onChange={(event) => handleThemeChange(event.target.value as ThemeMode)}
                  value={themeMode}
                >
                  <option value="system">{t("settings.themeSystem")}</option>
                  <option value="light">{t("settings.themeLight")}</option>
                  <option value="dark">{t("settings.themeDark")}</option>
                </select>
                <span className="panel__meta">{t("settings.themeHelp")}</span>
                <span className="panel__meta">
                  {t("settings.currentAppearance")}：
                  {resolvedTheme === "light"
                    ? t("settings.currentAppearanceLight")
                    : t("settings.currentAppearanceDark")}
                </span>
              </label>
            </div>
          </section>
        </div>

        <div className="settings-column">
          <section className="panel profile-panel">
            <div className="panel__header">
              <h2>{t("settings.nexusIntegration")}</h2>
            </div>
            <div className="form-stack">
              <label className="field">
                <span>{t("settings.apiKey")}</span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <input
                      className="input"
                      ref={apiKeyInputRef}
                      type={apiKeyVisible ? "text" : "password"}
                      placeholder={apiKeyLoaded ? t("settings.apiKeyPlaceholder") : "…"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      style={{ paddingRight: "40px", width: "100%", boxSizing: "border-box" }}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => setApiKeyVisible((v) => !v)}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "2px",
                        color: "var(--text-secondary)",
                        display: "flex",
                        alignItems: "center",
                      }}
                      title={apiKeyVisible ? t("settings.apiKeyHidden") : t("settings.apiKeyVisible")}
                    >
                      {apiKeyVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="button button--secondary button--compact"
                    onClick={handlePasteApiKey}
                    title={t("settings.paste")}
                    style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <Clipboard size={14} />
                    {t("settings.paste")}
                  </button>
                </div>
              </label>

              {/* In-app tutorial */}
              <div style={{ marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => setShowTutorial((v) => !v)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--accent)",
                    fontSize: "13px",
                    fontWeight: 500,
                    padding: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  {t("settings.howToGetKey")}
                  {showTutorial ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showTutorial && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "16px 20px",
                      background: "var(--surface-contrast)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <h4
                      style={{
                        margin: "0 0 12px",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {t("settings.tutorialTitle")}
                    </h4>
                    <ol
                      style={{
                        margin: 0,
                        paddingLeft: "20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {tutorialSteps.map((step, i) => (
                        <li
                          key={i}
                          style={{
                            fontSize: "13px",
                            lineHeight: "1.6",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {step.text}
                          {step.linkUrl && step.linkLabel && (
                            <>
                              {" "}
                              <button
                                type="button"
                                onClick={() => handleOpenUrl(step.linkUrl!)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  cursor: "pointer",
                                  color: "var(--accent)",
                                  fontSize: "inherit",
                                  textDecoration: "underline",
                                  textUnderlineOffset: "2px",
                                  fontFamily: "inherit",
                                }}
                              >
                                {step.linkLabel} ↗
                              </button>
                            </>
                          )}
                        </li>
                      ))}
                    </ol>
                    <button
                      type="button"
                      onClick={() => setShowTutorial(false)}
                      style={{
                        marginTop: "12px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-dim)",
                        fontSize: "12px",
                        padding: 0,
                      }}
                    >
                      {t("settings.tutorialCollapse")}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
                <button
                  className="button button--primary"
                  type="button"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => void handleSaveApiKey()}
                >
                  {t("settings.saveNexusAuth")}
                </button>
                {apiKeySaved && (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      color: "var(--accent)",
                      fontSize: "13px",
                      animation: "fadeIn 0.2s ease",
                    }}
                  >
                    <CheckCircle size={14} />
                    {t("settings.apiKeySaved")}
                  </span>
                )}
              </div>

              <p className="panel__meta" style={{ marginTop: 4 }}>
                {t("settings.apiKeyPrivacy")}{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    handleOpenUrl("https://www.nexusmods.com/users/myaccount?tab=api+access");
                  }}
                  className="detail-link"
                  style={{ cursor: "pointer" }}
                >
                  {t("settings.nexusAccount")} →
                </a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
