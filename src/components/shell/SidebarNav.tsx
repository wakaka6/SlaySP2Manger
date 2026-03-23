import { ArrowDownToLine, CheckCircle, AlertTriangle, Loader2, X, Play, ChevronsLeft, Layers3, Check } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { launchGame, listProfiles, applyProfile, type ModProfile } from "../../lib/desktop";
import appIcon from "../../assets/app-icon.png";
import { useDownloads } from "../../contexts/DownloadContext";
import { useUpdate } from "../../contexts/UpdateContext";
import type { ShellNavItem } from "./AppShell";
import { useEffect, useRef, useState } from "react";

type SidebarNavProps = {
  items: ShellNavItem[];
  activePath: string;
  onNavigate: (path: string) => void;
  collapsed: boolean;
  activeProfileName: string;
  appVersion: string;
  onToggle: () => void;
};

export function SidebarNav(props: SidebarNavProps) {
  const { t } = useI18n();
  const { tasks, activeCount, dismissTask, clearFinished } = useDownloads();
  const { phase: updatePhase, availableVersion } = useUpdate();
  const hasAnyTasks = tasks.length > 0;
  const hasUpdate = updatePhase === "available";

  // Profile picker state
  const [profiles, setProfiles] = useState<ModProfile[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void listProfiles().then(setProfiles);
  }, [props.activeProfileName]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

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

  return (
    <aside className={`sidebar-nav${props.collapsed ? " sidebar-nav--collapsed" : ""}`}>
      {/* Edge-mounted toggle — floats on the sidebar border */}
      <button
        className="sidebar-nav__toggle"
        type="button"
        onClick={props.onToggle}
      >
        <ChevronsLeft size={14} />
      </button>

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
        {hasAnyTasks && (
          <div className="sidebar-dl">
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
        )}

        {/* ── Profile picker ──────────────────────────── */}
        {profiles.length > 0 && (
          <div className="sidebar-profile" ref={profileRef}>
            <button
              className="sidebar-profile__trigger"
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
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

        <button className="sidebar-nav__launch" type="button" onClick={() => void launchGame()}>
          <Play className="sidebar-nav__launch-icon" size={14} strokeWidth={2.4} />
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
          <span className="sidebar-version__label">v{props.appVersion}</span>
          {hasUpdate && (
            <span className="sidebar-version__dot" />
          )}
        </button>
      </div>
    </aside>
  );
}
