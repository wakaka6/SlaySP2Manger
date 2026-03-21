import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusBadge } from "../../components/common/StatusBadge";
import { useI18n } from "../../i18n/I18nProvider";
import { useDropZone } from "../../contexts/DropZoneContext";
import {
  disableMod,
  enableMod,
  installArchiveWithReplace,
  listDisabledMods,
  listInstalledMods,
  pickArchiveFile,
  previewInstallArchive,
  openModsDirectory,
  openModFolder,
  type ArchiveInstallPreview,
  type InstalledMod,
  uninstallMod,
} from "../../lib/desktop";
import { Trash2, FolderOpen } from "lucide-react";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

export function LibraryPage() {
  const { t } = useI18n();
  const { pendingDropPath, setPendingDropPath } = useDropZone();
  const [enabledMods, setEnabledMods] = useState<InstalledMod[]>([]);
  const [disabledMods, setDisabledMods] = useState<InstalledMod[]>([]);
  const [status, setStatus] = useState(t("library.ready"));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [installPreview, setInstallPreview] = useState<ArchiveInstallPreview | null>(null);
  const [pendingArchivePath, setPendingArchivePath] = useState<string | null>(null);
  const [pendingEnableNow, setPendingEnableNow] = useState(false);
  const [pendingUninstall, setPendingUninstall] = useState<InstalledMod | null>(null);
  const [askEnableAfterImport, setAskEnableAfterImport] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [listRef] = useAutoAnimate<HTMLDivElement>();
  const isPickingFileRef = useRef(false);

  const formatErrorMsg = useCallback((err: unknown): string => {
    const raw = err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
    if (raw === "game install not found") return t("error.gameNotFound");
    if (raw.startsWith("mod conflict detected: ")) return t("error.modConflict", { name: raw.replace("mod conflict detected: ", "") });
    if (raw.startsWith("invalid archive: ")) return t("error.invalidArchive");
    if (raw.startsWith("io error: ") && raw.includes("Permission denied")) return t("error.ioPermission");
    if (raw.startsWith("io error: ")) return t("error.ioGeneral", { detail: raw.replace("io error: ", "") });
    if (raw.includes("not found") && raw.startsWith("mod `")) return t("error.modNotFound");
    return raw || t("library.importFailed");
  }, [t]);

  const reload = useCallback(async () => {
    const [enabled, disabled] = await Promise.all([
      listInstalledMods(),
      listDisabledMods(),
    ]);
    setEnabledMods(enabled);
    setDisabledMods(disabled);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Handle files dropped via drag-and-drop (from AppShell)
  useEffect(() => {
    if (pendingDropPath) {
      setPendingDropPath(null);
      setAskEnableAfterImport(pendingDropPath);
    }
  }, [pendingDropPath, setPendingDropPath]);

  // Handle transient status messages auto-clearing
  useEffect(() => {
    if (status === t("library.ready")) return;
    if (busyId) return; // Wait until background work is complete

    const tId = setTimeout(() => setStatus(t("library.ready")), 3500);
    return () => clearTimeout(tId);
  }, [status, busyId, t]);

  const importDescription = useMemo(() => {
    if (!installPreview) {
      return "";
    }

    return installPreview.hasConflicts
      ? t("library.installPreviewConflict")
      : t("library.installPreviewSafe");
  }, [installPreview, t]);

  const filteredEnabled = useMemo(() => {
    if (!searchQuery.trim()) return enabledMods;
    const q = searchQuery.trim().toLowerCase();
    return enabledMods.filter((m) => m.name.toLowerCase().includes(q) || m.author?.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [enabledMods, searchQuery]);

  const filteredDisabled = useMemo(() => {
    if (!searchQuery.trim()) return disabledMods;
    const q = searchQuery.trim().toLowerCase();
    return disabledMods.filter((m) => m.name.toLowerCase().includes(q) || m.author?.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [disabledMods, searchQuery]);

  function stateText(mod: InstalledMod) {
    switch (mod.state) {
      case "enabled":
        return { label: t("library.enabledStatus"), tone: "success" as const };
      case "disabled":
        return { label: t("library.disabledStatus"), tone: "neutral" as const };
      case "update_available":
        return { label: t("library.updateAvailable"), tone: "warning" as const };
      case "conflict":
      case "broken":
        return { label: t("library.needsAttention"), tone: "danger" as const };
      default:
        return { label: t("library.unknownStatus"), tone: "neutral" as const };
    }
  }

  async function handleImport() {
    if (isPickingFileRef.current || busyId) return;
    isPickingFileRef.current = true;
    setBusyId("picking_file");
    try {
      const archivePath = await pickArchiveFile();
      if (!archivePath) {
        return;
      }
      setAskEnableAfterImport(archivePath);
    } finally {
      isPickingFileRef.current = false;
      setBusyId((prev) => (prev === "picking_file" ? null : prev));
    }
  }

  async function proceedWithImport(archivePath: string, enableNow: boolean) {
    setAskEnableAfterImport(null);
    setBusyId("install");
    try {
      const preview = await previewInstallArchive(archivePath, enableNow);
      setPendingArchivePath(archivePath);
      setPendingEnableNow(enableNow);
      setInstallPreview(preview);
      setStatus(t("library.generatedPreview"));
    } catch (error) {
      setStatus(formatErrorMsg(error));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmInstall() {
    if (!pendingArchivePath || !installPreview) {
      return;
    }

    setBusyId("install");
    try {
      const installed = await installArchiveWithReplace(
        pendingArchivePath,
        pendingEnableNow,
        installPreview.hasConflicts,
      );
      setStatus(t("library.imported", { count: installed.length }));
      setInstallPreview(null);
      setPendingArchivePath(null);
      await reload();
    } catch (error) {
      setStatus(formatErrorMsg(error));
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(mod: InstalledMod) {
    setBusyId(mod.id);
    setStatus(mod.name);
    try {
      if (mod.state === "disabled") {
        await enableMod(mod.id);
      } else {
        await disableMod(mod.id);
      }
      setStatus(t("library.ready"));
      await reload();
    } catch (error) {
      setStatus(formatErrorMsg(error));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmUninstall() {
    if (!pendingUninstall) {
      return;
    }

    setBusyId(pendingUninstall.id);
    setStatus(`${t("library.uninstall")} ${pendingUninstall.name}`);
    try {
      await uninstallMod(pendingUninstall.id);
      setStatus(t("library.ready"));
      setPendingUninstall(null);
      await reload();
    } catch (error) {
      setStatus(formatErrorMsg(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="library-page">
      <header className="library-header">
        <div className="library-header__left">
          <h1 className="library-header__title">{t("library.title")}</h1>
          <div className="library-header__meta">
            <span className={`library-header__status-dot ${status === t("library.ready") ? 'is-ready' : 'is-busy'}`}></span>
            <span>{t("library.enabled")}: {enabledMods.length} · {t("library.disabled")}: {disabledMods.length}</span>
            {status !== t("library.ready") && (
              <>
                <span style={{ margin: "0 6px", opacity: 0.3 }}>|</span>
                <span 
                  className="library-header__status-text" 
                  style={{ 
                    color: "var(--accent)", 
                    whiteSpace: "nowrap", 
                    overflow: "hidden", 
                    textOverflow: "ellipsis", 
                    maxWidth: "500px" 
                  }}
                  title={status}
                >
                  {status}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="library-header__right">
          <div className="search-field">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("library.searchPlaceholder")}
              value={searchQuery}
            />
          </div>
          <button
            className="button button--secondary"
            onClick={() => void openModsDirectory().catch((e) => setStatus(e.toString()))}
            type="button"
          >
            {t("library.openFolder")}
          </button>
          <button
            className="button button--primary"
            disabled={busyId !== null || askEnableAfterImport !== null}
            onClick={() => void handleImport()}
            title={t("library.dropHintTooltip")}
            type="button"
          >
            {t("library.importZip")}
          </button>
        </div>
      </header>

      <div className="library-layout">
        <div className="library-pane library-pane--list">
          <div className="mod-list" ref={listRef}>
            {filteredEnabled.length === 0 && filteredDisabled.length === 0 ? (
              <div className="mod-list__empty">
                <strong>{searchQuery ? t("library.noSearchResults") : t("library.emptyEnabled")}</strong>
                <span>{searchQuery ? "" : t("library.emptyEnabledHelp")}</span>
              </div>
            ) : (
              <>
                {filteredEnabled.map((mod) => (
                  <article className="mod-card is-enabled" key={mod.id}>
                    <div className="mod-card__left">
                      <div className="mod-card__avatar">
                        {mod.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="mod-card__info">
                        <div className="mod-card__title">
                          <span className="mod-card__name">{mod.name}</span>
                          <span className="mod-card__version">{mod.version ?? "v1.0"}</span>
                        </div>
                        <div className="mod-card__author">{mod.author || t("library.unknownAuthor")}</div>
                      </div>
                    </div>
                    <div className="mod-card__right">
                      <label className="toggle-switch" title={t("library.enabledStatus")}>
                        <input 
                           type="checkbox" 
                           checked={true} 
                           onChange={() => void handleToggle(mod)} 
                           disabled={busyId === mod.id}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                      <div className="mod-card__actions">
                        <button
                          className="icon-button"
                          onClick={() =>
                            void openModFolder(mod.id).catch((e) => setStatus(e.toString()))
                          }
                          title={t("library.openFolder")}
                        >
                          <FolderOpen size={16} />
                        </button>
                        <button
                          className="icon-button icon-button--danger"
                          disabled={busyId === mod.id}
                          onClick={() => setPendingUninstall(mod)}
                          title={t("library.uninstall")}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {filteredDisabled.map((mod) => (
                  <article className="mod-card" key={mod.id}>
                    <div className="mod-card__left">
                      <div className="mod-card__avatar is-disabled">
                        {mod.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="mod-card__info">
                        <div className="mod-card__title">
                          <span className="mod-card__name">{mod.name}</span>
                          <span className="mod-card__version">{mod.version ?? "v1.0"}</span>
                        </div>
                        <div className="mod-card__author">{mod.author || t("library.unknownAuthor")}</div>
                      </div>
                    </div>
                    <div className="mod-card__right">
                      <label className="toggle-switch" title={t("library.disabledStatus")}>
                        <input 
                           type="checkbox" 
                           checked={false} 
                           onChange={() => void handleToggle(mod)} 
                           disabled={busyId === mod.id}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                      <div className="mod-card__actions">
                        <button
                          className="icon-button"
                          onClick={() =>
                            void openModFolder(mod.id).catch((e) => setStatus(e.toString()))
                          }
                          title={t("library.openFolder")}
                        >
                          <FolderOpen size={16} />
                        </button>
                        <button
                          className="icon-button icon-button--danger"
                          disabled={busyId === mod.id}
                          onClick={() => setPendingUninstall(mod)}
                          title={t("library.uninstall")}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        cancelLabel={t("library.installOnly")}
        confirmLabel={t("library.installAndEnable")}
        dismissLabel={t("common.cancel")}
        description={t("library.enableAfterImport")}
        onDismiss={() => {
          setAskEnableAfterImport(null);
          setStatus(t("library.importCancelled"));
        }}
        onCancel={() => {
          if (askEnableAfterImport) {
            void proceedWithImport(askEnableAfterImport, false);
          }
        }}
        onConfirm={() => {
          if (askEnableAfterImport) {
            void proceedWithImport(askEnableAfterImport, true);
          }
        }}
        open={askEnableAfterImport !== null}
        title={t("library.importZip")}
      />

      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("library.startInstall")}
        description={importDescription}
        onCancel={() => {
          setInstallPreview(null);
          setPendingArchivePath(null);
          setStatus(t("library.importCancelled"));
        }}
        onConfirm={() => void confirmInstall()}
        open={installPreview !== null}
        title={t("library.installPreviewTitle")}
      >
        <div className="preview-list">
          {installPreview?.items.map((item) => (
            <article className="preview-item" key={item.modId}>
              <strong>
                {item.name} {item.version ? `(${item.version})` : ""}
              </strong>
              <span>{item.targetDir}</span>
              {item.conflicts.length > 0 ? (
                <div className="preview-item__conflicts">{item.conflicts.join("; ")}</div>
              ) : null}
            </article>
          ))}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("library.uninstall")}
        description={
          pendingUninstall
            ? t("library.confirmUninstallBody", { name: pendingUninstall.name })
            : undefined
        }
        onCancel={() => setPendingUninstall(null)}
        onConfirm={() => void confirmUninstall()}
        open={pendingUninstall !== null}
        title={t("library.confirmUninstallTitle")}
        tone="danger"
      />
    </section>
  );
}
