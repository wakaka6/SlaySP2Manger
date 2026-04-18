import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CloudDiffWorkbenchDialog } from "../../components/saves/CloudDiffWorkbenchDialog";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import ElectricBorder from "../../components/common/ElectricBorder";
import { PageHeader } from "../../components/common/PageHeader";
import { useI18n } from "../../i18n/I18nProvider";
import "./SavesPage.effects.css";
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
import { DatabaseBackup, ArchiveRestore, Trash2, FolderOpen, RefreshCw, Link2, X, Shield, UserPen, ChevronDown, ArrowRight, CloudUpload, CloudDownload, Cloud, AlertCircle } from "lucide-react";

function slotRef(slot: SaveSlot): SaveSlotRef {
  return { steamUserId: slot.steamUserId, kind: slot.kind, slotIndex: slot.slotIndex };
}

function compareSlots(left: SaveSlot, right: SaveSlot) {
  return left.slotIndex - right.slotIndex;
}

function setSlotCardGlowPosition(element: HTMLElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();
  element.style.setProperty("--slot-glow-x", `${clientX - rect.left}px`);
  element.style.setProperty("--slot-glow-y", `${clientY - rect.top}px`);
}

function resetSlotCardGlowPosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  element.style.setProperty("--slot-glow-x", `${rect.width / 2}px`);
  element.style.setProperty("--slot-glow-y", `${rect.height / 2}px`);
}

