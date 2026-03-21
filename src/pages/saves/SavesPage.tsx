import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { PageHeader } from "../../components/common/PageHeader";
import { useI18n } from "../../i18n/I18nProvider";
import {
  createSaveBackup,
  listSaveBackups,
  listSaveSlots,
  previewSaveTransfer,
  restoreSaveBackup,
  transferSave,
  openPathInExplorer,
  deleteSaveBackup,
  getAppBootstrap,
  toggleSaveAutoSync,
  updateSaveSyncPairs,
  syncSaves,
  type SaveBackupEntry,
  type SaveKind,
  type SaveSlot,
  type SaveSlotRef,
  type SaveSyncPair,
  type SaveTransferPreview,
} from "../../lib/desktop";
import { DatabaseBackup, ArchiveRestore, Trash2, FolderOpen, RefreshCw, Link2, X } from "lucide-react";

function slotRef(slot: SaveSlot): SaveSlotRef {
  return { steamUserId: slot.steamUserId, kind: slot.kind, slotIndex: slot.slotIndex };
}

function formatTime(value: string | null, emptyText: string) {
  if (!value) return emptyText;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// ── Line data ────────────────────────────────────────────────────────────
type LineCoord = { x1: number; y1: number; x2: number; y2: number };

export function SavesPage() {
  const { t } = useI18n();
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const [backups, setBackups] = useState<SaveBackupEntry[]>([]);
  const [status, setStatus] = useState(t("saves.ready"));
  const [selectedSource, setSelectedSource] = useState<SaveSlot | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<SaveSlot | null>(null);
  const [transferPreview, setTransferPreview] = useState<SaveTransferPreview | null>(null);
  const [pendingRestore, setPendingRestore] = useState<SaveBackupEntry | null>(null);
  const [autoSync, setAutoSync] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPairs, setSyncPairs] = useState<SaveSyncPair[]>([]);
  const [linkingFrom, setLinkingFrom] = useState<number | null>(null); // vanilla slot index

  // refs for card positions
  const layoutRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [lines, setLines] = useState<(LineCoord & { key: string })[]>([]);

  async function reload() {
    const [slotItems, backupItems] = await Promise.all([listSaveSlots(), listSaveBackups()]);
    setSlots(slotItems);
    setBackups(backupItems);
  }

  useEffect(() => {
    getAppBootstrap().then((b) => {
      setAutoSync(b.saveAutoSync);
      setSyncPairs(b.saveSyncPairs);
      if (b.saveAutoSync && b.saveSyncPairs.length > 0) {
        void handleSync(true);
      }
    }).catch(() => {});
    void reload();
  }, []);

  // ── Calculate line positions ───────────────────────────────────────
  const recalcLines = useCallback(() => {
    const container = layoutRef.current;
    if (!container || syncPairs.length === 0) { setLines([]); return; }
    const rect = container.getBoundingClientRect();
    const newLines: (LineCoord & { key: string })[] = [];

    for (const pair of syncPairs) {
      const vEl = cardRefs.current.get(`vanilla-${pair.vanillaSlot}`);
      const mEl = cardRefs.current.get(`modded-${pair.moddedSlot}`);
      if (!vEl || !mEl) continue;

      const vRect = vEl.getBoundingClientRect();
      const mRect = mEl.getBoundingClientRect();

      newLines.push({
        key: `${pair.vanillaSlot}-${pair.moddedSlot}`,
        x1: vRect.left + vRect.width / 2 - rect.left,
        y1: vRect.bottom - rect.top,
        x2: mRect.left + mRect.width / 2 - rect.left,
        y2: mRect.top - rect.top,
      });
    }
    setLines(newLines);
  }, [syncPairs]);

  useLayoutEffect(() => {
    recalcLines();
  }, [syncPairs, slots, recalcLines]);

  useEffect(() => {
    window.addEventListener("resize", recalcLines);
    return () => window.removeEventListener("resize", recalcLines);
  }, [recalcLines]);

  const setCardRef = useCallback((key: string) => (el: HTMLElement | null) => {
    if (el) cardRefs.current.set(key, el);
    else cardRefs.current.delete(key);
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────
  const vanillaSlots = useMemo(() => slots.filter((s) => s.kind === "vanilla"), [slots]);
  const moddedSlots = useMemo(() => slots.filter((s) => s.kind === "modded"), [slots]);

  function slotLabel(slot: SaveSlot) {
    return t("saves.slotLabel", {
      slot: slot.slotIndex,
      state: slot.hasData ? t("saves.stateData") : t("saves.stateEmpty"),
    });
  }

  function backupLabel(backup: SaveBackupEntry) {
    return t("saves.backupLabel", {
      kind: backup.kind === "vanilla" ? t("saves.vanilla") : t("saves.modded"),
      slot: backup.slotIndex,
    });
  }

  function isPaired(kind: SaveKind, slotIndex: number) {
    return syncPairs.some((p) =>
      kind === "vanilla" ? p.vanillaSlot === slotIndex : p.moddedSlot === slotIndex,
    );
  }

  // ── Linking interaction ────────────────────────────────────────────
  function handleVanillaClick(slotIndex: number) {
    if (linkingFrom === slotIndex) {
      setLinkingFrom(null); // cancel
    } else {
      setLinkingFrom(slotIndex);
      setStatus(t("saves.linkSelectModded"));
    }
  }

  async function handleModdedClick(slotIndex: number) {
    if (linkingFrom === null) return;

    // Check if this pair already exists
    const exists = syncPairs.some(
      (p) => p.vanillaSlot === linkingFrom && p.moddedSlot === slotIndex,
    );
    if (exists) {
      setLinkingFrom(null);
      return;
    }

    // Remove any existing pair involving these slots
    const filtered = syncPairs.filter(
      (p) => p.vanillaSlot !== linkingFrom && p.moddedSlot !== slotIndex,
    );
    const newPairs = [...filtered, { vanillaSlot: linkingFrom, moddedSlot: slotIndex }];
    setSyncPairs(newPairs);
    setLinkingFrom(null);
    setStatus(t("saves.linkCreated", { v: linkingFrom, m: slotIndex }));

    try {
      await updateSaveSyncPairs(newPairs);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save pairs");
    }
  }

  async function removePair(vanillaSlot: number, moddedSlot: number) {
    const newPairs = syncPairs.filter(
      (p) => !(p.vanillaSlot === vanillaSlot && p.moddedSlot === moddedSlot),
    );
    setSyncPairs(newPairs);
    setStatus(t("saves.linkRemoved"));

    try {
      await updateSaveSyncPairs(newPairs);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save pairs");
    }
  }

  // ── Cancel linking on Escape ───────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && linkingFrom !== null) {
        setLinkingFrom(null);
        setStatus(t("saves.ready"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linkingFrom, t]);

  // ── Sync & transfer ────────────────────────────────────────────────
  async function handleToggleSync(enabled: boolean) {
    setAutoSync(enabled);
    try {
      await toggleSaveAutoSync(enabled);
      if (enabled && syncPairs.length > 0) await handleSync(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saves.syncFailed"));
    }
  }

  async function handleSync(silent: boolean) {
    if (syncPairs.length === 0) {
      if (!silent) setStatus(t("saves.syncNoPairs"));
      return;
    }
    setIsSyncing(true);
    try {
      const result = await syncSaves();
      await reload();
      if (result.syncedCount > 0) setStatus(t("saves.syncDone", { count: result.syncedCount }));
      else if (!silent) setStatus(t("saves.syncUpToDate"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saves.syncFailed"));
    } finally {
      setIsSyncing(false);
    }
  }

  async function prepareTransfer(sourceKind: SaveKind, targetKind: SaveKind) {
    const source = slots.find((s) => s.kind === sourceKind && s.hasData) ?? null;
    const target =
      slots.find((s) => s.kind === targetKind && s.slotIndex === source?.slotIndex) ??
      slots.find((s) => s.kind === targetKind) ??
      null;
    if (!source || !target) { setStatus(t("saves.transferMissing")); return; }
    setSelectedSource(source);
    setSelectedTarget(target);
    try {
      const preview = await previewSaveTransfer(slotRef(source), slotRef(target));
      setTransferPreview(preview);
      setStatus(t("saves.previewCreated"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saves.previewFailed"));
    }
  }

  async function confirmTransfer() {
    if (!selectedSource || !selectedTarget) return;
    try {
      const backup = await transferSave(slotRef(selectedSource), slotRef(selectedTarget));
      setTransferPreview(null);
      setStatus(backup ? t("saves.transferDoneWithBackup") : t("saves.transferDone"));
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saves.transferFailed"));
    }
  }

  async function handleManualBackup(slot: SaveSlot) {
    try {
      const backup = await createSaveBackup(slotRef(slot));
      setStatus(t("saves.backupDone", { label: backupLabel(backup) }));
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saves.backupFailed"));
    }
  }

  async function handleDeleteBackup(id: string) {
    try {
      await deleteSaveBackup(id);
      await reload();
      setStatus(t("saves.deleteBackupDone"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saves.deleteBackupFailed"));
    }
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    try {
      await restoreSaveBackup(pendingRestore.id);
      setPendingRestore(null);
      setStatus(t("saves.restoreDone"));
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saves.restoreFailed"));
    }
  }

  // ── Render card ────────────────────────────────────────────────────
  function renderCard(slot: SaveSlot) {
    const kind = slot.kind;
    const linked = isPaired(kind, slot.slotIndex);
    const isLinkSource = kind === "vanilla" && linkingFrom === slot.slotIndex;
    const isLinkTarget = kind === "modded" && linkingFrom !== null;

    const classes = [
      "save-card",
      `save-card--${kind}`,
      linked ? "save-card--linked" : "",
      isLinkSource ? "save-card--link-source" : "",
      isLinkTarget ? "save-card--link-target" : "",
    ].filter(Boolean).join(" ");

    function handleClick() {
      if (kind === "vanilla") handleVanillaClick(slot.slotIndex);
      else if (kind === "modded" && linkingFrom !== null) void handleModdedClick(slot.slotIndex);
    }

    return (
      <article
        className={classes}
        key={`${kind}-${slot.steamUserId}-${slot.slotIndex}`}
        ref={setCardRef(`${kind}-${slot.slotIndex}`)}
        onClick={handleClick}
        style={{ cursor: linkingFrom !== null || kind === "vanilla" ? "pointer" : undefined }}
      >
        <div className="save-card__top">
          <strong>{slotLabel(slot)}</strong>
          {linked && <Link2 size={13} className="save-card__link-icon" />}
        </div>
        <div className="save-card__mid">
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            {formatTime(slot.lastModifiedAt, t("saves.noModified"))}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
            {t("saves.files", { count: slot.fileCount })}
          </span>
        </div>
        <div className="save-card__bottom">
          <button
            className="icon-button"
            disabled={!slot.hasData}
            onClick={(e) => { e.stopPropagation(); void handleManualBackup(slot); }}
            type="button"
            title={t("saves.backup")}
          >
            <DatabaseBackup size={16} />
          </button>
        </div>
      </article>
    );
  }

  return (
    <section className="page">
      <PageHeader description={t("saves.description")} title={t("saves.title")} />
      <div className="status-line">{status}</div>

      {/* ── Sync bar ──────────────────────────────────── */}
      <div className="saves-sync-bar">
        <label className="saves-sync-toggle">
          <input type="checkbox" checked={autoSync} onChange={(e) => void handleToggleSync(e.target.checked)} />
          <span>{t("saves.autoSyncLabel")}</span>
        </label>
        <span className="saves-sync-bar__hint">
          {syncPairs.length > 0
            ? t("saves.pairCount", { count: syncPairs.length })
            : t("saves.pairNone")}
        </span>
        <button
          className="icon-button"
          disabled={isSyncing || syncPairs.length === 0}
          onClick={() => void handleSync(false)}
          title={t("saves.syncNow")}
          type="button"
        >
          <RefreshCw size={15} className={isSyncing ? "spin-icon" : ""} />
        </button>
      </div>

      {/* ── Linking hint ──────────────────────────────── */}
      {linkingFrom !== null && (
        <div className="saves-link-hint">
          <Link2 size={14} />
          <span>{t("saves.linkHint", { slot: linkingFrom })}</span>
          <button className="saves-link-hint__cancel" onClick={() => { setLinkingFrom(null); setStatus(t("saves.ready")); }} type="button">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Saves layout with SVG lines ───────────────── */}
      <div className="saves-layout" ref={layoutRef}>
        {/* SVG overlay for connection lines */}
        {lines.length > 0 && (
          <svg className="saves-lines-svg" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}>
            {lines.map((line) => {
              const midY = (line.y1 + line.y2) / 2;
              return (
                <g key={line.key}>
                  <path
                    d={`M${line.x1},${line.y1} C${line.x1},${midY} ${line.x2},${midY} ${line.x2},${line.y2}`}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    opacity="0.5"
                  />
                  {/* Remove button at midpoint */}
                  <g
                    style={{ pointerEvents: "all", cursor: "pointer" }}
                    onClick={() => {
                      const pair = syncPairs.find((p) => `${p.vanillaSlot}-${p.moddedSlot}` === line.key);
                      if (pair) void removePair(pair.vanillaSlot, pair.moddedSlot);
                    }}
                  >
                    <circle cx={(line.x1 + line.x2) / 2} cy={midY} r="10" fill="var(--bg-panel)" stroke="var(--accent)" strokeWidth="1.5" opacity="0.9" />
                    <line x1={(line.x1 + line.x2) / 2 - 3.5} y1={midY - 3.5} x2={(line.x1 + line.x2) / 2 + 3.5} y2={midY + 3.5} stroke="var(--accent)" strokeWidth="1.5" />
                    <line x1={(line.x1 + line.x2) / 2 + 3.5} y1={midY - 3.5} x2={(line.x1 + line.x2) / 2 - 3.5} y2={midY + 3.5} stroke="var(--accent)" strokeWidth="1.5" />
                  </g>
                </g>
              );
            })}
          </svg>
        )}

        <section className="saves-section saves-section--vanilla">
          <div className="saves-section__header">
            <h2>{t("saves.vanillaTitle")}</h2>
            <button className="button button--secondary button--sm" onClick={() => void prepareTransfer("vanilla", "modded")} type="button">
              {t("saves.copyToModded")} &rarr;
            </button>
          </div>
          <div className="saves-grid">
            {vanillaSlots.length === 0 ? (
              <article className="activity-item"><strong>{t("saves.noVanilla")}</strong><span>{t("saves.noVanillaHelp")}</span></article>
            ) : vanillaSlots.map(renderCard)}
          </div>
        </section>

        <section className="saves-section saves-section--modded">
          <div className="saves-section__header">
            <h2 style={{ color: "var(--accent)" }}>{t("saves.moddedTitle")}</h2>
            <button className="button button--secondary button--sm" onClick={() => void prepareTransfer("modded", "vanilla")} type="button">
              &larr; {t("saves.copyToVanilla")}
            </button>
          </div>
          <div className="saves-grid">
            {moddedSlots.length === 0 ? (
              <article className="activity-item"><strong>{t("saves.noModded")}</strong><span>{t("saves.noModdedHelp")}</span></article>
            ) : moddedSlots.map(renderCard)}
          </div>
        </section>
      </div>

      {/* ── Backups ───────────────────────────────────── */}
      <section className="panel profile-panel" style={{ marginTop: "16px" }}>
        <div className="panel__header">
          <h2>{t("saves.backups")}</h2>
          <span className="panel__meta">{backups.length}</span>
        </div>
        <div className="activity-list">
          {backups.length === 0 ? (
            <div className="activity-item"><strong>{t("saves.noBackups")}</strong><span>{t("saves.noBackupsHelp")}</span></div>
          ) : backups.map((backup) => (
            <article className="activity-item" key={backup.id}>
              <div className="activity-item__head">
                <strong>{backupLabel(backup)}</strong>
                <span>{formatTime(backup.createdAt, t("saves.noModified"))}</span>
              </div>
              <div className="activity-item__body" style={{ marginTop: "8px", fontSize: "13px", color: "var(--text-muted)" }}>
                <div style={{ wordBreak: "break-all" }}>{backup.backupPath}</div>
                <div style={{ marginTop: "4px", fontStyle: "italic" }}>{backup.reason}</div>
              </div>
              <div className="action-row" style={{ marginTop: "16px" }}>
                <button className="icon-button" onClick={() => void openPathInExplorer(backup.backupPath)} title={t("saves.openFolder")} type="button"><FolderOpen size={16} /></button>
                <button className="icon-button" onClick={() => setPendingRestore(backup)} title={t("saves.restore")} type="button"><ArchiveRestore size={16} /></button>
                <button className="icon-button icon-button--danger" onClick={() => void handleDeleteBackup(backup.id)} title={t("saves.delete")} type="button"><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Dialogs ───────────────────────────────────── */}
      <ConfirmDialog
        cancelLabel={t("common.cancel")} confirmLabel={t("common.confirm")}
        description={transferPreview?.summary}
        onCancel={() => setTransferPreview(null)} onConfirm={() => void confirmTransfer()}
        open={transferPreview !== null} title={t("saves.confirmTransfer")}
      >
        <div className="preview-list">
          {selectedSource ? <article className="preview-item"><strong>{t("saves.source")} - {selectedSource.kind === "vanilla" ? t("saves.vanilla") : t("saves.modded")}</strong><span>{selectedSource.path}</span></article> : null}
          {selectedTarget ? <article className="preview-item"><strong>{t("saves.target")} - {selectedTarget.kind === "vanilla" ? t("saves.vanilla") : t("saves.modded")}</strong><span>{selectedTarget.path}</span></article> : null}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        cancelLabel={t("common.cancel")} confirmLabel={t("common.confirm")}
        description={pendingRestore ? backupLabel(pendingRestore) : undefined}
        onCancel={() => setPendingRestore(null)} onConfirm={() => void confirmRestore()}
        open={pendingRestore !== null} title={t("saves.confirmRestore")} tone="danger"
      />
    </section>
  );
}
