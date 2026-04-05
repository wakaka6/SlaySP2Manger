import { createPortal } from "react-dom";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeftCircle,
  ArrowRightCircle,
  Cloud,
  Eye,
  EyeOff,
  FileWarning,
  FolderOpen,
  HardDrive,
  PencilLine,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import {
  copyCloudSaveDiffSide,
  getCloudSaveDiffDetail,
  listCloudSaveDiffEntries,
  openPathInExplorer,
  saveCloudSaveDiffContent,
  type CloudSaveDiffDetailDto,
  type CloudSaveDiffEntryDto,
  type CloudSaveDiffKind,
  type CloudSaveDiffSide,
  type CloudSaveStatusDto,
} from "../../lib/desktop";

type CloudDiffWorkbenchDialogProps = {
  open: boolean;
  cloudStatus: CloudSaveStatusDto | null;
  onClose: () => void;
  onStatusChanged: () => Promise<void>;
};

type DiffToken = {
  type: "equal" | "delete" | "insert";
  lines: string[];
};

type DeltaRow =
  | {
      type: "fold";
      unchangedCount: number;
    }
  | {
      type: "line";
      leftNumber: number | null;
      rightNumber: number | null;
      leftText: string;
      rightText: string;
      leftState: "context" | "delete" | "empty";
      rightState: "context" | "insert" | "empty";
    };

function isContextRow(row: DeltaRow | undefined): row is Extract<DeltaRow, { type: "line" }> {
  return !!row && row.type === "line" && row.leftState === "context" && row.rightState === "context";
}