function spawnSlotCardRipple(element: HTMLElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const maxDistance = Math.max(
    Math.hypot(x, y),
    Math.hypot(x - rect.width, y),
    Math.hypot(x, y - rect.height),
    Math.hypot(x - rect.width, y - rect.height),
  );

  const ripple = document.createElement("span");
  ripple.className = "obsidian-node__ripple";
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.style.width = `${maxDistance * 2}px`;
  ripple.style.height = `${maxDistance * 2}px`;
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  element.appendChild(ripple);
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

type SavesPageRouteState = {
  openCloudDiffWorkbench?: boolean;
  source?: string;
  requestId?: number;
};

export function SavesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const [backups, setBackups] = useState<SaveBackupEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "info" | "success" | "error"; visible: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const toastRemoveTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((text: string, tone: "info" | "success" | "error" = "info", autoHide = true) => {
    clearTimeout(toastTimer.current);
    clearTimeout(toastRemoveTimer.current);
    if (tone !== "error") {
      setToast(null);
      return;
    }
    setToast({ text, tone, visible: true });
    if (autoHide) {
      toastTimer.current = setTimeout(() => {
        setToast(prev => prev ? { ...prev, visible: false } : null);
        toastRemoveTimer.current = setTimeout(() => setToast(null), 400);
      }, 3000);
    }
  }, []);
  useEffect(() => () => { clearTimeout(toastTimer.current); clearTimeout(toastRemoveTimer.current); }, []);
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
  const [steamCloudRiskAction, setSteamCloudRiskAction] = useState<"ascend" | "descend" | null>(null);
  const [cloudDiffOpen, setCloudDiffOpen] = useState(false);
  const vanillaElectricBorderColor = "#5eb3e4";
  const electricBorderColor =
    typeof window === "undefined"
      ? "#e8af52"
      : getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e8af52";

  const cloudMismatchSummary = useMemo(() => {
    if (!cloudStatus?.isAvailable || !cloudStatus.hasMismatch) return null;
    return t("saves.cloudMismatchSummary", {
      localOnly: cloudStatus.localOnlyCount,
      cloudOnly: cloudStatus.cloudOnlyCount,
      different: cloudStatus.differentCount,
    });
  }, [cloudStatus, t]);

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
  const [lineMaskRects, setLineMaskRects] = useState<Array<{ x: number; y: number; width: number; height: number }>>([]);
  const [overlaySize, setOverlaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const isActionRunningRef = useRef(false);
  const handledCloudDiffRequestRef = useRef<number | null>(null);

  async function reload() {
    const [slotItems, backupItems, nextCloudStatus] = await Promise.all([
      listSaveSlots(),
      listSaveBackups(),
      getCloudSaveStatus().catch(() => null),
    ]);
    setSlots(slotItems);
    setBackups(backupItems);
    setCloudStatus(nextCloudStatus);
  }

  useEffect(() => {
    getAppBootstrap().then((b) => {
      setAutoSync(b.saveAutoSync);
      setSyncPairs(b.saveSyncPairs);
      if (b.saveAutoSync && b.saveSyncPairs.length > 0) {
        void handleSync(true);
      }
    }).catch(() => {});
    reload().finally(() => {
      setLoaded(true);
      requestAnimationFrame(() => setContentVisible(true));
    });
  }, []);

  useEffect(() => {
    const routeState = (location.state ?? null) as SavesPageRouteState | null;
    if (!routeState?.openCloudDiffWorkbench) return;

    const requestId = routeState.requestId ?? 0;
    if (handledCloudDiffRequestRef.current === requestId) return;
    handledCloudDiffRequestRef.current = requestId;

    setCloudDiffOpen(true);
    showToast(t("saves.cloudReviewBeforeLaunch"), "info", false);
    void reload();
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, t]);

  // ── Calculate line positions ───────────────────────────────────────
  const recalcLines = useCallback(() => {
    const container = layoutRef.current;
    if (!container) {
      setLines([]);
      setLineMaskRects([]);
      setOverlaySize({ width: 0, height: 0 });
      return;
    }

    const rect = container.getBoundingClientRect();
    setOverlaySize({ width: rect.width, height: rect.height });

    const maskRects = Array.from(cardRefs.current.values()).map((card) => {
      const cardRect = card.getBoundingClientRect();
      return {
        x: cardRect.left - rect.left - 1,
        y: cardRect.top - rect.top - 1,
        width: cardRect.width + 2,
        height: cardRect.height + 2,
      };
    });
    setLineMaskRects(maskRects);

    if (syncPairs.length === 0) {
      setLines([]);
      return;
    }

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

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const scheduleRecalc = () => {
      window.requestAnimationFrame(recalcLines);
    };

    const observer = new ResizeObserver(scheduleRecalc);
    const layout = layoutRef.current;

    if (layout) observer.observe(layout);
    for (const card of cardRefs.current.values()) {
      observer.observe(card);
    }

    return () => observer.disconnect();
  }, [recalcLines, slots, syncPairs]);

  const setCardRef = useCallback((key: string) => (el: HTMLElement | null) => {
    if (el) {
      cardRefs.current.set(key, el);
      resetSlotCardGlowPosition(el);
    }
    else cardRefs.current.delete(key);
  }, []);

  const handleSlotCardPointerEnter = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const element = event.currentTarget;
    element.style.setProperty("--slot-glow-active", "1");
    setSlotCardGlowPosition(element, event.clientX, event.clientY);
  }, []);

  const handleSlotCardPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    setSlotCardGlowPosition(event.currentTarget, event.clientX, event.clientY);
  }, []);

  const handleSlotCardPointerLeave = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const element = event.currentTarget;
    element.style.setProperty("--slot-glow-active", "0");
  }, []);

  const handleSlotCardPress = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    spawnSlotCardRipple(event.currentTarget, event.clientX, event.clientY);
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────
  const vanillaSlots = useMemo(() => slots.filter((s) => s.kind === "vanilla").sort(compareSlots), [slots]);
  const moddedSlots = useMemo(() => slots.filter((s) => s.kind === "modded").sort(compareSlots), [slots]);
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
      showToast(t("saves.linkSelectModded"), "info", false);
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
    showToast(t("saves.linkCreated", { v: linkingFrom, m: slotIndex }), "success");

    try {
      await updateSaveSyncPairs(newPairs);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to save pairs", "error", false);
    }
  }

  async function removePair(vanillaSlot: number, moddedSlot: number) {
    const newPairs = syncPairs.filter(
      (p) => !(p.vanillaSlot === vanillaSlot && p.moddedSlot === moddedSlot),
    );
    setSyncPairs(newPairs);
    showToast(t("saves.linkRemoved"), "success");

    try {
      await updateSaveSyncPairs(newPairs);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to save pairs", "error", false);
    }
  }

  // ── Cancel linking on Escape ───────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && linkingFrom !== null) {
        setLinkingFrom(null);
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
      showToast(error instanceof Error ? error.message : t("saves.syncFailed"), "error", false);
    }
  }

  async function handleSync(silent: boolean) {
    if (syncPairs.length === 0) {
      if (!silent) showToast(t("saves.syncNoPairs"), "info");
      return;
    }
    if (isActionRunningRef.current) return;
    isActionRunningRef.current = true;
    setIsSyncing(true);
    try {
      const result = await syncSaves();
      await reload();
      if (result.syncedCount > 0) showToast(t("saves.syncDone", { count: result.syncedCount }), "success");
      else if (!silent) showToast(t("saves.syncUpToDate"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("saves.syncFailed"), "error", false);
    } finally {
      setIsSyncing(false);
      isActionRunningRef.current = false;
    }
  }

  function openTransfer(sourceKind: SaveKind, targetKind: SaveKind) {
    const sourceSlots = slots.filter((s) => s.kind === sourceKind);
    const targetSlots = slots.filter((s) => s.kind === targetKind);
    if (sourceSlots.length === 0 || targetSlots.length === 0) {
      showToast(t("saves.transferMissing"), "error");
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
  async function handleCloudAction(action: "ascend" | "descend", allowSteamRunning = false) {
    if (isActionRunningRef.current || !cloudStatus?.isAvailable) return;
    isActionRunningRef.current = true;
    setIsCloudSyncing(action);
    showToast(action === "ascend" ? t("saves.cloudAscending") : t("saves.cloudDescending"), "info", false);
    try {
      const nextStatus =
        action === "ascend"
          ? await ascendToCloudFull(allowSteamRunning)
          : await descendFromCloudFull(allowSteamRunning);

      setCloudStatus(nextStatus);

      if (action === "ascend") {
        showToast(
          nextStatus.localAppliedToCloud && !nextStatus.hasMismatch
            ? t("saves.cloudAscendDone")
            : t("saves.cloudAscendPreparedWithWarnings"),
          "success",
        );
      } else {
        showToast(
          nextStatus.cloudAppliedToLocal && !nextStatus.hasMismatch
            ? t("saves.cloudDescendDone")
            : t("saves.cloudDescendPreparedWithWarnings"),
          "success",
        );
      }
      await reload();
    } catch (error) {
      let errMsg = typeof error === "string" ? error : (error instanceof Error ? error.message : "Unknown error");
      if (errMsg === "error.steamRunningBeforeCloudSync" && !allowSteamRunning) {
        setSteamCloudRiskAction(action);
        showToast(t("saves.cloudSteamRunningReview"), "info", false);
        return;
      }
      if (errMsg.startsWith("error.")) {
        errMsg = t(errMsg as any);
      }
      showToast(errMsg || (action === "ascend" ? t("saves.cloudAscendFailed") : t("saves.cloudDescendFailed")), "error", false);
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
      showToast(backup ? t("saves.transferDoneWithBackup") : t("saves.transferDone"), "success");
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("saves.transferFailed"), "error", false);
    } finally {
      isActionRunningRef.current = false;
    }
  }

  async function handleManualBackup(slot: SaveSlot) {
    if (isActionRunningRef.current) return;
    isActionRunningRef.current = true;
    try {
      const backup = await createSaveBackup(slotRef(slot));
      showToast(t("saves.backupDone", { label: backupLabel(backup) }), "success");
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("saves.backupFailed"), "error", false);
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
      showToast(t("saves.deleteBackupDone"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("saves.deleteBackupFailed"), "error", false);
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
      showToast(t("saves.restoreDone"), "success");
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("saves.restoreFailed"), "error", false);
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
    const isClickable = linkingFrom !== null || kind === "vanilla";
    const cardKey = `${kind}-${slot.steamUserId}-${slot.slotIndex}`;

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

    const cardNode = (
      <article
        className={classes}
        key={cardKey}
        ref={setCardRef(`${kind}-${slot.slotIndex}`)}
        onClick={isClickable ? (event) => {
          handleSlotCardPress(event);
          handleClick();
        } : undefined}
        onPointerEnter={handleSlotCardPointerEnter}
        onPointerLeave={handleSlotCardPointerLeave}
        onPointerMove={handleSlotCardPointerMove}
        style={{ cursor: isClickable ? "pointer" : undefined }}
      >
        <span aria-hidden="true" className="obsidian-node__magic-spotlight" />
        <span aria-hidden="true" className="obsidian-node__magic-border" />
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

    if (!linked) {
      return cardNode;
    }

    return (
      <ElectricBorder
        key={cardKey}
        borderRadius={14}
        chaos={0.03}
        className="obsidian-node-electric"
        color={kind === "vanilla" ? vanillaElectricBorderColor : electricBorderColor}
        speed={0.34}
        style={{ borderRadius: "var(--radius-md)" }}
        thickness={1.5}
      >
        {cardNode}
      </ElectricBorder>
    );
  }

  function renderSkeletonCard(key: string) {
    return (
      <article className="obsidian-node saves-skeleton-card" key={key} aria-hidden="true">
        <div className="obsidian-node__top">
          <span className="skeleton-text saves-skeleton-card__title" />
          <span className="skeleton-text saves-skeleton-card__dot" />
        </div>
        <div className="obsidian-node__mid saves-skeleton-card__mid">
          <span className="skeleton-text saves-skeleton-card__line saves-skeleton-card__line--wide" />
          <span className="skeleton-text saves-skeleton-card__line saves-skeleton-card__line--narrow" />
        </div>
        <div className="obsidian-node__bottom">
          <span className="skeleton-text saves-skeleton-card__icon" />
          <span className="skeleton-text saves-skeleton-card__icon" />
        </div>
      </article>
    );
  }

  function renderLoadingState() {
    return (
      <>
        <div className="saves-cloud-core saves-skeleton-panel" aria-hidden="true">
          <div className="cloud-core__info">
            <div className="cloud-core__title">
              <span className="skeleton-text saves-skeleton-cloud-icon" />
              <span className="skeleton-text saves-skeleton-pill" />
            </div>
            <div className="cloud-core__status">
              <span className="skeleton-text saves-skeleton-line saves-skeleton-line--lg" />
              <span className="skeleton-text saves-skeleton-line saves-skeleton-line--md" />
              <span className="skeleton-text saves-skeleton-line saves-skeleton-line--sm" />
            </div>
          </div>
          <div className="cloud-core__actions saves-skeleton-actions">
            <span className="skeleton-text saves-skeleton-action" />
            <span className="skeleton-text saves-skeleton-action" />
          </div>
        </div>

        <div className="saves-sync-bar saves-sync-bar--grid saves-skeleton-panel" aria-hidden="true">
          <span className="skeleton-text saves-skeleton-toggle" />
          <span className="skeleton-text saves-skeleton-hint" />
          <span className="skeleton-text saves-skeleton-action saves-skeleton-action--sm" />
        </div>

        <section className="saves-section saves-section--vanilla" aria-busy="true">
          <div className="saves-section__header">
            <h2>{t("saves.vanillaTitle")}</h2>
            <div className="saves-section__actions" aria-hidden="true">
              <span className="skeleton-text saves-skeleton-action saves-skeleton-action--header" />
            </div>
          </div>
          <div className="saves-grid">
            {[1, 2, 3].map((index) => renderSkeletonCard(`vanilla-skeleton-${index}`))}
          </div>
        </section>

        <section className="saves-section saves-section--modded" aria-busy="true">
          <div className="saves-section__header">
            <h2>{t("saves.moddedTitle")}</h2>
            <div className="saves-section__actions" aria-hidden="true">
              <span className="skeleton-text saves-skeleton-action saves-skeleton-action--header" />
            </div>
          </div>
          <div className="saves-grid">
            {[1, 2, 3].map((index) => renderSkeletonCard(`modded-skeleton-${index}`))}
          </div>
        </section>
      </>
    );
  }

  return (
    <section className="page">
      <PageHeader description={t("saves.description")} title={t("saves.title")} />
      {/* ── Loom of Destiny Layout ───────────────── */}
      <div className="saves-layout" ref={layoutRef}>
        {/* SVG connection lines overlay */}
        {(lines.length > 0 || isCloudSyncing) && (
          <svg
            className="saves-lines-svg"
            viewBox={`0 0 ${Math.max(overlaySize.width, 1)} ${Math.max(overlaySize.height, 1)}`}
            preserveAspectRatio="none"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}
          >
            {/* SVG filter for particle glow */}
            <defs>
              <filter id="particleGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <mask
                id="saves-line-mask"
                maskUnits="userSpaceOnUse"
                x={0}
                y={0}
                width={Math.max(overlaySize.width, 1)}
                height={Math.max(overlaySize.height, 1)}
              >
                <rect
                  x={0}
                  y={0}
                  width={Math.max(overlaySize.width, 1)}
                  height={Math.max(overlaySize.height, 1)}
                  fill="white"
                />
                {lineMaskRects.map((maskRect) => (
                  <rect
                    key={`mask-${maskRect.x}-${maskRect.y}-${maskRect.width}-${maskRect.height}`}
                    x={maskRect.x}
                    y={maskRect.y}
                    width={maskRect.width}
                    height={maskRect.height}
                    rx={14}
                    ry={14}
                    fill="black"
                  />
                ))}
              </mask>
            </defs>
            {lines.map((line) => {
              const midY = (line.y1 + line.y2) / 2;
              const pathD = `M${line.x1},${line.y1} C${line.x1 + 30},${line.y1} ${line.x2 - 30},${line.y2} ${line.x2},${line.y2}`;
              return (
                <g key={line.key}>
                  <g mask="url(#saves-line-mask)">
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
                  </g>
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
          {!loaded ? renderLoadingState() : (
            <>
          {/* ── 1. The Cloud Sanctuary (Top Middle) ── */}
          <ElectricBorder
            borderRadius={14}
            chaos={0.04}
            className={`saves-live-block${contentVisible ? " saves-live-block--visible" : ""}`}
            color={electricBorderColor}
            speed={0.4}
            style={{ borderRadius: 14, gridArea: "cloud", width: "100%" }}
            thickness={2}
          >
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
                     <div className="cloud-core__status">
                       <div className="cloud-core__headline">
                         {cloudStatus.hasMismatch
                           ? t("saves.cloudMismatch")
                           : t("saves.cloudInSync")}
                       </div>
                       {cloudMismatchSummary ? (
                         <div className="cloud-core__summary">
                           {cloudMismatchSummary}
                         </div>
                       ) : null}
                       {cloudStatus.hasMismatch ? (
                         <div className="cloud-core__review">
                           <button
                             className="button button--ghost button--sm"
                             type="button"
                             onClick={() => setCloudDiffOpen(true)}
                           >
                             {t("saves.cloudReviewDiff")}
                           </button>
                         </div>
                       ) : null}
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
          </ElectricBorder>
          
          {/* ── 2. Vanilla Realm (Left) ── */}
          <div className={`saves-sync-bar saves-sync-bar--grid saves-live-block saves-live-block--delay-1${contentVisible ? " saves-live-block--visible" : ""}`}>
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

          <section className={`saves-section saves-section--vanilla saves-live-block saves-live-block--delay-2${contentVisible ? " saves-live-block--visible" : ""}`}>
            <div className="saves-section__header">
              <h2>{t("saves.vanillaTitle")}</h2>
              <div className="saves-section__actions">
                <button className="button button--secondary button--sm" onClick={() => openTransfer("vanilla", "modded")} type="button">
                  {t("saves.copyToModded")} &rarr;
                </button>
              </div>
            </div>
            <div className="saves-grid">
              {loaded && vanillaSlots.length === 0 ? (
                <article className="activity-item"><strong>{t("saves.noVanilla")}</strong><span>{t("saves.noVanillaHelp")}</span></article>
              ) : vanillaSlots.map(renderCard)}
            </div>
          </section>

          {/* ── 3. Modded Realm (Right) ── */}
          <section className={`saves-section saves-section--modded saves-live-block saves-live-block--delay-3${contentVisible ? " saves-live-block--visible" : ""}`}>
            <div className="saves-section__header">
              <h2>{t("saves.moddedTitle")}</h2>
              <div className="saves-section__actions">
                <button className="button button--secondary button--sm" onClick={() => openTransfer("modded", "vanilla")} type="button">
                  &larr; {t("saves.copyToVanilla")}
                </button>
              </div>
            </div>
            <div className="saves-grid">
              {loaded && moddedSlots.length === 0 ? (
                <article className="activity-item"><strong>{t("saves.noModded")}</strong><span>{t("saves.noModdedHelp")}</span></article>
              ) : moddedSlots.map(renderCard)}
            </div>
          </section>
            </>
          )}
        </div>
      </div>

      {/* ── Visual Time Fragment Backup ────────────────── */}
      <section className="panel profile-panel" style={{ marginTop: "32px", border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', background: 'linear-gradient(to bottom, color-mix(in srgb, var(--bg-panel-soft) 80%, transparent), transparent)' }}>
        <div className="panel__header">
          <h2>{t("saves.timeFragments")}</h2>
          {loaded ? (
            <span className="panel__meta">{backups.length}</span>
          ) : (
            <span className="panel__meta skeleton-text saves-skeleton-meta" aria-hidden="true" />
          )}
        </div>
        <div className={`backup-timeline${loaded ? ` saves-live-block saves-live-block--delay-4${contentVisible ? " saves-live-block--visible" : ""}` : ""}`}>
          {!loaded ? (
            <div className="activity-item saves-backup-skeleton" aria-hidden="true">
              <span className="skeleton-text saves-skeleton-line saves-skeleton-line--md" />
              <span className="skeleton-text saves-skeleton-line saves-skeleton-line--lg" />
            </div>
          ) : backups.length === 0 ? (
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

      {toast?.tone === "error" && (
        <div className="saves-toast-anchor" role="status" aria-live="polite">
          <div className={`saves-toast saves-toast--error${toast.visible ? " saves-toast--visible" : ""}`}>
            <AlertCircle size={14} />
            <span>{toast.text}</span>
          </div>
        </div>
      )}

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

      <ConfirmDialog
        open={steamCloudRiskAction !== null}
        title={t("saves.cloudSteamRunningTitle")}
        description={t("saves.cloudSteamRunningBody")}
        cancelLabel={t("common.cancel")}
        confirmLabel={t("saves.cloudSteamRunningContinue")}
        onCancel={() => {
          setSteamCloudRiskAction(null);
        }}
        onConfirm={() => {
          const action = steamCloudRiskAction;
          setSteamCloudRiskAction(null);
          if (action) {
            void handleCloudAction(action, true);
          }
        }}
      >
        <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>
          {t("saves.cloudSteamRunningHint")}
        </div>
      </ConfirmDialog>

      <CloudDiffWorkbenchDialog
        open={cloudDiffOpen}
        cloudStatus={cloudStatus}
        onClose={() => setCloudDiffOpen(false)}
        onStatusChanged={reload}
      />
    </section>
  );
}
