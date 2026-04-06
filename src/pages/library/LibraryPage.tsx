import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { useI18n } from "../../i18n/I18nProvider";
import { useDropZone } from "../../contexts/DropZoneContext";
import {
  batchInstallMods,
  disableMod,
  enableMod,
  installArchiveWithReplace,
  listDisabledMods,
  listInstalledMods,
  pickArchiveFile,
  pickArchiveFiles,
  pickImportFolder,
  previewInstallArchive,
  processImportTargets,
  openModsDirectory,
  openModFolder,
  type ArchiveInstallPreview,
  type BatchImportPreview,
  type BatchInstallResult,
  type DiscoveredMod,
  type InstalledMod,
  type SaveGuardInfo,
  uninstallMod,
} from "../../lib/desktop";
import {
  Trash2,
  FolderOpen,
  ChevronDown,
  Package,
  FolderSearch,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Pencil,
  X,
} from "lucide-react";

// Mod Notes (localStorage)
const MOD_NOTES_STORAGE_KEY = "slaysp2_mod_notes";

function loadModNotes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MOD_NOTES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveModNotes(notes: Record<string, string>) {
  localStorage.setItem(MOD_NOTES_STORAGE_KEY, JSON.stringify(notes));
}

function setModNote(modId: string, note: string): Record<string, string> {
  const notes = loadModNotes();
  const trimmed = note.trim();
  if (trimmed) {
    notes[modId] = trimmed;
  } else {
    delete notes[modId];
  }
  saveModNotes(notes);
  return notes;
}

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
  const navigate = useNavigate();
  const { pendingDropPaths, setPendingDropPaths, setIsBusy } = useDropZone();
  const [enabledMods, setEnabledMods] = useState<InstalledMod[]>([]);
  const [disabledMods, setDisabledMods] = useState<InstalledMod[]>([]);
  const [status, setStatus] = useState(t("library.ready"));
  const [busyId, setBusyId] = useState<string | null>(null);

  // Single-file legacy install preview
  const [installPreview, setInstallPreview] = useState<ArchiveInstallPreview | null>(null);
  const [pendingArchivePath, setPendingArchivePath] = useState<string | null>(null);
  const [pendingEnableNow, setPendingEnableNow] = useState(false);

  // Batch import state
  const [batchPreview, setBatchPreview] = useState<BatchImportPreview | null>(null);
  const [batchPaths, setBatchPaths] = useState<string[]>([]);
  const [batchEnableNow, setBatchEnableNow] = useState(true);
  const [batchInstalling, setBatchInstalling] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, name: "" });
  const [batchResult, setBatchResult] = useState<BatchInstallResult | null>(null);
  const [selectedModIds, setSelectedModIds] = useState<Set<string>>(new Set());
  const [batchConflictResolutions, setBatchConflictResolutions] = useState<Record<string, "replace" | "rename">>({});
  const [successToast, setSuccessToast] = useState<{ message: string; visible: boolean } | null>(null);

  const [pendingUninstall, setPendingUninstall] = useState<InstalledMod | null>(null);
  const [pendingSaveGuardInfo, setPendingSaveGuardInfo] = useState<SaveGuardInfo | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [listRef] = useAutoAnimate<HTMLDivElement>();
  const isPickingFileRef = useRef(false);
  const importMenuRef = useRef<HTMLDivElement>(null);

  // Mod notes state
  const [modNotes, setModNotes] = useState<Record<string, string>>(loadModNotes);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState("");
  const noteInputRef = useRef<HTMLInputElement>(null);

  // Focus note input when editing starts
  useEffect(() => {
    if (editingNoteId && noteInputRef.current) {
      noteInputRef.current.focus();
    }
  }, [editingNoteId]);

  function startEditNote(modId: string) {
    setEditingNoteId(modId);
    setEditingNoteValue(modNotes[modId] ?? "");
  }

  function commitNote(modId: string) {
    const updated = setModNote(modId, editingNoteValue);
    setModNotes(updated);
    setEditingNoteId(null);
    setEditingNoteValue("");
  }

  function clearNote(modId: string) {
    const updated = setModNote(modId, "");
    setModNotes(updated);
    setEditingNoteId(null);
    setEditingNoteValue("");
  }

  const formatErrorMsg = useCallback(
    (err: unknown): string => {
      const raw = err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
      if (raw === "game install not found") return t("error.gameNotFound");
      if (raw.startsWith("mod conflict detected: "))
        return t("error.modConflict", { name: raw.replace("mod conflict detected: ", "") });
      if (raw.startsWith("invalid archive: ")) return t("error.invalidArchive");
      if (raw.startsWith("io error: ") && raw.includes("Permission denied"))
        return t("error.ioPermission");
      if (raw.startsWith("io error: "))
        return t("error.ioGeneral", { detail: raw.replace("io error: ", "") });
      if (raw.includes("not found") && raw.startsWith("mod `")) return t("error.modNotFound");
      return raw || t("library.importFailed");
    },
    [t],
  );

  const reload = useCallback(async () => {
    const [enabled, disabled] = await Promise.all([listInstalledMods(), listDisabledMods()]);
    setEnabledMods(enabled);
    setDisabledMods(disabled);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Reload when profile switch or other external mutation changes mod states
  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("slaymgr:mods-changed", handler);
    return () => window.removeEventListener("slaymgr:mods-changed", handler);
  }, [reload]);

  // Handle files dropped via drag-and-drop (with re-entry guard)
  useEffect(() => {
    if (pendingDropPaths.length > 0 && !busyId) {
      const paths = [...pendingDropPaths];
      setPendingDropPaths([]);
      void proceedWithBatchImport(paths, batchEnableNow);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDropPaths, setPendingDropPaths, busyId]);

  // Handle transient status messages auto-clearing
  useEffect(() => {
    if (status === t("library.ready")) return;
    if (busyId) return;

    const tId = setTimeout(() => setStatus(t("library.ready")), 3500);
    return () => clearTimeout(tId);
  }, [status, busyId, t]);

  // Auto-dismiss success toast
  useEffect(() => {
    if (!successToast) return;
    // Start exit animation after 2.5s
    const fadeTimer = setTimeout(() => {
      setSuccessToast((prev) => (prev ? { ...prev, visible: false } : null));
    }, 2500);
    // Remove from DOM after animation completes
    const removeTimer = setTimeout(() => {
      setSuccessToast(null);
    }, 3000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [successToast?.message]);

  // Close import menu on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setShowImportMenu(false);
      }
    }
    if (showImportMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showImportMenu]);

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
    return enabledMods.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.author?.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        modNotes[m.id]?.toLowerCase().includes(q),
    );
  }, [enabledMods, searchQuery, modNotes]);

  const filteredDisabled = useMemo(() => {
    if (!searchQuery.trim()) return disabledMods;
    const q = searchQuery.trim().toLowerCase();
    return disabledMods.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.author?.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        modNotes[m.id]?.toLowerCase().includes(q),
    );
  }, [disabledMods, searchQuery, modNotes]);

  // Import flows

  /** Single file import (legacy) */
  async function handleImportSingle() {
    if (isPickingFileRef.current || busyId) return;
    isPickingFileRef.current = true;
    setBusyId("picking_file");
    setShowImportMenu(false);
    try {
      const archivePath = await pickArchiveFile();
      if (!archivePath) return;
      void proceedWithBatchImport([archivePath], batchEnableNow);
    } finally {
      isPickingFileRef.current = false;
      setBusyId((prev) => (prev === "picking_file" ? null : prev));
    }
  }

  /** Multi-file import */
  async function handleImportFiles() {
    if (isPickingFileRef.current || busyId) return;
    isPickingFileRef.current = true;
    setBusyId("picking_file");
    setShowImportMenu(false);
    try {
      const files = await pickArchiveFiles();
      if (!files || files.length === 0) return;
      void proceedWithBatchImport(files, batchEnableNow);
    } finally {
      isPickingFileRef.current = false;
      setBusyId((prev) => (prev === "picking_file" ? null : prev));
    }
  }

  /** Folder import */
  async function handleImportFolder() {
    if (isPickingFileRef.current || busyId) return;
    isPickingFileRef.current = true;
    setBusyId("picking_file");
    setShowImportMenu(false);
    try {
      const folder = await pickImportFolder();
      if (!folder) return;
      void proceedWithBatchImport([folder], batchEnableNow);
    } finally {
      isPickingFileRef.current = false;
      setBusyId((prev) => (prev === "picking_file" ? null : prev));
    }
  }

  /** Scan paths and show batch preview */
  async function proceedWithBatchImport(paths: string[], enableNow: boolean) {
    setBusyId("scanning");
    setIsBusy(true);
    setStatus(t("library.scanning"));
    try {
      const preview = await processImportTargets(paths, enableNow);
      setBatchPaths(paths);
      setBatchEnableNow(enableNow);
      setBatchPreview(preview);

      // Auto-select: ready mods are checked, conflict/error/unsupported are not
      const autoSelected = new Set<string>();
      preview.discoveredMods.forEach((mod, idx) => {
        if (mod.status === "ready") {
          autoSelected.add(`${mod.modId}::${idx}`);
        }
      });
      setSelectedModIds(autoSelected);

      setStatus(t("library.generatedPreview"));
    } catch (error) {
      setStatus(formatErrorMsg(error));
    } finally {
      setBusyId(null);
      setIsBusy(false);
    }
  }

  /** Toggle selection of a mod in the batch preview */
  function toggleModSelection(mod: DiscoveredMod, idx: number) {
    // Error and unsupported mods cannot be selected
    if (mod.status === "error" || mod.status === "unsupported_format") return;
    const key = `${mod.modId}::${idx}`;
    setSelectedModIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const selectedCount = selectedModIds.size;

  function renderModNote(mod: InstalledMod) {
    if (editingNoteId === mod.id) {
      return (
        <div className="mod-card__note mod-card__note--editing">
          <input
            ref={noteInputRef}
            className="mod-card__note-input"
            value={editingNoteValue}
            onChange={(e) => setEditingNoteValue(e.target.value)}
            onBlur={() => commitNote(mod.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNote(mod.id);
              if (e.key === "Escape") {
                setEditingNoteId(null);
                setEditingNoteValue("");
              }
            }}
            placeholder={t("library.notePlaceholder")}
            maxLength={80}
          />
          {editingNoteValue.trim() && (
            <button
              className="mod-card__note-clear"
              onMouseDown={(e) => {
                e.preventDefault();
                clearNote(mod.id);
              }}
              title={t("library.noteClear")}
            >
              <X size={12} />
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        className={`mod-card__note ${modNotes[mod.id] ? "has-note" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          startEditNote(mod.id);
        }}
        title={t("library.noteTooltip")}
      >
        {modNotes[mod.id] ? (
          <span className="mod-card__note-text">{modNotes[mod.id]}</span>
        ) : (
          <span className="mod-card__note-placeholder">
            <Pencil size={11} />
            {t("library.notePlaceholder")}
          </span>
        )}
      </div>
    );
  }

  function renderModCard(mod: InstalledMod, enabled: boolean) {
    const isShared = mod.affectsGameplay;
    const impactLabel = t("library.multiplayerAffected");

    return (
      <article className={`mod-card${enabled ? " is-enabled" : ""}`} key={mod.id}>
        <div className="mod-card__left">
          <div className={`mod-card__avatar${enabled ? "" : " is-disabled"}`}>
            {mod.name.charAt(0).toUpperCase()}
          </div>
          <div className="mod-card__info">
            <div className="mod-card__title">
              <span className="mod-card__name">{mod.name}</span>
              <span className="mod-card__version">{mod.version ?? "v1.0"}</span>
              {isShared ? (
                <span className="mod-card__impact" title={impactLabel}>
                  <span className="mod-card__impact-dot" aria-hidden="true"></span>
                  {impactLabel}
                </span>
              ) : null}
            </div>
            <div className="mod-card__author">{mod.author || t("library.unknownAuthor")}</div>
            {renderModNote(mod)}
          </div>
        </div>
        <div className="mod-card__right">
          <label
            className="toggle-switch"
            title={enabled ? t("library.enabledStatus") : t("library.disabledStatus")}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={() => void handleToggle(mod)}
              disabled={busyId === mod.id}
            />
            <span className="toggle-slider"></span>
          </label>
          <div className="mod-card__actions">
            <button
              className="icon-button"
              onClick={() => void openModFolder(mod.id).catch((e) => setStatus(e.toString()))}
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
    );
  }

  /** Confirm batch install */
  async function confirmBatchInstall() {
    if (!batchPreview || batchPaths.length === 0 || selectedCount === 0) return;

    // Extract the actual mod IDs from the selected set (keys are "modId::idx")
    const selectedIds = batchPreview.discoveredMods
      .filter((mod, idx) => selectedModIds.has(`${mod.modId}::${idx}`))
      .map((mod) => mod.modId);

    // Check if any selected mod has conflicts
    const hasConflictsInSelected = batchPreview.discoveredMods.some(
      (mod, idx) => selectedModIds.has(`${mod.modId}::${idx}`) && mod.status === "conflict",
    );
    setBatchInstalling(true);
    setBusyId("batch_install");
    setIsBusy(true);
    setBatchProgress({ current: 0, total: selectedCount, name: "" });

    try {
      const result = await batchInstallMods(batchPaths, batchEnableNow, hasConflictsInSelected, selectedIds, batchConflictResolutions);
      setBatchPreview(null);
      setBatchPaths([]);
      setSelectedModIds(new Set());
      setBatchConflictResolutions({});

      if (result.failureCount === 0) {
        // All succeeded -> toast notification
        setSuccessToast({
          message: t("library.batchAllSuccess", { count: result.successCount }),
          visible: true,
        });
      } else {
        // Has failures -> show dialog for user to review errors
        setBatchResult(result);
      }
      await reload();
    } catch (error) {
      setStatus(formatErrorMsg(error));
    } finally {
      setBusyId(null);
      setBatchInstalling(false);
      setIsBusy(false);
    }
  }

  // Legacy single-file preview confirm
  async function confirmInstall() {
    if (!pendingArchivePath || !installPreview) return;

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
      const result = mod.state === "disabled"
        ? await enableMod(mod.id)
        : await disableMod(mod.id);

      const guard = result.saveGuard;
      if (guard.pathSwitched) {
        if (guard.hadPairs) {
          // Auto-protected: show success toast
          if (guard.error) {
            setStatus(`⚠️ ${guard.error}`);
          } else {
            setStatus(t("library.saveGuardSynced", {
              backups: String(guard.backupsCreated),
              synced: String(guard.savesSynced),
            }));
          }
        } else {
          // No pairs: show backed-up notice + hint
          if (guard.error) {
            setStatus(`⚠️ ${guard.error}`);
          } else {
            setStatus(t("library.saveGuardBackedUp", {
              backups: String(guard.backupsCreated),
            }));
            // Show the warning dialog
            setPendingSaveGuardInfo(guard);
          }
        }
      } else {
        setStatus(t("library.ready"));
      }
      await reload();
    } catch (error) {
      setStatus(formatErrorMsg(error));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmUninstall() {
    if (!pendingUninstall) return;

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

  // Status Icon for discovered mods

  function DiscoveredModStatusIcon({ mod }: { mod: DiscoveredMod }) {
    switch (mod.status) {
      case "ready":
        return <CheckCircle2 size={16} style={{ color: "var(--color-success)" }} />;
      case "conflict":
        return <AlertTriangle size={16} style={{ color: "var(--color-warning)" }} />;
      case "unsupported_format":
        return <AlertCircle size={16} style={{ color: "var(--color-muted)" }} />;
      case "error":
        return <XCircle size={16} style={{ color: "var(--color-danger)" }} />;
      default:
        return null;
    }
  }

  function discoveredStatusLabel(mod: DiscoveredMod): string {
    switch (mod.status) {
      case "ready":
        return t("library.batchStatusReady");
      case "conflict":
        return t("library.batchStatusConflict");
      case "unsupported_format":
        return t("library.batchStatusUnsupported");
      case "error":
        return t("library.batchStatusError");
      default:
        return "";
    }
  }

  // Render

  return (
    <section className="library-page">
      <header className="library-header">
        <div className="library-header__left">
          <h1 className="library-header__title">{t("library.title")}</h1>
          <div className="library-header__meta">
            <span
              className={`library-header__status-dot ${status === t("library.ready") ? "is-ready" : "is-busy"}`}
            ></span>
            <span>
              {t("library.enabled")}: {enabledMods.length} · {t("library.disabled")}:{" "}
              {disabledMods.length}
            </span>
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
                    maxWidth: "500px",
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
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              onChange={(e) => {
                setSearchInput(e.target.value);
                if (!e.target.value.trim()) setSearchQuery("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSearchQuery(searchInput);
              }}
              placeholder={t("library.searchPlaceholder")}
              value={searchInput}
            />
            {searchInput && searchInput !== searchQuery && (
              <span className="search-field__enter-hint">Enter ↵</span>
            )}
          </div>
          <button
            className="button button--secondary"
            onClick={() => void openModsDirectory().catch((e) => setStatus(e.toString()))}
            type="button"
          >
            {t("library.openFolder")}
          </button>

          {/* Split import button with dropdown */}
          <div className="split-button-group" ref={importMenuRef}>
            <button
              className="button button--primary split-button__main"
              disabled={busyId !== null}
              onClick={() => void handleImportSingle()}
              title={t("library.dropHintTooltip")}
              type="button"
            >
              {busyId === "scanning" ? (
                <>
                  <Loader2 size={14} className="spin-icon" />
                  {t("library.scanning")}
                </>
              ) : (
                t("library.importZip")
              )}
            </button>
            <button
              className="button button--primary split-button__toggle"
              disabled={busyId !== null}
              onClick={() => setShowImportMenu((prev) => !prev)}
              type="button"
              aria-label="More import options"
            >
              <ChevronDown size={14} />
            </button>
            {showImportMenu && (
              <div className="split-button__menu">
                <button
                  className="split-button__menu-item"
                  onClick={() => void handleImportFiles()}
                  type="button"
                >
                  <Package size={14} />
                  {t("library.importFiles")}
                </button>
                <button
                  className="split-button__menu-item"
                  onClick={() => void handleImportFolder()}
                  type="button"
                >
                  <FolderSearch size={14} />
                  {t("library.importFolder")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="library-layout">
        <div className="library-pane library-pane--list">
          <div className="mod-list" ref={listRef}>
            {filteredEnabled.length === 0 && filteredDisabled.length === 0 ? (
              <div className="mod-list__empty">
                <strong>
                  {searchQuery ? t("library.noSearchResults") : t("library.emptyEnabled")}
                </strong>
                <span>{searchQuery ? "" : t("library.emptyEnabledHelp")}</span>
              </div>
            ) : (
              <>
                {filteredEnabled.map((mod) => renderModCard(mod, true))}
                {filteredDisabled.map((mod) => renderModCard(mod, false))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Batch Preview Dialog */}
      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={
          batchInstalling
            ? t("library.batchInstalling", {
                current: batchProgress.current,
                total: batchProgress.total,
                name: batchProgress.name,
              })
            : t("library.batchInstallSelected", { count: selectedCount })
        }
        description={
          batchPreview
            ? t("library.batchPreviewDesc", {
                archives: batchPreview.totalTargetsScanned,
                mods: batchPreview.discoveredMods.length,
              })
            : ""
        }
        onCancel={() => {
          setBatchPreview(null);
          setBatchPaths([]);
          setSelectedModIds(new Set());
          setBatchConflictResolutions({});
          setStatus(t("library.importCancelled"));
        }}
        onConfirm={() => void confirmBatchInstall()}
        open={batchPreview !== null}
        title={t("library.batchPreviewTitle")}
      >
        {/* Enable-after-install toggle */}
        <label className="batch-preview-toggle">
          <span>{t("library.enableAfterImport")}</span>
          <input
            type="checkbox"
            className="batch-preview-toggle__switch"
            checked={batchEnableNow}
            onChange={(e) => setBatchEnableNow(e.target.checked)}
          />
        </label>

        <div className="batch-preview-list">
          {batchPreview?.discoveredMods.map((mod, idx) => {
            const key = `${mod.modId}::${idx}`;
            const isDisabled = mod.status === "error" || mod.status === "unsupported_format";
            const isChecked = selectedModIds.has(key);
            return (
              <label
                className={`batch-preview-item batch-preview-item--${mod.status}${
                  isChecked ? " is-selected" : ""
                }${isDisabled ? " is-disabled" : ""}`}
                key={key}
              >
                <div className="batch-preview-item__header">
                  <input
                    type="checkbox"
                    className="batch-preview-item__checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => toggleModSelection(mod, idx)}
                  />
                  <DiscoveredModStatusIcon mod={mod} />
                  <div className="batch-preview-item__info">
                    <strong>
                      {mod.name}
                      {mod.version ? ` (${mod.version})` : ""}
                    </strong>
                    {mod.author && (
                      <span className="batch-preview-item__author">{mod.author}</span>
                    )}
                  </div>
                  <span className="batch-preview-item__status-label">
                    {discoveredStatusLabel(mod)}
                  </span>
                </div>
                {mod.sourceArchive && (
                  <div className="batch-preview-item__source" title={mod.sourceArchive}>
                    {mod.sourceType === "folder" ? (
                      <FolderOpen size={12} style={{ flexShrink: 0 }} />
                    ) : (
                      <Package size={12} style={{ flexShrink: 0 }} />
                    )}
                    <span className={`batch-preview-item__source-badge batch-preview-item__source-badge--${mod.sourceType}`}>
                      {mod.sourceType === "folder"
                        ? t("library.batchSourceFolder")
                        : t("library.batchSourceArchive")}
                    </span>
                    {mod.sourceArchive}
                  </div>
                )}
                {mod.conflicts.length > 0 && (
                  <div className="batch-preview-item__conflicts">
                    {mod.conflicts.map((c, i) => (
                      <span key={i}>{c}</span>
                    ))}
                    {mod.status === "conflict" && isChecked && (
                       <div className="batch-preview-item__resolution" style={{ display: 'flex', gap: '8px', flexDirection: 'column', marginTop: '12px', fontSize: '0.9em', color: 'var(--color-fg-muted)' }}>
                           <label onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                             <input type="radio" name={`res-${key}`} checked={batchConflictResolutions[mod.modId] !== 'rename'} onChange={() => setBatchConflictResolutions(prev => ({...prev, [mod.modId]: 'replace'}))} />
                             <span>{t("library.conflictReplace")}</span>
                          </label>
                          <label onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                             <input type="radio" name={`res-${key}`} checked={batchConflictResolutions[mod.modId] === 'rename'} onChange={() => setBatchConflictResolutions(prev => ({...prev, [mod.modId]: 'rename'}))} />
                             <span>{t("library.conflictRename")}</span>
                          </label>
                       </div>
                    )}
                  </div>
                )}
                {mod.statusMessage && mod.status !== "ready" && (
                  <div className="batch-preview-item__message">{mod.statusMessage}</div>
                )}
              </label>
            );
          })}
        </div>
      </ConfirmDialog>

      {/* Batch Result Dialog */}
      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("common.confirm")}
        description={
          batchResult
            ? t("library.batchResultSummary", {
                success: batchResult.successCount,
                fail: batchResult.failureCount,
              })
            : ""
        }
        onCancel={() => setBatchResult(null)}
        onConfirm={() => setBatchResult(null)}
        open={batchResult !== null}
        title={t("library.batchResultTitle")}
      >
        {batchResult && batchResult.failureCount > 0 && (
          <div className="batch-preview-list">
            {batchResult.results
              .filter((r) => !r.success)
              .map((r, idx) => (
                <article className="batch-preview-item batch-preview-item--error" key={idx}>
                  <div className="batch-preview-item__header">
                    <XCircle size={16} style={{ color: "var(--color-danger)" }} />
                    <strong>{r.name}</strong>
                  </div>
                  {r.errorMessage && (
                    <div className="batch-preview-item__message">{r.errorMessage}</div>
                  )}
                </article>
              ))}
          </div>
        )}
      </ConfirmDialog>

      {/* Legacy single-file preview */}
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

      {/* Uninstall Confirm */}
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

      {/* Save Guard Warning */}
      <ConfirmDialog
        cancelLabel={t("library.saveGuardGoToPair")}
        confirmLabel={t("common.confirm")}
        description={
          pendingSaveGuardInfo
            ? t("library.saveGuardWarnBody", {
                from: pendingSaveGuardInfo.direction === "modded_to_vanilla" ? t("saves.modded") : t("saves.vanilla"),
                to: pendingSaveGuardInfo.direction === "modded_to_vanilla" ? t("saves.vanilla") : t("saves.modded"),
              })
            : undefined
        }
        onCancel={() => { setPendingSaveGuardInfo(null); navigate("/saves"); }}
        onConfirm={() => setPendingSaveGuardInfo(null)}
        open={pendingSaveGuardInfo !== null}
        title={t("library.saveGuardWarnTitle")}
        tone="danger"
      />

      {/* Scanning overlay */}
      {busyId === "scanning" && (
        <div className="batch-overlay">
          <div className="batch-overlay__content">
            <Loader2 size={32} className="spin-icon" />
            <p>{t("library.scanning")}</p>
            <div className="batch-overlay__shimmer" />
          </div>
        </div>
      )}

      {/* Batch install progress overlay */}
      {batchInstalling && (
        <div className="batch-overlay">
          <div className="batch-overlay__content">
            <Loader2 size={32} className="spin-icon" />
            <p>
              {t("library.batchInstalling", {
                current: batchProgress.current,
                total: batchProgress.total,
                name: batchProgress.name,
              })}
            </p>
            <div className="batch-overlay__bar">
              <div
                className="batch-overlay__bar-fill"
                style={{
                  width: batchProgress.total > 0
                    ? `${(batchProgress.current / batchProgress.total) * 100}%`
                    : "0%",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Success Toast (auto-dismiss) */}
      {successToast && (
        <div className={`success-toast ${successToast.visible ? "is-entering" : "is-leaving"}`}>
          <CheckCircle2 size={20} />
          <span>{successToast.message}</span>
        </div>
      )}
    </section>
  );
}