function formatBytes(value: number | null) {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function shortSha(value: string | null) {
  if (!value) return "—";
  return value.slice(0, 10);
}

function formatTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isBackupPath(relativePath: string) {
  return relativePath.endsWith(".backup");
}

function fileNameOf(relativePath: string) {
  const parts = relativePath.split("/");
  return parts[parts.length - 1] || relativePath;
}

function parentPathOf(relativePath: string) {
  const parts = relativePath.split("/");
  return parts.slice(0, -1).join("/");
}

function kindRank(kind: CloudSaveDiffKind) {
  switch (kind) {
    case "different":
      return 0;
    case "local_only":
      return 1;
    case "cloud_only":
      return 2;
    default:
      return 3;
  }
}

function formatWorkbenchError(
  reason: unknown,
  t: (key: any, vars?: Record<string, string | number>) => string,
) {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message.startsWith("error.") ? t(message as any) : message;
}

function computeLcsTokens(leftLines: string[], rightLines: string[]) {
  const height = leftLines.length + 1;
  const width = rightLines.length + 1;
  const matrix = Array.from({ length: height }, () => new Uint16Array(width));

  for (let i = leftLines.length - 1; i >= 0; i -= 1) {
    for (let j = rightLines.length - 1; j >= 0; j -= 1) {
      matrix[i][j] =
        leftLines[i] === rightLines[j]
          ? (matrix[i + 1][j + 1] + 1)
          : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;

  const pushLine = (type: DiffToken["type"], line: string) => {
    const last = tokens[tokens.length - 1];
    if (last?.type === type) {
      last.lines.push(line);
      return;
    }
    tokens.push({ type, lines: [line] });
  };

  while (i < leftLines.length && j < rightLines.length) {
    if (leftLines[i] === rightLines[j]) {
      pushLine("equal", leftLines[i]);
      i += 1;
      j += 1;
      continue;
    }

    if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      pushLine("delete", leftLines[i]);
      i += 1;
    } else {
      pushLine("insert", rightLines[j]);
      j += 1;
    }
  }

  while (i < leftLines.length) {
    pushLine("delete", leftLines[i]);
    i += 1;
  }

  while (j < rightLines.length) {
    pushLine("insert", rightLines[j]);
    j += 1;
  }

  return tokens;
}

function computeLookaheadTokens(leftLines: string[], rightLines: string[]) {
  const tokens: DiffToken[] = [];
  const lookahead = 8;
  let leftIndex = 0;
  let rightIndex = 0;

  const pushLine = (type: DiffToken["type"], line: string) => {
    const last = tokens[tokens.length - 1];
    if (last?.type === type) {
      last.lines.push(line);
      return;
    }
    tokens.push({ type, lines: [line] });
  };

  while (leftIndex < leftLines.length || rightIndex < rightLines.length) {
    const leftLine = leftLines[leftIndex];
    const rightLine = rightLines[rightIndex];

    if (leftIndex < leftLines.length && rightIndex < rightLines.length && leftLine === rightLine) {
      pushLine("equal", leftLine);
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    const leftMatchOffset =
      rightIndex < rightLines.length && leftIndex < leftLines.length
        ? rightLines
            .slice(rightIndex + 1, rightIndex + 1 + lookahead)
            .findIndex((line) => line === leftLine)
        : -1;
    const rightMatchOffset =
      leftIndex < leftLines.length && rightIndex < rightLines.length
        ? leftLines
            .slice(leftIndex + 1, leftIndex + 1 + lookahead)
            .findIndex((line) => line === rightLine)
        : -1;

    if (leftIndex >= leftLines.length) {
      pushLine("insert", rightLine ?? "");
      rightIndex += 1;
    } else if (rightIndex >= rightLines.length) {
      pushLine("delete", leftLine ?? "");
      leftIndex += 1;
    } else if (leftMatchOffset !== -1 && (rightMatchOffset === -1 || leftMatchOffset <= rightMatchOffset)) {
      pushLine("insert", rightLine);
      rightIndex += 1;
    } else if (rightMatchOffset !== -1) {
      pushLine("delete", leftLine);
      leftIndex += 1;
    } else {
      pushLine("delete", leftLine);
      pushLine("insert", rightLine);
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return tokens;
}

function buildDeltaRows(leftText: string, rightText: string) {
  const leftLines = leftText.split(/\r?\n/);
  const rightLines = rightText.split(/\r?\n/);
  const product = leftLines.length * rightLines.length;
  const tokens =
    product <= 350_000
      ? computeLcsTokens(leftLines, rightLines)
      : computeLookaheadTokens(leftLines, rightLines);

  const rows: DeltaRow[] = [];
  let leftNumber = 1;
  let rightNumber = 1;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === "equal") {
      for (const line of token.lines) {
        rows.push({
          type: "line",
          leftNumber,
          rightNumber,
          leftText: line,
          rightText: line,
          leftState: "context",
          rightState: "context",
        });
        leftNumber += 1;
        rightNumber += 1;
      }
      continue;
    }

    if (token.type === "delete") {
      const next = tokens[index + 1];
      const pairedInsert = next?.type === "insert" ? next.lines : [];
      const maxLength = Math.max(token.lines.length, pairedInsert.length);

      for (let rowIndex = 0; rowIndex < maxLength; rowIndex += 1) {
        const leftLine = token.lines[rowIndex];
        const rightLine = pairedInsert[rowIndex];
        rows.push({
          type: "line",
          leftNumber: leftLine !== undefined ? leftNumber : null,
          rightNumber: rightLine !== undefined ? rightNumber : null,
          leftText: leftLine ?? "",
          rightText: rightLine ?? "",
          leftState: leftLine !== undefined ? "delete" : "empty",
          rightState: rightLine !== undefined ? "insert" : "empty",
        });
        if (leftLine !== undefined) leftNumber += 1;
        if (rightLine !== undefined) rightNumber += 1;
      }

      if (pairedInsert.length > 0) {
        index += 1;
      }
      continue;
    }

    for (const line of token.lines) {
      rows.push({
        type: "line",
        leftNumber: null,
        rightNumber,
        leftText: "",
        rightText: line,
        leftState: "empty",
        rightState: "insert",
      });
      rightNumber += 1;
    }
  }

  return collapseEqualRows(rows);
}

function collapseEqualRows(rows: DeltaRow[]) {
  const collapsed: DeltaRow[] = [];

  for (let index = 0; index < rows.length; ) {
    const current = rows[index];
    if (!isContextRow(current)) {
      collapsed.push(current);
      index += 1;
      continue;
    }

    let end = index;
    while (end < rows.length && isContextRow(rows[end])) {
      end += 1;
    }

    const run = rows.slice(index, end);
    const hasPreviousChange = index > 0;
    const hasNextChange = end < rows.length;

    if (run.length > 8 && hasPreviousChange && hasNextChange) {
      collapsed.push(...run.slice(0, 2));
      collapsed.push({
        type: "fold",
        unchangedCount: run.length - 4,
      });
      collapsed.push(...run.slice(-2));
    } else {
      collapsed.push(...run);
    }

    index = end;
  }

  return collapsed;
}

export function CloudDiffWorkbenchDialog({
  open,
  cloudStatus,
  onClose,
  onStatusChanged,
}: CloudDiffWorkbenchDialogProps) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<CloudSaveDiffEntryDto[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [detail, setDetail] = useState<CloudSaveDiffDetailDto | null>(null);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busyAction, setBusyAction] = useState<"refresh" | "copy" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showBackupFiles, setShowBackupFiles] = useState(false);
  const [editorTarget, setEditorTarget] = useState<CloudSaveDiffSide | null>(null);
  const [draft, setDraft] = useState("");
  const deferredDraft = useDeferredValue(draft);

  const visibleEntries = useMemo(
    () => entries.filter((entry) => showBackupFiles || !isBackupPath(entry.relativePath)),
    [entries, showBackupFiles],
  );

  const hiddenBackupCount = useMemo(
    () => entries.filter((entry) => isBackupPath(entry.relativePath)).length,
    [entries],
  );

  const groupedEntries = useMemo(() => {
    const groups: Record<CloudSaveDiffKind, CloudSaveDiffEntryDto[]> = {
      in_sync: [],
      different: [],
      local_only: [],
      cloud_only: [],
    };

    for (const entry of visibleEntries) {
      groups[entry.kind].push(entry);
    }

    return groups;
  }, [visibleEntries]);

  const selectedEntry =
    visibleEntries.find((entry) => entry.relativePath === selectedPath) ?? null;

  const reviewSupported = useMemo(() => {
    if (!detail) return false;
    return (detail.local.isText || !detail.local.exists) && (detail.cloud.isText || !detail.cloud.exists);
  }, [detail]);

  const reviewRows = useMemo(() => {
    if (!detail || !reviewSupported || editorTarget) return [];
    return buildDeltaRows(detail.local.textContent ?? "", detail.cloud.textContent ?? "");
  }, [detail, editorTarget, reviewSupported]);

  const livePreviewRows = useMemo(() => {
    if (!detail || !editorTarget || !reviewSupported) return [];
    return buildDeltaRows(
      editorTarget === "local" ? deferredDraft : detail.local.textContent ?? "",
      editorTarget === "cloud" ? deferredDraft : detail.cloud.textContent ?? "",
    );
  }, [deferredDraft, detail, editorTarget, reviewSupported]);

  const currentTargetSide = editorTarget ? detail?.[editorTarget] : null;
  const currentTargetContent = currentTargetSide?.textContent ?? "";
  const isDirty = editorTarget !== null && draft !== currentTargetContent;

  useEffect(() => {
    if (!open) {
      setEditorTarget(null);
      setDraft("");
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (editorTarget) {
          setEditorTarget(null);
          setDraft("");
          return;
        }
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorTarget, onClose, open]);

  useEffect(() => {
    if (!open) return;
    let active = true;

    const load = async () => {
      setBusyAction("refresh");
      setLoadingEntries(true);
      setError(null);
      setNotice(null);
      try {
        const items = await listCloudSaveDiffEntries();
        if (!active) return;
        const nextItems = [...items].sort((left, right) =>
          kindRank(left.kind) - kindRank(right.kind) || left.relativePath.localeCompare(right.relativePath),
        );
        setEntries(nextItems);
        startTransition(() => {
          setSelectedPath((current) => {
            if (current && nextItems.some((entry) => entry.relativePath === current)) return current;
            return nextItems[0]?.relativePath ?? null;
          });
        });
      } catch (reason) {
        if (!active) return;
        setError(formatWorkbenchError(reason, t));
      } finally {
        if (active) {
          setBusyAction(null);
          setLoadingEntries(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (selectedPath && !visibleEntries.some((entry) => entry.relativePath === selectedPath)) {
      startTransition(() => {
        setSelectedPath(visibleEntries[0]?.relativePath ?? null);
      });
    }
  }, [open, selectedPath, visibleEntries]);

  useEffect(() => {
    if (!open || !selectedPath) {
      setDetail(null);
      return;
    }

    let active = true;
    setLoadingDetail(true);
    setError(null);

    getCloudSaveDiffDetail(selectedPath)
      .then((nextDetail) => {
        if (!active) return;
        setDetail(nextDetail);
      })
      .catch((reason) => {
        if (!active) return;
        setError(formatWorkbenchError(reason, t));
      })
      .finally(() => {
        if (active) {
          setLoadingDetail(false);
        }
      });

    setEditorTarget(null);
    setDraft("");
    return () => {
      active = false;
    };
  }, [open, selectedPath]);

  async function refreshWorkbench(preferredPath?: string | null) {
    setBusyAction("refresh");
    setError(null);
    try {
      const [items] = await Promise.all([
        listCloudSaveDiffEntries(),
        onStatusChanged(),
      ]);
      const nextItems = [...items].sort((left, right) =>
        kindRank(left.kind) - kindRank(right.kind) || left.relativePath.localeCompare(right.relativePath),
      );
      setEntries(nextItems);
      startTransition(() => {
        if (preferredPath && nextItems.some((entry) => entry.relativePath === preferredPath)) {
          setSelectedPath(preferredPath);
          return;
        }
        setSelectedPath(nextItems[0]?.relativePath ?? null);
      });
    } catch (reason) {
      setError(formatWorkbenchError(reason, t));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCopy(source: CloudSaveDiffSide, target: CloudSaveDiffSide) {
    if (!selectedPath) return;
    setBusyAction("copy");
    setError(null);
    try {
      await copyCloudSaveDiffSide(selectedPath, source, target);
      setEditorTarget(null);
      setDraft("");
      await refreshWorkbench(selectedPath);
    } catch (reason) {
      setError(formatWorkbenchError(reason, t));
      setBusyAction(null);
    }
  }

  async function handleSave() {
    if (!selectedPath || !editorTarget) return;
    setBusyAction("save");
    setError(null);
    try {
      await saveCloudSaveDiffContent(selectedPath, editorTarget, draft);
      setEditorTarget(null);
      setDraft("");
      await refreshWorkbench(selectedPath);
    } catch (reason) {
      setError(formatWorkbenchError(reason, t));
      setBusyAction(null);
    }
  }

  function startEditing(target: CloudSaveDiffSide) {
    if (!detail) return;
    const targetSide = detail[target];
    if (targetSide.exists && !targetSide.isText) return;
    setEditorTarget(target);
    setDraft(targetSide.textContent ?? "");
  }

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <div className="cloud-diff-overlay" role="presentation">
        <div className="cloud-diff-dialog" aria-modal="true" role="dialog" aria-label={t("saves.cloudDiffWorkbenchTitle")}>
          <div className="cloud-diff-shell">
          <header className="cloud-diff-header">
            <div className="cloud-diff-header__copy">
              <div className="cloud-diff-header__eyebrow">
                <Cloud size={14} />
                {t("saves.cloudDiffWorkbenchTitle")}
              </div>
              <h2>{t("saves.cloudMismatch")}</h2>
              <p>{t("saves.cloudDiffWorkbenchBody")}</p>
            </div>
            <div className="cloud-diff-header__actions">
              <div className="cloud-diff-header__stats">
                <span className="cloud-diff-pill cloud-diff-pill--different">
                  {t("saves.cloudDiffDifferent")}
                  <strong>{cloudStatus?.differentCount ?? groupedEntries.different.length}</strong>
                </span>
                <span className="cloud-diff-pill cloud-diff-pill--local">
                  {t("saves.cloudDiffLocalOnly")}
                  <strong>{cloudStatus?.localOnlyCount ?? groupedEntries.local_only.length}</strong>
                </span>
                <span className="cloud-diff-pill cloud-diff-pill--cloud">
                  {t("saves.cloudDiffCloudOnly")}
                  <strong>{cloudStatus?.cloudOnlyCount ?? groupedEntries.cloud_only.length}</strong>
                </span>
              </div>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void refreshWorkbench(selectedPath)}
                disabled={busyAction === "refresh"}
              >
                <RefreshCw size={16} className={busyAction === "refresh" ? "spin-icon" : ""} />
                {t("saves.cloudDiffRefresh")}
              </button>
              <button className="icon-button" type="button" onClick={onClose} title={t("common.cancel")}>
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="cloud-diff-toolbar">
            <div className="cloud-diff-toolbar__actions">
              <button
                className="button button--ghost button--sm"
                type="button"
                onClick={() => setShowBackupFiles((current) => !current)}
              >
                {showBackupFiles ? <EyeOff size={14} /> : <Eye size={14} />}
                {showBackupFiles
                  ? t("saves.cloudDiffHideBackups")
                  : t("saves.cloudDiffShowBackups", { count: hiddenBackupCount })}
              </button>
            </div>
            <div className="cloud-diff-toolbar__note">
              {t("saves.cloudDiffNoiseNote")}
            </div>
          </div>

          <div className="cloud-diff-layout">
            <aside className="cloud-diff-sidebar">
              {loadingEntries ? (
                <div className="cloud-diff-empty">{t("saves.cloudScanning")}</div>
              ) : visibleEntries.length === 0 ? (
                <div className="cloud-diff-empty">{t("saves.cloudDiffNoItems")}</div>
              ) : (
                <>
                  {(["different", "local_only", "cloud_only"] as CloudSaveDiffKind[]).map((kind) => {
                    const items = groupedEntries[kind];
                    if (items.length === 0) return null;
                    return (
                      <section className="cloud-diff-sidebar__group" key={kind}>
                        <div className="cloud-diff-sidebar__group-head">
                          <span>{kindLabel(kind, t)}</span>
                          <strong>{items.length}</strong>
                        </div>
                        <div className="cloud-diff-sidebar__list">
                          {items.map((entry) => (
                            <button
                              key={entry.relativePath}
                              className={`cloud-diff-file ${selectedPath === entry.relativePath ? "cloud-diff-file--selected" : ""} ${isBackupPath(entry.relativePath) ? "cloud-diff-file--backup" : ""}`}
                              type="button"
                              onClick={() => {
                                startTransition(() => {
                                  setSelectedPath(entry.relativePath);
                                });
                              }}
                            >
                              <div className="cloud-diff-file__main">
                                <strong>{fileNameOf(entry.relativePath)}</strong>
                                <span>{parentPathOf(entry.relativePath) || "/"}</span>
                              </div>
                              <div className="cloud-diff-file__meta">
                                {entry.localExists ? <HardDrive size={13} /> : null}
                                {entry.cloudExists ? <Cloud size={13} /> : null}
                                {isBackupPath(entry.relativePath) ? (
                                  <span className="cloud-diff-file__tag">backup</span>
                                ) : null}
                              </div>
                            </button>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </>
              )}
            </aside>

            <main className="cloud-diff-main">
              {notice ? (
                <div className="cloud-diff-notice">
                  <span>{notice}</span>
                </div>
              ) : null}

              {error ? (
                <div className="cloud-diff-error">
                  <FileWarning size={16} />
                  <span>{error}</span>
                </div>
              ) : null}

              {!selectedEntry ? (
                <div className="cloud-diff-empty cloud-diff-empty--panel">
                  {t("saves.cloudDiffNoSelection")}
                </div>
              ) : loadingDetail || !detail ? (
                <div className="cloud-diff-empty cloud-diff-empty--panel">
                  {t("saves.cloudScanning")}
                </div>
              ) : (
                <>
                  <div className="cloud-diff-main__header">
                    <div className="cloud-diff-main__title">
                      <span className={`cloud-diff-kind cloud-diff-kind--${detail.kind.replace("_", "-")}`}>
                        {kindLabel(detail.kind, t)}
                      </span>
                      <h3>{detail.relativePath}</h3>
                    </div>
                    <div className="cloud-diff-main__actions">
                      {detail.local.exists ? (
                        <button
                          className="button button--ghost button--sm"
                          type="button"
                          disabled={busyAction === "copy"}
                          onClick={() => void handleCopy("local", "cloud")}
                        >
                          <ArrowRightCircle size={14} />
                          {t("saves.cloudDiffUseLocal")}
                        </button>
                      ) : null}
                      {detail.cloud.exists ? (
                        <button
                          className="button button--ghost button--sm"
                          type="button"
                          disabled={busyAction === "copy"}
                          onClick={() => void handleCopy("cloud", "local")}
                        >
                          <ArrowLeftCircle size={14} />
                          {t("saves.cloudDiffUseCloud")}
                        </button>
                      ) : null}
                      <button
                        className="button button--ghost button--sm"
                        type="button"
                        onClick={() => startEditing("local")}
                        disabled={detail.local.exists && !detail.local.isText}
                      >
                        <PencilLine size={14} />
                        {t("saves.cloudDiffEditLocal")}
                      </button>
                      <button
                        className="button button--ghost button--sm"
                        type="button"
                        onClick={() => startEditing("cloud")}
                        disabled={detail.cloud.exists && !detail.cloud.isText}
                      >
                        <PencilLine size={14} />
                        {t("saves.cloudDiffEditCloud")}
                      </button>
                    </div>
                  </div>

                  <div className="cloud-diff-sidecards">
                    <section className="cloud-diff-sidecard cloud-diff-sidecard--local">
                      <div className="cloud-diff-sidecard__head">
                        <span>
                          <HardDrive size={14} />
                          {t("saves.cloudDiffLocal")}
                        </span>
                        <button className="icon-button" type="button" onClick={() => void openPathInExplorer(detail.local.path)} title={t("saves.openFolder")}>
                          <FolderOpen size={15} />
                        </button>
                      </div>
                      <dl className="cloud-diff-sidecard__meta">
                        <div><dt>Size</dt><dd>{formatBytes(detail.local.size)}</dd></div>
                        <div><dt>SHA1</dt><dd>{shortSha(detail.local.sha)}</dd></div>
                        <div><dt>Time</dt><dd>{formatTime(detail.local.modifiedAt)}</dd></div>
                      </dl>
                    </section>

                    <section className="cloud-diff-sidecard cloud-diff-sidecard--cloud">
                      <div className="cloud-diff-sidecard__head">
                        <span>
                          <Cloud size={14} />
                          {t("saves.cloudDiffCloud")}
                        </span>
                        <button className="icon-button" type="button" onClick={() => void openPathInExplorer(detail.cloud.path)} title={t("saves.openFolder")}>
                          <FolderOpen size={15} />
                        </button>
                      </div>
                      <dl className="cloud-diff-sidecard__meta">
                        <div><dt>Size</dt><dd>{formatBytes(detail.cloud.size)}</dd></div>
                        <div><dt>SHA1</dt><dd>{shortSha(detail.cloud.sha)}</dd></div>
                        <div><dt>Time</dt><dd>{formatTime(detail.cloud.modifiedAt)}</dd></div>
                      </dl>
                    </section>
                  </div>

                  {editorTarget ? (
                    <section className="cloud-diff-editor">
                      <div className="cloud-diff-editor__top">
                        <div>
                          <strong>{t("saves.cloudDiffEditing", { side: editorTarget === "local" ? t("saves.cloudDiffLocal") : t("saves.cloudDiffCloud") })}</strong>
                          <p>{t("saves.cloudDiffEditingBody")}</p>
                        </div>
                        <div className="cloud-diff-editor__actions">
                          <button className="button button--ghost button--sm" type="button" onClick={() => { setEditorTarget(null); setDraft(""); }}>
                            {t("saves.cloudDiffCancelEdit")}
                          </button>
                          <button className="button button--primary button--sm" type="button" disabled={!isDirty || busyAction === "save"} onClick={() => void handleSave()}>
                            <Save size={14} />
                            {t("saves.cloudDiffSaveEdit")}
                          </button>
                        </div>
                      </div>
                      <textarea
                        className="cloud-diff-editor__textarea"
                        spellCheck={false}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                      />
                      <div className="cloud-diff-preview">
                        <div className="cloud-diff-preview__title">{t("saves.cloudReviewDiff")}</div>
                        <DeltaGrid rows={livePreviewRows} t={t} />
                      </div>
                    </section>
                  ) : reviewSupported ? (
                    <section className="cloud-diff-review">
                      <DeltaGrid rows={reviewRows} t={t} />
                    </section>
                  ) : (
                    <div className="cloud-diff-empty cloud-diff-empty--panel">
                      <FileWarning size={18} />
                      <div>
                        <strong>{t("saves.cloudDiffTextUnsupported")}</strong>
                        <p>{t("saves.cloudDiffTextUnsupportedBody")}</p>
                      </div>
                    </div>
                  )}

                  <div className="cloud-diff-footnote">
                    {t("saves.cloudDiffStickyNote")}
                  </div>
                </>
              )}
            </main>
          </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function kindLabel(kind: CloudSaveDiffKind, t: (key: any, vars?: Record<string, string | number>) => string) {
  switch (kind) {
    case "different":
      return t("saves.cloudDiffDifferent");
    case "local_only":
      return t("saves.cloudDiffLocalOnly");
    case "cloud_only":
      return t("saves.cloudDiffCloudOnly");
    default:
      return t("saves.cloudDiffInSync");
  }
}

function DeltaGrid({ rows, t }: { rows: DeltaRow[]; t: (key: any, vars?: Record<string, string | number>) => string }) {
  return (
    <div className="cloud-delta-grid">
      <div className="cloud-delta-grid__head">
        <span>{t("saves.cloudDiffLocal")}</span>
        <span>{t("saves.cloudDiffCloud")}</span>
      </div>
      <div className="cloud-delta-grid__body">
        {rows.map((row, index) =>
          row.type === "fold" ? (
            <div className="cloud-delta-row cloud-delta-row--fold" key={`fold-${index}`}>
              <div className="cloud-delta-fold">
                {t("saves.cloudDiffUnchangedFold", { count: row.unchangedCount })}
              </div>
            </div>
          ) : (
            <div className="cloud-delta-row" key={`line-${index}`}>
              <DeltaCell lineNumber={row.leftNumber} marker={row.leftState === "delete" ? "-" : " "} state={row.leftState} text={row.leftText} />
              <DeltaCell lineNumber={row.rightNumber} marker={row.rightState === "insert" ? "+" : " "} state={row.rightState} text={row.rightText} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function DeltaCell({
  lineNumber,
  marker,
  state,
  text,
}: {
  lineNumber: number | null;
  marker: string;
  state: "context" | "delete" | "insert" | "empty";
  text: string;
}) {
  return (
    <div className={`cloud-delta-cell cloud-delta-cell--${state}`}>
      <span className="cloud-delta-cell__line">{lineNumber ?? ""}</span>
      <span className="cloud-delta-cell__marker">{marker}</span>
      <pre className="cloud-delta-cell__text">{text || " "}</pre>
    </div>
  );
}
