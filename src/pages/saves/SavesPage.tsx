import { useEffect, useMemo, useState } from "react";
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
  type SaveBackupEntry,
  type SaveKind,
  type SaveSlot,
  type SaveSlotRef,
  type SaveTransferPreview,
} from "../../lib/desktop";
import { DatabaseBackup, ArchiveRestore, Trash2, FolderOpen } from "lucide-react";

function slotRef(slot: SaveSlot): SaveSlotRef {
  return {
    steamUserId: slot.steamUserId,
    kind: slot.kind,
    slotIndex: slot.slotIndex,
  };
}

function formatTime(value: string | null, emptyText: string) {
  if (!value) {
    return emptyText;
  }

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

export function SavesPage() {
  const { t } = useI18n();
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const [backups, setBackups] = useState<SaveBackupEntry[]>([]);
  const [status, setStatus] = useState(t("saves.ready"));
  const [selectedSource, setSelectedSource] = useState<SaveSlot | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<SaveSlot | null>(null);
  const [transferPreview, setTransferPreview] = useState<SaveTransferPreview | null>(null);
  const [pendingRestore, setPendingRestore] = useState<SaveBackupEntry | null>(null);

  async function reload() {
    const [slotItems, backupItems] = await Promise.all([listSaveSlots(), listSaveBackups()]);
    setSlots(slotItems);
    setBackups(backupItems);
  }

  useEffect(() => {
    void reload();
  }, []);

  const vanillaSlots = useMemo(() => slots.filter((slot) => slot.kind === "vanilla"), [slots]);
  const moddedSlots = useMemo(() => slots.filter((slot) => slot.kind === "modded"), [slots]);

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

  async function prepareTransfer(sourceKind: SaveKind, targetKind: SaveKind) {
    const source = slots.find((slot) => slot.kind === sourceKind && slot.hasData) ?? null;
    const target =
      slots.find((slot) => slot.kind === targetKind && slot.slotIndex === source?.slotIndex) ??
      slots.find((slot) => slot.kind === targetKind) ??
      null;

    if (!source || !target) {
      setStatus(t("saves.transferMissing"));
      return;
    }

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
    if (!selectedSource || !selectedTarget) {
      return;
    }

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
    if (!pendingRestore) {
      return;
    }

    try {
      await restoreSaveBackup(pendingRestore.id);
      setPendingRestore(null);
      setStatus(t("saves.restoreDone"));
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saves.restoreFailed"));
    }
  }

  return (
    <section className="page">
      <PageHeader description={t("saves.description")} title={t("saves.title")} />

      <div className="status-line">{status}</div>

      <div className="saves-layout">
        <section className="saves-section saves-section--vanilla">
          <div className="saves-section__header">
            <h2>{t("saves.vanillaTitle")}</h2>
            <button
              className="button button--secondary button--sm"
              onClick={() => void prepareTransfer("vanilla", "modded")}
              type="button"
            >
              {t("saves.copyToModded")} &rarr;
            </button>
          </div>
          <div className="saves-grid">
            {vanillaSlots.length === 0 ? (
              <article className="activity-item">
                <strong>{t("saves.noVanilla")}</strong>
                <span>{t("saves.noVanillaHelp")}</span>
              </article>
            ) : (
              vanillaSlots.map((slot) => (
                <article className="save-card save-card--vanilla" key={`vanilla-${slot.steamUserId}-${slot.slotIndex}`}>
                  <div className="save-card__top">
                    <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>{slotLabel(slot)}</strong>
                  </div>
                  <div className="save-card__mid">
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{formatTime(slot.lastModifiedAt, t("saves.noModified"))}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>{t("saves.files", { count: slot.fileCount })}</span>
                  </div>
                  <div className="save-card__bottom">
                    <button
                      className="icon-button"
                      disabled={!slot.hasData}
                      onClick={() => void handleManualBackup(slot)}
                      type="button"
                      title={t("saves.backup")}
                    >
                      <DatabaseBackup size={16} />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="saves-section saves-section--modded">
          <div className="saves-section__header">
            <h2 style={{ color: "var(--accent)" }}>{t("saves.moddedTitle")}</h2>
            <button
              className="button button--secondary button--sm"
              onClick={() => void prepareTransfer("modded", "vanilla")}
              type="button"
            >
              &larr; {t("saves.copyToVanilla")}
            </button>
          </div>
          <div className="saves-grid">
            {moddedSlots.length === 0 ? (
              <article className="activity-item">
                <strong>{t("saves.noModded")}</strong>
                <span>{t("saves.noModdedHelp")}</span>
              </article>
            ) : (
              moddedSlots.map((slot) => (
                <article className="save-card save-card--modded" key={`modded-${slot.steamUserId}-${slot.slotIndex}`}>
                  <div className="save-card__top">
                    <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>{slotLabel(slot)}</strong>
                  </div>
                  <div className="save-card__mid">
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{formatTime(slot.lastModifiedAt, t("saves.noModified"))}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>{t("saves.files", { count: slot.fileCount })}</span>
                  </div>
                  <div className="save-card__bottom">
                    <button
                      className="icon-button"
                      disabled={!slot.hasData}
                      onClick={() => void handleManualBackup(slot)}
                      type="button"
                      title={t("saves.backup")}
                    >
                      <DatabaseBackup size={16} />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="panel profile-panel" style={{ marginTop: '16px' }}>
        <div className="panel__header">
          <h2>{t("saves.backups")}</h2>
          <span className="panel__meta">{backups.length}</span>
        </div>
        <div className="activity-list">
          {backups.length === 0 ? (
            <div className="activity-item">
              <strong>{t("saves.noBackups")}</strong>
              <span>{t("saves.noBackupsHelp")}</span>
            </div>
          ) : (
            backups.map((backup) => (
              <article className="activity-item" key={backup.id}>
                <div className="activity-item__head">
                  <strong>{backupLabel(backup)}</strong>
                  <span>{formatTime(backup.createdAt, t("saves.noModified"))}</span>
                </div>
                <div className="activity-item__body" style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  <div style={{ wordBreak: 'break-all' }}>{backup.backupPath}</div>
                  <div style={{ marginTop: '4px', fontStyle: 'italic' }}>{backup.reason}</div>
                </div>
                <div className="action-row" style={{ marginTop: '16px' }}>
                  <button
                    className="icon-button"
                    onClick={() => void openPathInExplorer(backup.backupPath)}
                    title={t("saves.openFolder")}
                    type="button"
                  >
                    <FolderOpen size={16} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => setPendingRestore(backup)}
                    title={t("saves.restore")}
                    type="button"
                  >
                    <ArchiveRestore size={16} />
                  </button>
                  <button
                    className="icon-button icon-button--danger"
                    onClick={() => void handleDeleteBackup(backup.id)}
                    title={t("saves.delete")}
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("common.confirm")}
        description={transferPreview?.summary}
        onCancel={() => setTransferPreview(null)}
        onConfirm={() => void confirmTransfer()}
        open={transferPreview !== null}
        title={t("saves.confirmTransfer")}
      >
        <div className="preview-list">
          {selectedSource ? (
            <article className="preview-item">
              <strong>
                {t("saves.source")} - {selectedSource.kind === "vanilla" ? t("saves.vanilla") : t("saves.modded")}
              </strong>
              <span>{selectedSource.path}</span>
            </article>
          ) : null}
          {selectedTarget ? (
            <article className="preview-item">
              <strong>
                {t("saves.target")} - {selectedTarget.kind === "vanilla" ? t("saves.vanilla") : t("saves.modded")}
              </strong>
              <span>{selectedTarget.path}</span>
            </article>
          ) : null}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("common.confirm")}
        description={pendingRestore ? backupLabel(pendingRestore) : undefined}
        onCancel={() => setPendingRestore(null)}
        onConfirm={() => void confirmRestore()}
        open={pendingRestore !== null}
        title={t("saves.confirmRestore")}
        tone="danger"
      />
    </section>
  );
}
