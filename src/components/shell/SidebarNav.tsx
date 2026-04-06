import { ArrowDownToLine, CheckCircle, AlertTriangle, Loader2, X, Play, ChevronsLeft, Layers3, Check } from "lucide-react";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { useI18n } from "../../i18n/I18nProvider";
import {
  applyProfile,
  getCloudSaveStatus,
  launchGame,
  listProfiles,
  type CloudSaveStatusDto,
  type ModProfile,
} from "../../lib/desktop";
import appIcon from "../../assets/app-icon.png";
import { useDownloads } from "../../contexts/DownloadContext";
import { useUpdate } from "../../contexts/UpdateContext";
import type { ShellNavItem, ShellNavigateOptions } from "./AppShell";
import { useEffect, useRef, useState } from "react";

type SidebarNavProps = {
  items: ShellNavItem[];
  activePath: string;
  onNavigate: (path: string, options?: ShellNavigateOptions) => void;
  collapsed: boolean;
  compact: boolean;
  activeProfileName: string;
  appVersion: string;
  onToggle: () => void;
};

export function SidebarNav(props: SidebarNavProps) {
  const { t } = useI18n();
  const { tasks, activeCount, dismissTask, clearFinished } = useDownloads();
  const { phase: updatePhase, availableVersion } = useUpdate();
  const hasAnyTasks = tasks.length > 0;
  const hasActiveTasks = tasks.some((task) => task.status === "fetching_files" || task.status === "downloading" || task.status === "installing");
  const hasErroredTasks = tasks.some((task) => task.status === "error");
  const hasUpdate = updatePhase === "available";

  // Profile picker state
  const [profiles, setProfiles] = useState<ModProfile[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [launchChecking, setLaunchChecking] = useState(false);
  const [launchMismatch, setLaunchMismatch] = useState<CloudSaveStatusDto | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void listProfiles().then(setProfiles);
  }, [props.activeProfileName]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!profileOpen && !downloadOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
      if (downloadRef.current && !downloadRef.current.contains(target)) {
        setDownloadOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen, downloadOpen]);

  useEffect(() => {
    if (!hasAnyTasks) {
      setDownloadOpen(false);
    }
  }, [hasAnyTasks]);

  const handleSwitchProfile = async (profile: ModProfile) => {
    if (profile.name === props.activeProfileName || switching) return;
    setSwitching(true);
    try {
      await applyProfile(profile.id);
      window.dispatchEvent(new CustomEvent("slaymgr:bootstrap-changed"));
      window.dispatchEvent(new CustomEvent("slaymgr:mods-changed"));
    } catch (e) {
      console.error("Failed to apply profile:", e);
    } finally {
      setSwitching(false);
      setProfileOpen(false);
    }
  };

  const handleLaunch = async () => {
    if (launchChecking) return;

    setLaunchChecking(true);
    try {
      const cloudStatus = await getCloudSaveStatus();
      if (cloudStatus.isAvailable && cloudStatus.hasMismatch) {
        setLaunchMismatch(cloudStatus);
        return;
      }

      await launchGame();
    } catch (error) {
      console.error("Failed to check cloud save status before launch:", error);
      try {
        await launchGame();
      } catch (launchError) {
        console.error("Failed to launch the game:", launchError);
      }
    } finally {
      setLaunchChecking(false);
    }
  };

  const handleLaunchAnyway = async () => {
    if (launchChecking) return;

    setLaunchChecking(true);
    try {
      await launchGame();
      setLaunchMismatch(null);
    } catch (error) {
      console.error("Failed to launch the game:", error);
    } finally {
      setLaunchChecking(false);
    }
  };

  const launchMismatchSummary = launchMismatch
    ? t("saves.cloudMismatchSummary", {
        localOnly: launchMismatch.localOnlyCount,
        cloudOnly: launchMismatch.cloudOnlyCount,
        different: launchMismatch.differentCount,
      })
    : null;
  const compactDownloadCount = activeCount > 0 ? activeCount : tasks.length;
  const compactDownloadBadge = compactDownloadCount > 9 ? "9+" : String(compactDownloadCount);
  const compactDownloadTitle = hasActiveTasks
    ? `${t("download.title")} (${activeCount})`
    : hasErroredTasks
      ? `${t("download.title")} (${t("download.failed")})`
      : t("download.title");

  const renderDownloadQueue = (className?: string) => (
    <div className={className ? `sidebar-dl ${className}` : "sidebar-dl"}>
      <div className="sidebar-dl__header">
        <ArrowDownToLine size={13} />
        <span>{t("download.title")}{activeCount > 0 ? ` (${activeCount})` : ""}</span>
        {tasks.every((tk) => tk.status === "done" || tk.status === "error") && (
          <button className="sidebar-dl__clear" onClick={clearFinished} type="button">
            {t("download.clear")}
          </button>
        )}
      </div>
      <div className="sidebar-dl__list">
        {tasks.map((task) => (
          <div className={`sidebar-dl__item sidebar-dl__item--${task.status}`} key={task.modId}>
            <div className="sidebar-dl__item-icon">
              {(task.status === "fetching_files" || task.status === "downloading" || task.status === "installing") && (
                <Loader2 size={12} className="spin-icon" />
              )}
              {task.status === "done" && <CheckCircle size={12} />}
              {task.status === "error" && <AlertTriangle size={12} />}
            </div>
            <div className="sidebar-dl__item-info">
              <div className="sidebar-dl__item-name" title={task.modName}>{task.modName}</div>
              <div className="sidebar-dl__item-status">
                {task.status === "fetching_files" && t("download.fetchingFiles")}
                {task.status === "downloading" && t("download.downloading")}
                {task.status === "installing" && t("download.installing")}
                {task.status === "done" && t("download.done")}
                {task.status === "error" && (() => {
                  if (task.error === "ERROR_NO_FILES") return t("download.noFiles");
                  if (task.error === "ERROR_PREMIUM_REQUIRED") return t("download.premiumRequired");
                  return task.error?.slice(0, 40) ?? t("download.failed");
                })()}
              </div>
            </div>
            {(task.status === "done" || task.status === "error") && (
              <button className="sidebar-dl__item-dismiss" onClick={() => dismissTask(task.modId)} type="button">
                <X size={10} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <aside className={`sidebar-nav${props.collapsed ? " sidebar-nav--collapsed" : ""}`}>
      {/* Edge-mounted toggle — floats on the sidebar border */}
      {!props.compact ? (
        <button
          className="sidebar-nav__toggle"
          type="button"
          onClick={props.onToggle}
        >
          <ChevronsLeft size={14} />
        </button>
      ) : null}

      <div className="sidebar-nav__brand" data-tauri-drag-region>
        <span className="sidebar-nav__brand-mark">
          <img src={appIcon} alt="SlaySP2Manager" width={22} height={22} style={{ borderRadius: 4 }} />
        </span>
        <div className="sidebar-nav__brand-copy">
          <div className="sidebar-nav__title">
            SlaySP2<span>Manager</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav__items">
        {props.items.map((item) => {
          const active =
            item.path === "/"
              ? props.activePath === "/"
              : props.activePath.startsWith(item.path);
          const Icon = item.icon;

          return (
            <div className="sidebar-nav__group" key={item.path}>
              {item.section ? <div className="sidebar-nav__section-title">{item.section}</div> : null}
              <button
                className={`sidebar-nav__item${active ? " is-active" : ""}`}
                onClick={() => props.onNavigate(item.path)}
                type="button"
                title={props.collapsed ? item.label : undefined}
              >
                <div className="sidebar-nav__item-main">
                  <Icon className="sidebar-nav__item-icon" size={17} strokeWidth={1.8} />
                  <span className="sidebar-nav__item-label">{item.label}</span>
                </div>
                {item.badge ? <span className="sidebar-nav__badge">{item.badge}</span> : null}
              </button>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-nav__footer">
        {/* ── Download queue in sidebar ──────────────── */}
        {hasAnyTasks && (props.collapsed ? (
          <div className="sidebar-dl-compact" ref={downloadRef}>
            <button
              className={`sidebar-dl-compact__trigger${downloadOpen ? " is-open" : ""}${hasActiveTasks ? " is-busy" : ""}${hasErroredTasks ? " is-warning" : ""}`}
              type="button"
              onClick={() => {
                setProfileOpen(false);
                setDownloadOpen((v) => !v);
              }}
              title={compactDownloadTitle}
            >
              {hasActiveTasks ? (
                <Loader2 size={15} className="spin-icon" />
              ) : hasErroredTasks ? (
                <AlertTriangle size={15} />
              ) : (
                <ArrowDownToLine size={15} />
              )}
              <span className="sidebar-dl-compact__badge">{compactDownloadBadge}</span>
            </button>
            {downloadOpen ? (
              <div className="sidebar-dl-compact__panel">
                {renderDownloadQueue("sidebar-dl--flyout")}
              </div>
            ) : null}
          </div>
        ) : renderDownloadQueue())}

        {/* ── Profile picker ──────────────────────────── */}
        {profiles.length > 0 && (
          <div className="sidebar-profile" ref={profileRef}>
            <button
              className="sidebar-profile__trigger"
              type="button"
              onClick={() => {
                setDownloadOpen(false);
                setProfileOpen((v) => !v);
              }}
              title={props.collapsed ? `${t("nav.currentProfile")}: ${props.activeProfileName}` : undefined}
            >
              <Layers3 size={14} className="sidebar-profile__icon" />
              <span className="sidebar-profile__name">{props.activeProfileName || "—"}</span>
            </button>

            {profileOpen && (
              <div className="sidebar-profile__dropdown">
                <div className="sidebar-profile__dropdown-title">{t("nav.currentProfile")}</div>
                {profiles.map((p) => {
                  const isActive = p.name === props.activeProfileName;
                  return (
                    <button
                      className={`sidebar-profile__option ${isActive ? "sidebar-profile__option--active" : ""}`}
                      key={p.id}
                      onClick={() => void handleSwitchProfile(p)}
                      type="button"
                      disabled={switching}
                    >
                      <span className="sidebar-profile__option-name">{p.name}</span>
                      <span className="sidebar-profile__option-count">{p.modIds.length}</span>
                      {isActive && <Check size={14} className="sidebar-profile__option-check" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <button
          className="sidebar-nav__launch"
          type="button"
          onClick={() => void handleLaunch()}
          disabled={launchChecking}
          title={props.collapsed ? t("nav.launchGame") : undefined}
        >
          {launchChecking ? (
            <Loader2 className="sidebar-nav__launch-icon spin-icon" size={14} strokeWidth={2.4} />
          ) : (
            <Play className="sidebar-nav__launch-icon" size={14} strokeWidth={2.4} />
          )}
          <span className="sidebar-nav__launch-text">{t("nav.launchGame")}</span>
        </button>

        <button
          className={`sidebar-version${hasUpdate ? " sidebar-version--update" : ""}`}
          type="button"
          onClick={() => props.onNavigate("/settings")}
          title={
            hasUpdate
              ? `${t("updater.newVersion")} v${availableVersion}`
              : `v${props.appVersion}`
          }
        >
          <span className="sidebar-version__symbol" aria-hidden="true">v</span>
          <span className="sidebar-version__label">v{props.appVersion}</span>
          {hasUpdate && (
            <span className="sidebar-version__dot" />
          )}
        </button>
      </div>

      <ConfirmDialog
        open={launchMismatch !== null}
        title={t("saves.cloudLaunchMismatchTitle")}
        description={t("saves.cloudLaunchMismatchBody")}
        dismissLabel={t("saves.reviewInSaves")}
        cancelLabel={t("common.cancel")}
        confirmLabel={t("saves.launchAnyway")}
        onDismiss={() => {
          setLaunchMismatch(null);
          props.onNavigate("/saves", {
            state: {
              openCloudDiffWorkbench: true,
              source: "launch-mismatch-guard",
              requestId: Date.now(),
            },
          });
        }}
        onCancel={() => setLaunchMismatch(null)}
        onConfirm={() => void handleLaunchAnyway()}
      >
        {launchMismatch ? (
          <div style={{ display: "grid", gap: "10px" }}>
            {launchMismatchSummary ? (
              <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                {launchMismatchSummary}
              </div>
            ) : null}
            {launchMismatch.samplePaths.length > 0 ? (
              <div style={{ display: "grid", gap: "6px" }}>
                {launchMismatch.samplePaths.map((sample) => (
                  <code key={sample} style={{ fontSize: "12px", whiteSpace: "pre-wrap" }}>
                    {sample}
                  </code>
                ))}
              </div>
            ) : null}
            <div style={{ color: "var(--text-dim)", fontSize: "12px" }}>
              {t("saves.cloudReviewBeforeLaunch")}
            </div>
          </div>
        ) : null}
      </ConfirmDialog>
    </aside>
  );
}
