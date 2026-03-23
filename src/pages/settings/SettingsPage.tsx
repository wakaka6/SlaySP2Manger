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
  updateProxyUrl,
  updateAutoBackupKeepCount,
  testProxy,
} from "../../lib/desktop";
import { useUpdate } from "../../contexts/UpdateContext";
import { useTheme, type ThemeMode } from "../../theme/ThemeProvider";
import {
  Eye,
  EyeOff,
  Clipboard,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  FolderOpen,
  Languages,
  Palette,
  Key,
  DatabaseBackup,
  Info,
  Download,
  RefreshCw,
} from "lucide-react";

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
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxySaved, setProxySaved] = useState(false);
  const [proxyTesting, setProxyTesting] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const isActionRunningRef = useRef(false);
  const [autoBackupKeep, setAutoBackupKeep] = useState(5);
  const [appVersion, setAppVersion] = useState("");
  const { phase: updatePhase, availableVersion, errorMessage: updateError, checkForUpdates, installUpdate } = useUpdate();

  useEffect(() => {
    void getAppBootstrap().then((bootstrap) => {
      if (bootstrap.gameDirectory) {
        setGameRootDir(bootstrap.gameDirectory);
      }
      if (bootstrap.nexusApiKey) {
        setApiKey(bootstrap.nexusApiKey);
      }
      if (bootstrap.proxyUrl) {
        setProxyUrl(bootstrap.proxyUrl);
      }
      setAutoBackupKeep(bootstrap.autoBackupKeepCount ?? 5);
      setAppVersion(bootstrap.appVersion ?? "");
      setApiKeyLoaded(true);
      setLocale(bootstrap.locale === "en-US" ? "en-US" : "zh-CN");
    });
  }, [setLocale]);

  async function handleSaveDirectory() {
    if (isActionRunningRef.current) return;
    isActionRunningRef.current = true;
    try {
      await updateGameRootDir(gameRootDir);
      setSaved(
        gameRootDir.trim()
          ? t("settings.savedGameDirectory")
          : t("settings.clearedGameDirectory"),
      );
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
      <PageHeader
        description={t("settings.description")}
        title={t("settings.title")}
      />

      <div className="st-grid">
        {/* ── Game Directory ── */}
        <div className="st-section st-section--wide">
          <div className="st-section__head">
            <FolderOpen size={18} />
            <h2>{t("settings.gameDirectory")}</h2>
          </div>
          <div className="st-section__body">
            <label className="st-field">
              <span className="st-field__label">{t("settings.gameRoot")}</span>
              <div className="st-field__row">
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
                    const { pickImportFolder } = await import(
                      "../../lib/desktop"
                    );
                    const folder = await pickImportFolder();
                    if (folder) setGameRootDir(folder);
                  }}
                >
                  {t("welcome.browse")}
                </button>
              </div>
            </label>
            <div className="st-actions">
              <button
                className="button button--secondary"
                onClick={() => void handleDetect()}
                type="button"
              >
                {t("settings.autoDetect")}
              </button>
              <button
                className="button button--primary"
                onClick={() => void handleSaveDirectory()}
                type="button"
              >
                {t("settings.saveDirectory")}
              </button>
              {saved ? <span className="st-inline-msg">{saved}</span> : null}
            </div>
          </div>
        </div>

        {/* ── Appearance ── */}
        <div className="st-section">
          <div className="st-section__head">
            <Languages size={18} />
            <h2>{t("settings.language")}</h2>
          </div>
          <div className="st-section__body">
            <select
              className="input"
              onChange={(event) =>
                void handleLocaleChange(
                  event.target.value as "zh-CN" | "en-US",
                )
              }
              value={locale}
            >
              <option value="zh-CN">{t("settings.languageZh")}</option>
              <option value="en-US">{t("settings.languageEn")}</option>
            </select>
            <span className="st-hint">{t("settings.languageHelp")}</span>
          </div>
        </div>

        <div className="st-section">
          <div className="st-section__head">
            <Palette size={18} />
            <h2>{t("settings.theme")}</h2>
          </div>
          <div className="st-section__body">
            <select
              className="input"
              onChange={(event) =>
                handleThemeChange(event.target.value as ThemeMode)
              }
              value={themeMode}
            >
              <option value="system">{t("settings.themeSystem")}</option>
              <option value="light">{t("settings.themeLight")}</option>
              <option value="dark">{t("settings.themeDark")}</option>
            </select>
            <span className="st-hint">{t("settings.themeHelp")}</span>
            <span className="st-hint">
              {t("settings.currentAppearance")}：
              {resolvedTheme === "light"
                ? t("settings.currentAppearanceLight")
                : t("settings.currentAppearanceDark")}
            </span>
          </div>
        </div>

        {/* ── Auto-Backup Limit ── */}
        <div className="st-section">
          <div className="st-section__head">
            <DatabaseBackup size={18} />
            <h2>{t("settings.autoBackupTitle")}</h2>
          </div>
          <div className="st-section__body">
            <select
              className="input"
              value={autoBackupKeep}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAutoBackupKeep(v);
                void updateAutoBackupKeepCount(v).then(() => setSaved(t("settings.autoBackupSaved")));
              }}
            >
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
            <span className="st-hint">{t("settings.autoBackupHelp")}</span>
          </div>
        </div>

        {/* ── Proxy ── */}
        <div className="st-section">
          <div className="st-section__head">
            <Globe size={18} />
            <h2>{t("settings.proxy")}</h2>
          </div>
          <div className="st-section__body">
            <label className="st-field">
              <span className="st-field__label">{t("settings.proxyUrl")}</span>
              <input
                className="input"
                placeholder={t("settings.proxyPlaceholder")}
                value={proxyUrl}
                onChange={(e) => {
                  setProxyUrl(e.target.value);
                  setProxySaved(false);
                  setProxyTestResult(null);
                }}
              />
              <span className="st-hint">{t("settings.proxyHelp")}</span>
            </label>
            <div className="st-actions">
              <button
                className="button button--primary"
                type="button"
                onClick={async () => {
                  if (isActionRunningRef.current) return;
                  isActionRunningRef.current = true;
                  try {
                    await updateProxyUrl(proxyUrl);
                    setProxySaved(true);
                    setProxyTestResult(null);
                    setSaved(
                      proxyUrl.trim()
                        ? t("settings.proxySaved")
                        : t("settings.proxyCleared"),
                    );
                  } finally {
                    isActionRunningRef.current = false;
                  }
                }}
              >
                {t("settings.proxySave")}
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={proxyTesting || !proxyUrl.trim()}
                onClick={async () => {
                  setProxyTesting(true);
                  setProxyTestResult(null);
                  try {
                    await testProxy(proxyUrl);
                    setProxyTestResult({
                      ok: true,
                      msg: t("settings.proxyTestSuccess"),
                    });
                  } catch (e) {
                    setProxyTestResult({
                      ok: false,
                      msg: t("settings.proxyTestFail").replace(
                        "{error}",
                        String(e),
                      ),
                    });
                  } finally {
                    setProxyTesting(false);
                  }
                }}
              >
                {proxyTesting ? (
                  <Loader2 size={14} className="spin-icon" />
                ) : null}
                {t("settings.proxyTest")}
              </button>
              {proxySaved && (
                <span className="st-inline-msg st-inline-msg--success">
                  <CheckCircle size={14} />
                  {t("settings.proxySaved")}
                </span>
              )}
            </div>
            {proxyTestResult && (
              <p
                className={`st-inline-msg ${proxyTestResult.ok ? "st-inline-msg--success" : "st-inline-msg--error"}`}
              >
                {proxyTestResult.msg}
              </p>
            )}
          </div>
        </div>

        {/* ── Nexus Mods API ── */}
        <div className="st-section st-section--wide">
          <div className="st-section__head">
            <Key size={18} />
            <h2>{t("settings.nexusIntegration")}</h2>
          </div>
          <div className="st-section__body">
            <label className="st-field">
              <span className="st-field__label">{t("settings.apiKey")}</span>
              <div className="st-field__row">
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    className="input"
                    ref={apiKeyInputRef}
                    type={apiKeyVisible ? "text" : "password"}
                    placeholder={
                      apiKeyLoaded ? t("settings.apiKeyPlaceholder") : "…"
                    }
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    style={{
                      paddingRight: "40px",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setApiKeyVisible((v) => !v)}
                    className="st-input-icon-btn"
                    title={
                      apiKeyVisible
                        ? t("settings.apiKeyHidden")
                        : t("settings.apiKeyVisible")
                    }
                  >
                    {apiKeyVisible ? (
                      <EyeOff size={15} />
                    ) : (
                      <Eye size={15} />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  className="button button--secondary button--compact"
                  onClick={handlePasteApiKey}
                  title={t("settings.paste")}
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Clipboard size={14} />
                  {t("settings.paste")}
                </button>
              </div>
            </label>

            {/* Tutorial toggle */}
            <button
              type="button"
              onClick={() => setShowTutorial((v) => !v)}
              className="st-link-btn"
            >
              {t("settings.howToGetKey")}
              {showTutorial ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>

            {showTutorial && (
              <div className="st-tutorial">
                <h4>{t("settings.tutorialTitle")}</h4>
                <ol>
                  {tutorialSteps.map((step, i) => (
                    <li key={i}>
                      {step.text}
                      {step.linkUrl && step.linkLabel && (
                        <>
                          {" "}
                          <button
                            type="button"
                            onClick={() => handleOpenUrl(step.linkUrl!)}
                            className="st-link-btn st-link-btn--inline"
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
                  className="st-link-btn"
                  style={{ fontSize: "12px", color: "var(--text-dim)" }}
                >
                  {t("settings.tutorialCollapse")}
                </button>
              </div>
            )}

            <div className="st-actions">
              <button
                className="button button--primary"
                type="button"
                onClick={() => void handleSaveApiKey()}
              >
                {t("settings.saveNexusAuth")}
              </button>
              {apiKeySaved && (
                <span className="st-inline-msg st-inline-msg--success">
                  <CheckCircle size={14} />
                  {t("settings.apiKeySaved")}
                </span>
              )}
            </div>

            <p className="st-hint" style={{ marginTop: 4 }}>
              {t("settings.apiKeyPrivacy")}{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleOpenUrl(
                    "https://www.nexusmods.com/users/myaccount?tab=api+access",
                  );
                }}
                className="detail-link"
                style={{ cursor: "pointer" }}
              >
                {t("settings.nexusAccount")} →
              </a>
            </p>
          </div>
        </div>

        {/* ── About ── */}
        <div className="st-section st-section--wide">
          <div className="st-section__head">
            <Info size={18} />
            <h2>{t("settings.aboutTitle")}</h2>
          </div>
          <div className="st-section__body">
            <div className="st-about">
              <div className="st-about__version">
                <span className="st-about__version-label">SlaySP2Manager</span>
                <span className="st-about__version-tag">v{appVersion}</span>
                {updatePhase === "available" && (
                  <span className="st-about__update-badge">
                    {t("updater.newVersion")}: v{availableVersion}
                  </span>
                )}
                {updatePhase === "upToDate" && (
                  <span className="st-about__up-to-date">
                    <CheckCircle size={13} />
                    {t("updater.upToDate")}
                  </span>
                )}
              </div>
              <div className="st-actions">
                {updatePhase === "available" ? (
                  <button
                    className="button button--primary"
                    type="button"
                    onClick={installUpdate}
                  >
                    <Download size={14} />
                    {t("updater.install")}
                  </button>
                ) : (
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={updatePhase === "checking"}
                    onClick={checkForUpdates}
                  >
                    {updatePhase === "checking"
                      ? <Loader2 size={14} className="spin-icon" />
                      : <RefreshCw size={14} />}
                    {t("updater.checkNow")}
                  </button>
                )}
              </div>
              {updatePhase === "error" && updateError && (
                <span className="st-hint" style={{ color: "var(--danger)" }}>{updateError}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
