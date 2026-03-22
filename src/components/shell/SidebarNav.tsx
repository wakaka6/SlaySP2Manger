import { ArrowDownToLine, CheckCircle, AlertTriangle, Loader2, X, Play, ChevronsLeft } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { launchGame } from "../../lib/desktop";
import appIcon from "../../assets/app-icon.png";
import { useDownloads } from "../../contexts/DownloadContext";
import type { ShellNavItem } from "./AppShell";

type SidebarNavProps = {
  items: ShellNavItem[];
  activePath: string;
  onNavigate: (path: string) => void;
  collapsed: boolean;
  onToggle: () => void;
};

export function SidebarNav(props: SidebarNavProps) {
  const { t } = useI18n();
  const { tasks, activeCount, dismissTask, clearFinished } = useDownloads();
  const hasAnyTasks = tasks.length > 0;

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
              {tasks.every((t) => t.status === "done" || t.status === "error") && (
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

        <button className="sidebar-nav__launch" type="button" onClick={() => void launchGame()}>
          <Play className="sidebar-nav__launch-icon" size={14} strokeWidth={2.4} />
          <span className="sidebar-nav__launch-text">{t("nav.launchGame")}</span>
        </button>
      </div>
    </aside>
  );
}
