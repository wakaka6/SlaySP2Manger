import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { PageHeader } from "../../components/common/PageHeader";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/messages";
import {
  createSaveBackup,
  listSaveBackups,
  listSaveSlots,
  restoreSaveBackup,
  transferSave,
  openPathInExplorer,
  deleteSaveBackup,
  getAppBootstrap,
  toggleSaveAutoSync,
  updateSaveSyncPairs,
  syncSaves,
  getCloudSaveStatus,
  ascendToCloudFull,
  descendFromCloudFull,
  type CloudSaveStatusDto,
  type SaveBackupEntry,
  type SaveKind,
  type SaveSlot,
  type SaveSlotRef,
  type SaveSyncPair,
} from "../../lib/desktop";
import { DatabaseBackup, ArchiveRestore, Trash2, FolderOpen, RefreshCw, Link2, X, Shield, UserPen, ChevronDown, ArrowRight, CloudUpload, CloudDownload, Cloud, Activity } from "lucide-react";

function slotRef(slot: SaveSlot): SaveSlotRef {
  return { steamUserId: slot.steamUserId, kind: slot.kind, slotIndex: slot.slotIndex };
}

function formatTime(value: string | null, emptyText: string) {
  if (!value) return emptyText;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function relativeTime(
  value: string | null,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return t("saves.timeJustNow");
  if (diff < 3600) return t("saves.timeMinutesAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("saves.timeHoursAgo", { count: Math.floor(diff / 3600) });
  return t("saves.timeDaysAgo", { count: Math.floor(diff / 86400) });
}

type ReasonKey =
  | "saves.reasonManual"
  | "saves.reasonAutoTransfer"
  | "saves.reasonAutoSync"
  | "saves.reasonAutoPathSwitch"
  | "saves.reasonUnknown";

const REASON_MAP: Record<string, ReasonKey> = {
  manual_backup: "saves.reasonManual",
  auto_before_transfer: "saves.reasonAutoTransfer",
  auto_before_sync: "saves.reasonAutoSync",
  auto_before_path_switch: "saves.reasonAutoPathSwitch",
};

// ── Line data ────────────────────────────────────────────────────────────
type LineCoord = { x1: number; y1: number; x2: number; y2: number };

export function SavesPage() {
  const { t } = useI18n();
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const [backups, setBackups] = useState<SaveBackupEntry[]>([]);
  const [status, setStatus] = useState(t("saves.ready"));
  const [selectedSource, setSelectedSource] = useState<SaveSlot | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<SaveSlot | null>(null);
  const [transferOpen, setTransferOpen] = useState<{ sourceKind: SaveKind; targetKind: SaveKind } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<SaveBackupEntry | null>(null);
  const [autoSync, setAutoSync] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPairs, setSyncPairs] = useState<SaveSyncPair[]>([]);
  const [linkingFrom, setLinkingFrom] = useState<number | null>(null); // vanilla slot index
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Cloud Integration
  const [cloudStatus, setCloudStatus] = useState<CloudSaveStatusDto | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState<"ascend" | "descend" | null>(null);

  // Group backups by kind + slotIndex
  const groupedBackups = useMemo(() => {
    const groups = new Map<string, { kind: SaveKind; slotIndex: number; items: SaveBackupEntry[] }>();
    for (const b of backups) {
      const key = `${b.kind}_${b.slotIndex}`;
      if (!groups.has(key)) {
        groups.set(key, { kind: b.kind, slotIndex: b.slotIndex, items: [] });
      }
      groups.get(key)!.items.push(b);
    }
    return Array.from(groups.entries());
  }, [backups]);

  // refs for card positions
  const layoutRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [lines, setLines] = useState<(LineCoord & { key: string })[]>([]);
  const isActionRunningRef = useRef(false);

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
    
    // Fetch Cloud Status
    getCloudSaveStatus().then(setCloudStatus).catch(() => {});
    
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
        x1: vRect.right - rect.left,
        y1: vRect.top + vRect.height / 2 - rect.top,
        x2: mRect.left - rect.left,
        y2: mRect.top + mRect.height / 2 - rect.top,
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
  const syncPairsHint = syncPairs.length > 0
    ? t("saves.pairCount", { count: syncPairs.length })
    : t("saves.pairNone");

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
    if (isActionRunningRef.current) return;
    isActionRunningRef.current = true;
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
      isActionRunningRef.current = false;
    }
  }

  function openTransfer(sourceKind: SaveKind, targetKind: SaveKind) {
    const sourceSlots = slots.filter((s) => s.kind === sourceKind);
    const targetSlots = slots.filter((s) => s.kind === targetKind);
    if (sourceSlots.length === 0 || targetSlots.length === 0) {
      setStatus(t("saves.transferMissing"));
      return;
    }
    const defaultSource = sourceSlots.find((s) => s.hasData) ?? sourceSlots[0];
    const defaultTarget =
      targetSlots.find((s) => s.slotIndex === defaultSource.slotIndex) ?? targetSlots[0];
    setSelectedSource(defaultSource);
    setSelectedTarget(defaultTarget);
    setTransferOpen({ sourceKind, targetKind });
  }

  // ── Cloud Handlers ────────────────────────────────────────────────
  async function handleCloudAction(action: "ascend" | "descend") {
    if (isActionRunningRef.current || !cloudStatus?.isAvailable) return;
    isActionRunningRef.current = true;
    setIsCloudSyncing(action);
    setStatus(action === "ascend" ? t("saves.cloudAscending") : t("saves.cloudDescending"));
    try {
      if (action === "ascend") {
        await ascendToCloudFull();
      } else {
        await descendFromCloudFull();
      }
      setStatus(action === "ascend" ? t("saves.cloudAscendDone") : t("saves.cloudDescendDone"));
      await reload();
    } catch (error) {
      let errMsg = typeof error === "string" ? error : (error instanceof Error ? error.message : "Unknown error");
      if (errMsg.startsWith("error.")) {
        errMsg = t(errMsg as any);
      }
      setStatus(errMsg || (action === "ascend" ? t("saves.cloudAscendFailed") : t("saves.cloudDescendFailed")));
    } finally {
      setIsCloudSyncing(null);
      isActionRunningRef.current = false;
    }
  }

  async function confirmTransfer() {
    if (isActionRunningRef.current) return;
    if (!selectedSource || !selectedTarget) return;
    isActionRunningRef.current = true;
    try {
      const backup = await transferSave(slotRef(selectedSource), slotRef(selectedTarget));
      setTransferOpen(null);
      setStatus(backup ? t("saves.transferDoneWithBackup") : t("saves.transferDone"));
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saves.transferFailed"));
    } finally {
      isActionRunningRef.current = false;
    }
  }

  async function handleManualBackup(slot: SaveSlot) {
    if (isActionRunningRef.current) return;
    isActionRunningRef.current = true;
    try {
      const backup = await createSaveBackup(slotRef(slot));
      setStatus(t("saves.backupDone", { label: backupLabel(backup) }));
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saves.backupFailed"));
    } finally {
      isActionRunningRef.current = false;
    }
  }

  async function handleDeleteBackup(id: string) {
    if (isActionRunningRef.current) return;
    isActionRunningRef.current = true;
    try {
      await deleteSaveBackup(id);
      await reload();
      setStatus(t("saves.deleteBackupDone"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saves.deleteBackupFailed"));
    } finally {
      isActionRunningRef.current = false;
    }
  }

  async function confirmRestore() {
    if (isActionRunningRef.current) return;
    if (!pendingRestore) return;
    isActionRunningRef.current = true;
    try {
      await restoreSaveBackup(pendingRestore.id);
      setPendingRestore(null);
      setStatus(t("saves.restoreDone"));
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saves.restoreFailed"));
    } finally {
      isActionRunningRef.current = false;
    }
  }

  // ── Render card ────────────────────────────────────────────────────
  function renderCard(slot: SaveSlot) {
    const kind = slot.kind;
    const linked = isPaired(kind, slot.slotIndex);
    const isLinkSource = kind === "vanilla" && linkingFrom === slot.slotIndex;
    const isLinkTarget = kind === "modded" && linkingFrom !== null;

    const classes = [
      "obsidian-node",
      `obsidian-node--${kind}`,
      linked ? "obsidian-node--linked" : "",
      isLinkSource ? "obsidian-node--link-source" : "",
      isLinkTarget ? "obsidian-node--link-target" : "",
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
        <div className="obsidian-node__top">
          <strong>{slotLabel(slot)}</strong>
          {linked && <Link2 size={13} className="save-card__link-icon" />}
        </div>
        <div className="obsidian-node__mid">
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            {formatTime(slot.lastModifiedAt, t("saves.noModified"))}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
            {t("saves.files", { count: slot.fileCount })}
          </span>
        </div>
        <div className="obsidian-node__bottom">
          <button
            className="icon-button"
            onClick={(e) => { e.stopPropagation(); void openPathInExplorer(slot.path); }}
            type="button"
            title={t("saves.openFolder")}
          >
            <FolderOpen size={16} />
          </button>
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
      <div className="status-line" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Activity size={14} className="text-accent" />
        {status}
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

      {/* ── Loom of Destiny Layout ───────────────── */}
      <div className="saves-layout" ref={layoutRef}>
        {/* SVG connection lines overlay */}
        {(lines.length > 0 || isCloudSyncing) && (
          <svg className="saves-lines-svg" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}>
            {/* SVG filter for particle glow */}
            <defs>
              <filter id="particleGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {lines.map((line) => {
              const midY = (line.y1 + line.y2) / 2;
              const pathD = `M${line.x1},${line.y1} C${line.x1 + 30},${line.y1} ${line.x2 - 30},${line.y2} ${line.x2},${line.y2}`;
              return (
                <g key={line.key}>
                  {/* Base connection line */}
                  <path
                    d={pathD}
                    className={`energy-path ${isSyncing ? 'energy-path--active' : 'energy-path--linked'}`}
                  />
                  {/* Forward particles (left → right) */}
                  <path d={pathD} className="energy-particle-track" filter="url(#particleGlow)" />
                  <path d={pathD} className="energy-particle-track energy-particle-track--b" filter="url(#particleGlow)" />
                  <path d={pathD} className="energy-particle-track energy-particle-track--c" />
                  {/* Reverse particles (right → left) */}
                  <path d={pathD} className="energy-particle-track energy-particle-track--rev" filter="url(#particleGlow)" />
                  <path d={pathD} className="energy-particle-track energy-particle-track--rev-b" filter="url(#particleGlow)" />
                  <path d={pathD} className="energy-particle-track energy-particle-track--rev-c" />
                  {/* Delete button at midpoint */}
                  <g
                    style={{ pointerEvents: "all", cursor: "pointer" }}
                    onClick={() => {
                      const pair = syncPairs.find((p) => `${p.vanillaSlot}-${p.moddedSlot}` === line.key);
                      if (pair) void removePair(pair.vanillaSlot, pair.moddedSlot);
                    }}
                  >
                    <circle cx={(line.x1 + line.x2) / 2} cy={(line.y1 + line.y2) / 2} r="9" fill="var(--bg-app)" stroke="var(--accent)" strokeWidth="1" opacity="0.8" />
                    <line x1={(line.x1 + line.x2) / 2 - 3} y1={(line.y1 + line.y2) / 2 - 3} x2={(line.x1 + line.x2) / 2 + 3} y2={(line.y1 + line.y2) / 2 + 3} stroke="var(--accent)" strokeWidth="1.5" />
                    <line x1={(line.x1 + line.x2) / 2 + 3} y1={(line.y1 + line.y2) / 2 - 3} x2={(line.x1 + line.x2) / 2 - 3} y2={(line.y1 + line.y2) / 2 + 3} stroke="var(--accent)" strokeWidth="1.5" />
                  </g>
                </g>
              );
            })}
          </svg>
        )}

         <div className="saves-trinity">
          {/* ── 1. The Cloud Sanctuary (Top Middle) ── */}
          <div className="saves-cloud-core">
              <div className="cloud-core__info">
                 <div className="cloud-core__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Cloud size={28} className="text-accent" />
                    {t("saves.cloudSanctuary")}
                    {cloudStatus?.isAvailable && cloudStatus.cloudPath && (
                       <button
                         className="icon-button"
                         style={{ marginLeft: '4px' }}
                         onClick={() => void openPathInExplorer(cloudStatus.cloudPath!)}
                         type="button"
                         title={t("saves.openFolder")}
                       >
                         <FolderOpen size={16} className="text-secondary hover:text-primary transition-colors" />
                       </button>
                    )}
                 </div>
                 
                 {cloudStatus ? (
                   cloudStatus.isAvailable ? (
                     <div className="cloud-core__status" title={cloudStatus.cloudPath || ""}>
                       {t("saves.cloudDetected")}
                     </div>
                   ) : (
                     <div className="cloud-core__status text-error">{t("saves.cloudNotFound")}</div>
                   )
                 ) : (
                    <div className="cloud-core__status">{t("saves.cloudScanning")}</div>
                 )}
             </div>

             {cloudStatus?.isAvailable && (
                 <div className="cloud-core__actions">
                   <button
                     className="button button--secondary"
                     style={{ gap: '10px' }}
                     disabled={!!isCloudSyncing || isSyncing}
                     onClick={() => void handleCloudAction("descend")}
                     type="button">
                     <CloudDownload size={18} /> 
                     {t("saves.cloudDescend")}
                   </button>
                   <button
                     className="button button--secondary"
                     style={{ borderColor: "var(--accent)", color: "var(--accent)", gap: '10px' }}
                     disabled={!!isCloudSyncing || isSyncing}
                     onClick={() => void handleCloudAction("ascend")}
                     type="button">
                     <CloudUpload size={18} /> 
                     {t("saves.cloudAscend")}
                   </button>
                 </div>
             )}
          </div>
          
          {/* ── 2. Vanilla Realm (Left) ── */}
          <div className="saves-sync-bar saves-sync-bar--grid">
            <label className="saves-sync-toggle">
              <input
                type="checkbox"
                checked={autoSync}
                disabled={isSyncing || !!isCloudSyncing}
                onChange={(e) => void handleToggleSync(e.target.checked)}
              />
              <span>{t("saves.autoSyncLabel")}</span>
            </label>
            <span className="saves-sync-bar__hint">{syncPairsHint}</span>
            <button
              className="button button--secondary button--sm saves-sync-bar__action"
              disabled={isSyncing || !!isCloudSyncing || syncPairs.length === 0}
              onClick={() => void handleSync(false)}
              title={syncPairs.length > 0 ? t("saves.syncNow") : t("saves.syncNoPairs")}
              type="button"
            >
              <RefreshCw size={14} className={isSyncing ? "spin-icon" : ""} />
              {t("saves.syncNow")}
            </button>
          </div>

          <section className="saves-section saves-section--vanilla">
            <div className="saves-section__header">
              <h2>{t("saves.vanillaTitle")}</h2>
              <div className="saves-section__actions">
                <button className="button button--secondary button--sm" onClick={() => openTransfer("vanilla", "modded")} type="button">
                  {t("saves.copyToModded")} &rarr;
                </button>
              </div>
            </div>
            <div className="saves-grid">
              {vanillaSlots.length === 0 ? (
                <article className="activity-item"><strong>{t("saves.noVanilla")}</strong><span>{t("saves.noVanillaHelp")}</span></article>
              ) : vanillaSlots.map(renderCard)}
            </div>
          </section>

          {/* ── 3. Modded Realm (Right) ── */}
          <section className="saves-section saves-section--modded">
            <div className="saves-section__header">
              <h2>{t("saves.moddedTitle")}</h2>
              <div className="saves-section__actions">
                <button className="button button--secondary button--sm" onClick={() => openTransfer("modded", "vanilla")} type="button">
                  &larr; {t("saves.copyToVanilla")}
                </button>
              </div>
            </div>
            <div className="saves-grid">
              {moddedSlots.length === 0 ? (
                <article className="activity-item"><strong>{t("saves.noModded")}</strong><span>{t("saves.noModdedHelp")}</span></article>
              ) : moddedSlots.map(renderCard)}
            </div>
          </section>
        </div>
      </div>

      {/* ── Visual Time Fragment Backup ────────────────── */}
      <section className="panel profile-panel" style={{ marginTop: "32px", border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', background: 'linear-gradient(to bottom, color-mix(in srgb, var(--bg-panel-soft) 80%, transparent), transparent)' }}>
        <div className="panel__header">
          <h2>{t("saves.timeFragments")}</h2>
          <span className="panel__meta">{backups.length}</span>
        </div>
        <div className="backup-timeline">
          {backups.length === 0 ? (
            <div className="activity-item"><strong>{t("saves.noBackups")}</strong><span>{t("saves.noBackupsHelp")}</span></div>
          ) : groupedBackups.map(([groupKey, group]) => {
            const isExpanded = expandedGroups.has(groupKey);
            const kindLabel = group.kind === "vanilla" ? t("saves.vanilla") : t("saves.modded");
            const latestTime = group.items[0]?.createdAt;
            return (
              <div className="backup-group" key={groupKey}>
                <button
                  className="backup-group__header"
                  onClick={() => {
                    setExpandedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(groupKey)) {
                        next.delete(groupKey);
                      } else {
                        next.add(groupKey);
                      }
                      return next;
                    });
                  }}
                  type="button"
                >
                  <ChevronDown
                    size={14}
                    className={`backup-group__chevron ${!isExpanded ? "backup-group__chevron--collapsed" : ""}`}
                  />
                  <span className={`backup-row__kind ${group.kind === "vanilla" ? "backup-row__kind--vanilla" : "backup-row__kind--modded"}`}>
                    {kindLabel}
                  </span>
                  <span className="backup-group__title">
                    {t("saves.slotLabel", { slot: group.slotIndex, state: "" }).replace(" - ", "").trim()}
                  </span>
                  <span className="backup-group__latest">
                    {relativeTime(latestTime, t)}
                  </span>
                  <span className="backup-group__count">{group.items.length}</span>
                </button>
                {isExpanded && (
                  <div className="backup-group__body">
                    {group.items.map((backup) => {
                      const isManual = backup.reason === "manual_backup";
                      const reasonKey = REASON_MAP[backup.reason] ?? "saves.reasonUnknown";
                      return (
                        <div
                          className={`backup-row ${isManual ? "backup-row--manual" : "backup-row--auto"}`}
                          key={backup.id}
                        >
                          <div className="backup-row__info">
                            <span className="backup-row__reason">
                              {isManual
                                ? <UserPen size={12} />
                                : <Shield size={12} />}
                              {t(reasonKey as Parameters<typeof t>[0])}
                            </span>
                          </div>
                          <div className="backup-row__right">
                            <span className="backup-row__time" title={formatTime(backup.createdAt, "")}>
                              {isManual
                                ? formatTime(backup.createdAt, "")
                                : relativeTime(backup.createdAt, t)}
                            </span>
                            <div className="backup-row__actions">
                              <button className="icon-button" onClick={() => void openPathInExplorer(backup.backupPath)} title={t("saves.openFolder")} type="button"><FolderOpen size={14} /></button>
                              <button className="icon-button" onClick={() => setPendingRestore(backup)} title={t("saves.restore")} type="button"><ArchiveRestore size={14} /></button>
                              <button className="icon-button icon-button--danger" onClick={() => void handleDeleteBackup(backup.id)} title={t("saves.delete")} type="button"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Dialogs ───────────────────────────────────── */}
      {(() => {
        const isLinked = selectedSource && selectedTarget && syncPairs.some((p) =>
          (p.vanillaSlot === selectedSource.slotIndex && p.moddedSlot === selectedTarget.slotIndex && selectedSource.kind === "vanilla") ||
          (p.moddedSlot === selectedSource.slotIndex && p.vanillaSlot === selectedTarget.slotIndex && selectedSource.kind === "modded")
        );
        const sourceLabel = transferOpen?.sourceKind === "vanilla" ? t("saves.vanilla") : t("saves.modded");
        const targetLabel = transferOpen?.targetKind === "vanilla" ? t("saves.vanilla") : t("saves.modded");

        return (
          <ConfirmDialog
            cancelLabel={t("common.cancel")} confirmLabel={t("common.confirm")}
            description={t("saves.transferDesc")}
            onCancel={() => setTransferOpen(null)} onConfirm={() => void confirmTransfer()}
            open={transferOpen !== null} 
            title={transferOpen ? t("saves.transferTitle", { source: sourceLabel, target: targetLabel }) : t("saves.confirmTransfer")}
          >
            {transferOpen && (
              <div className="transfer-picker">
                <div className="transfer-picker__column">
                  <span className="transfer-picker__label">{t("saves.source")}</span>
                  {slots.filter((s) => s.kind === transferOpen.sourceKind).map((slot) => (
                    <button
                      key={slot.slotIndex}
                      className={`transfer-picker__item ${selectedSource?.slotIndex === slot.slotIndex && selectedSource?.kind === slot.kind ? "is-selected" : ""} ${!slot.hasData ? "is-empty" : ""}`}
                      onClick={() => slot.hasData && setSelectedSource(slot)}
                      disabled={!slot.hasData}
                      type="button"
                    >
                      <strong>{t("saves.slotLabelShort", { slot: slot.slotIndex })}</strong>
                      <span className="transfer-picker__meta">
                        {slot.hasData
                          ? formatTime(slot.lastModifiedAt, t("saves.noModified"))
                          : t("saves.stateEmpty")}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="transfer-picker__arrow">
                  <ArrowRight size={20} />
                </div>
                <div className="transfer-picker__column">
                  <span className="transfer-picker__label">{t("saves.target")}</span>
                  {slots.filter((s) => s.kind === transferOpen.targetKind).map((slot) => (
                    <button
                      key={slot.slotIndex}
                      className={`transfer-picker__item ${selectedTarget?.slotIndex === slot.slotIndex && selectedTarget?.kind === slot.kind ? "is-selected" : ""}`}
                      onClick={() => setSelectedTarget(slot)}
                      type="button"
                    >
                      <strong>{t("saves.slotLabelShort", { slot: slot.slotIndex })}</strong>
                      <span className="transfer-picker__meta">
                        {slot.hasData
                          ? formatTime(slot.lastModifiedAt, t("saves.noModified"))
                          : t("saves.stateEmpty")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selectedTarget?.hasData && (
              <p className="transfer-flow__note">{t("saves.transferBackupNote")}</p>
            )}
            {isLinked && (
              <p className="transfer-flow__note" style={{ color: "var(--color-warning)", marginTop: "8px" }}>
                {t("saves.transferLinkedWarning")}
              </p>
            )}
          </ConfirmDialog>
        );
      })()}

      <ConfirmDialog
        cancelLabel={t("common.cancel")} confirmLabel={t("common.confirm")}
        description={pendingRestore ? t("saves.confirmRestoreDesc", {
          kind: pendingRestore.kind === "vanilla" ? t("saves.vanilla") : t("saves.modded"),
          slot: pendingRestore.slotIndex,
        }) : undefined}
        onCancel={() => setPendingRestore(null)} onConfirm={() => void confirmRestore()}
        open={pendingRestore !== null} title={t("saves.confirmRestore")} tone="danger"
      />
    </section>
  );
}
