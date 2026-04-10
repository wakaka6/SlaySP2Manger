import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/I18nProvider";
import {
  applyProfile,
  confirmImportPresetBundle,
  createProfile,
  deleteProfile,
  exportPresetBundle,
  getAppBootstrap,
  listDisabledMods,
  listInstalledMods,
  listProfiles,
  pickPresetBundle,
  previewPresetBundle,
  updateProfile,
  type InstalledMod,
  type ModProfile,
  type PresetBundlePreview,
} from "../../lib/desktop";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { Save, CheckCircle, Trash2, DatabaseZap, Plus, Layers, Zap, Package, Check, Share2, FolderDown } from "lucide-react";

type ProfileDraft = {
  id: string | null;
  name: string;
  description: string;
  modIds: string[];
  createdAt: string;
  updatedAt: string;
};

function toDraft(profile: ModProfile): ProfileDraft {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description ?? "",
    modIds: [...profile.modIds],
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function createEmptyDraft(): ProfileDraft {
  const now = new Date().toISOString();
  return {
    id: null,
    name: "",
    description: "",
    modIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

function mergeMods(enabledMods: InstalledMod[], disabledMods: InstalledMod[]) {
  const byId = new Map<string, InstalledMod>();

  for (const item of [...enabledMods, ...disabledMods]) {
    const key = item.id.toLowerCase();
    if (!byId.has(key)) {
      byId.set(key, item);
    }
  }

  return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export function ProfilesPage() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const multiplayerAffectedLabel = t("library.multiplayerAffected");
  const pageRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [profiles, setProfiles] = useState<ModProfile[]>([]);
  const [enabledMods, setEnabledMods] = useState<InstalledMod[]>([]);
  const [availableMods, setAvailableMods] = useState<InstalledMod[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(createEmptyDraft);
  const [isCreating, setIsCreating] = useState(false);
  const [activeProfileName, setActiveProfileName] = useState("No active profile");
  const [status, setStatus] = useState(t("profiles.loading"));
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const isBusyRef = useRef(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bundlePreview, setBundlePreview] = useState<PresetBundlePreview | null>(null);
  const [bundleConflictResolutions, setBundleConflictResolutions] = useState<Record<string, string>>({});
  const [bundleImporting, setBundleImporting] = useState(false);

  const reload = useCallback(async (nextSelectedId?: string | null) => {
    const [profileItems, enabledItems, disabledItems, bootstrap] = await Promise.all([
      listProfiles(),
      listInstalledMods(),
      listDisabledMods(),
      getAppBootstrap(),
    ]);

    setProfiles(profileItems);
    setEnabledMods(enabledItems);
    setAvailableMods(mergeMods(enabledItems, disabledItems));
    setActiveProfileName(bootstrap.activeProfileName);

    if (isCreating && nextSelectedId === undefined) {
      return;
    }

    const targetId =
      nextSelectedId !== undefined
        ? nextSelectedId
        : selectedProfileId && profileItems.some((item) => item.id === selectedProfileId)
          ? selectedProfileId
          : profileItems[0]?.id ?? null;

    if (!targetId) {
      setSelectedProfileId(null);
      setDraft(createEmptyDraft());
      setIsCreating(true);
      return;
    }

    const selected = profileItems.find((item) => item.id === targetId);
    if (selected) {
      setSelectedProfileId(selected.id);
      setDraft(toDraft(selected));
      setIsCreating(false);
    }
  }, [isCreating, selectedProfileId]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle bundle dropped via drag-and-drop (routed from AppShell)
  const handledBundleRef = useRef<string | null>(null);
  useEffect(() => {
    const state = location.state as { bundlePath?: string; bundlePreview?: PresetBundlePreview } | null;
    if (!state?.bundlePath || !state?.bundlePreview) return;
    if (handledBundleRef.current === state.bundlePath) return;
    handledBundleRef.current = state.bundlePath;

    // Clear the state so refreshing doesn't re-trigger
    navigate(location.pathname, { replace: true, state: null });

    const preview = state.bundlePreview;
    if (preview.conflictMods.length === 0) {
      // No conflicts → auto-import
      void (async () => {
        try {
          const result = await confirmImportPresetBundle(preview.tempDir, {});
          await reload(null);
          setStatus(
            t("profiles.bundleImportSuccess", {
              name: result.presetName,
              installed: result.installedCount,
              skipped: result.skippedCount,
            }),
          );
        } catch (error) {
          setStatus(error instanceof Error ? error.message : t("profiles.bundleImportFailed"));
        }
      })();
    } else {
      // Has conflicts → show dialog
      const defaults: Record<string, string> = {};
      for (const mod of preview.conflictMods) {
        defaults[mod.id] = "skip";
      }
      setBundleConflictResolutions(defaults);
      setBundlePreview(preview);
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("slaymgr:bootstrap-changed", handler);
    window.addEventListener("slaymgr:mods-changed", handler);
    return () => {
      window.removeEventListener("slaymgr:bootstrap-changed", handler);
      window.removeEventListener("slaymgr:mods-changed", handler);
    };
  }, [reload]);

  useEffect(() => {
    const pageElement = pageRef.current;
    const headerElement = headerRef.current;
    if (!pageElement || !headerElement) {
      return;
    }

    const updateStickyOffset = () => {
      const headerHeight = Math.ceil(headerElement.getBoundingClientRect().height);
      pageElement.style.setProperty("--profiles-sidebar-top", `${headerHeight + 12}px`);
    };

    updateStickyOffset();

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateStickyOffset) : null;
    observer?.observe(headerElement);
    window.addEventListener("resize", updateStickyOffset);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateStickyOffset);
      pageElement.style.removeProperty("--profiles-sidebar-top");
    };
  }, []);

  function handleSelect(profile: ModProfile) {
    setSelectedProfileId(profile.id);
    setDraft(toDraft(profile));
    setIsCreating(false);
    setStatus(t("profiles.selected", { name: profile.name }));
  }

  function beginCreate() {
    setSelectedProfileId(null);
    setDraft(createEmptyDraft());
    setIsCreating(true);
    setStatus(t("profiles.creating"));
  }

  function toggleMod(modId: string) {
    setDraft((current) => {
      const exists = current.modIds.some((item) => item.toLowerCase() === modId.toLowerCase());
      return {
        ...current,
        modIds: exists
          ? current.modIds.filter((item) => item.toLowerCase() !== modId.toLowerCase())
          : [...current.modIds, modId],
      };
    });
  }

  function fillFromCurrentEnabled() {
    setDraft((current) => ({
      ...current,
      modIds: enabledMods.map((item) => item.id),
    }));
    setStatus(t("profiles.synced"));
  }

  async function handleSave() {
    if (isBusyRef.current) return;
    const name = draft.name.trim();
    if (!name) {
      setStatus(t("profiles.nameRequired"));
      return;
    }

    isBusyRef.current = true;
    setBusyAction("save");
    try {
      if (isCreating || !draft.id) {
        const created = await createProfile(name, draft.description.trim() || null, draft.modIds);
        await reload(created.id);
        setStatus(t("profiles.created", { name: created.name }));
      } else {
        const updated = await updateProfile({
          id: draft.id,
          name,
          description: draft.description.trim() || null,
          modIds: draft.modIds,
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
        });
        await reload(updated.id);
        setStatus(t("profiles.saved", { name: updated.name }));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("profiles.saveFailed"));
    } finally {
      isBusyRef.current = false;
      setBusyAction(null);
    }
  }

  async function handleApply() {
    if (isBusyRef.current) return;
    if (!draft.id) {
      setStatus(t("profiles.applyNeedSave"));
      return;
    }

    isBusyRef.current = true;
    setBusyAction("apply");
    try {
      const result = await applyProfile(draft.id);
      await reload(result.profile.id);
      const summary = [
        result.enabledModIds.length > 0
          ? t("profiles.statusEnabled", { count: result.enabledModIds.length })
          : null,
        result.disabledModIds.length > 0
          ? t("profiles.statusDisabled", { count: result.disabledModIds.length })
          : null,
        result.missingModIds.length > 0
          ? t("profiles.statusMissing", { count: result.missingModIds.length })
          : null,
      ]
        .filter(Boolean)
        .join(", ");
      setStatus(t("profiles.applied", { name: result.profile.name, summary }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("profiles.applyFailed"));
    } finally {
      isBusyRef.current = false;
      setBusyAction(null);
    }
  }

  function handleDelete() {
    if (isBusyRef.current) return;
    if (!draft.id) {
      beginCreate();
      return;
    }
    setShowDeleteConfirm(true);
  }

  async function confirmDelete() {
    if (!draft.id) return;
    setShowDeleteConfirm(false);
    isBusyRef.current = true;
    setBusyAction("delete");
    try {
      const removed = await deleteProfile(draft.id);
      const nextProfile = profiles.find((item) => item.id !== removed.id) ?? null;
      await reload(nextProfile?.id ?? null);
      setStatus(t("profiles.deleted", { name: removed.name }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("profiles.deleteFailed"));
    } finally {
      isBusyRef.current = false;
      setBusyAction(null);
    }
  }

  async function handleShareBundle() {
    if (isBusyRef.current) return;
    if (!draft.id) {
      setStatus(t("profiles.exportNeedSave"));
      return;
    }

    isBusyRef.current = true;
    setBusyAction("shareBundle");
    try {
      const path = await exportPresetBundle(draft.id);
      setStatus(path ? t("profiles.bundleExported", { path }) : t("profiles.exportCancelled"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("profiles.exportFailed"));
    } finally {
      isBusyRef.current = false;
      setBusyAction(null);
    }
  }

  async function handleImportBundle() {
    if (isBusyRef.current) return;

    isBusyRef.current = true;
    setBusyAction("importBundle");
    try {
      const filePath = await pickPresetBundle();
      if (!filePath) {
        setStatus(t("profiles.exportCancelled"));
        return;
      }

      const preview = await previewPresetBundle(filePath);
      if (!preview.hasManifest) {
        // No .spm manifest — not a preset bundle, just a regular mod archive
        setStatus(t("profiles.bundleNotPreset"));
        return;
      }

      if (preview.conflictMods.length === 0) {
        // No conflicts → auto-import
        const result = await confirmImportPresetBundle(preview.tempDir, {});
        await reload(null);
        setStatus(
          t("profiles.bundleImportSuccess", {
            name: result.presetName,
            installed: result.installedCount,
            skipped: result.skippedCount,
          }),
        );
      } else {
        // Has conflicts → show dialog
        const defaults: Record<string, string> = {};
        for (const mod of preview.conflictMods) {
          defaults[mod.id] = "skip";
        }
        setBundleConflictResolutions(defaults);
        setBundlePreview(preview);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("profiles.bundleImportFailed"));
    } finally {
      isBusyRef.current = false;
      setBusyAction(null);
    }
  }

  async function handleConfirmBundleImport() {
    if (!bundlePreview) return;
    setBundleImporting(true);
    try {
      const result = await confirmImportPresetBundle(
        bundlePreview.tempDir,
        bundleConflictResolutions,
      );
      setBundlePreview(null);
      await reload(null);
      setStatus(
        t("profiles.bundleImportSuccess", {
          name: result.presetName,
          installed: result.installedCount,
          skipped: result.skippedCount,
        }),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("profiles.bundleImportFailed"));
    } finally {
      setBundleImporting(false);
    }
  }

  const availableIds = new Set(availableMods.map((m) => m.id.toLowerCase()));
  const selectedCount = draft.modIds.filter((id) => availableIds.has(id.toLowerCase())).length;

  return (
    <section className="page page--profiles" ref={pageRef}>
      {/* ── Page header */}
      <div className="profiles-header" ref={headerRef}>
        <div>
          <h1 className="profiles-header__title">{t("profiles.title")}</h1>
          <p className="profiles-header__sub">{t("profiles.description")}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button button--secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={() => void handleImportBundle()} disabled={busyAction !== null} type="button">
            <FolderDown size={16} />
            {t("profiles.importBundle")}
          </button>
          <button className="button button--primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={beginCreate} type="button">
            <Plus size={16} />
            {t("profiles.new")}
          </button>
        </div>
      </div>

      <div className="profiles-layout">

        {/* ── LEFT: Profile list */}
        <nav className="profiles-sidebar">
          <div className="profiles-sidebar__label">
            {t("profiles.savedCount", { count: profiles.length })}
          </div>
          <div className="profile-list">
            {profiles.length === 0 ? (
              <div className="profiles-empty-hint">
                <Layers size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                <span>{t("profiles.noProfilesHelp")}</span>
              </div>
            ) : (
              profiles.map((profile) => {
                const isSelected = !isCreating && selectedProfileId === profile.id;
                const isActive = activeProfileName === profile.name;
                return (
                  <button
                    className={`profile-item${isSelected ? " is-active" : ""}${isActive ? " is-live" : ""}`}
                    key={profile.id}
                    onClick={() => handleSelect(profile)}
                    type="button"
                  >
                    <div className="profile-item__icon">
                      {isActive ? <Zap size={14} /> : <Layers size={14} />}
                    </div>
                    <div className="profile-item__copy">
                      <strong>{profile.name}</strong>
                      <span>{profile.description ?? t("profiles.noDescription")}</span>
                    </div>
                    <div className="profile-item__badge">
                      {isActive ? (
                        <span className="p-badge p-badge--live">{t("profiles.liveBadge")}</span>
                      ) : (
                        <span className="p-badge p-badge--muted">
                          {t("profiles.modCountBadge", { count: profile.modIds.filter((id) => availableIds.has(id.toLowerCase())).length })}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </nav>

        {/* ── RIGHT: Detail pane */}
        <div className="profiles-detail">
          {/* Hero: Profile name */}
          <input
            className="profiles-name-input"
            onChange={(event) => setDraft((c) => ({ ...c, name: event.target.value }))}
            placeholder={t("profiles.namePlaceholder")}
            value={draft.name}
          />
          <textarea
            className="profiles-desc-input"
            onChange={(event) => setDraft((c) => ({ ...c, description: event.target.value }))}
            placeholder={t("profiles.descriptionPlaceholder")}
            rows={2}
            value={draft.description}
          />

          {/* Unified toolbar — all actions in one row */}
          <div className="profiles-toolbar">
            <button
              className="profiles-toolbar__apply"
              disabled={!draft.id || busyAction !== null}
              onClick={() => void handleApply()}
              type="button"
            >
              <CheckCircle size={14} />
              <span>{t("profiles.applyTitle")}</span>
            </button>
            <div className="profiles-toolbar__spacer" />
            <button
              className="profiles-toolbar__action"
              disabled={busyAction !== null}
              onClick={() => void handleSave()}
              title={t("profiles.save")}
              type="button"
            >
              <Save size={15} />
            </button>
            <button
              className="profiles-toolbar__action"
              disabled={!draft.id || busyAction !== null}
              onClick={() => void handleShareBundle()}
              title={t("profiles.shareBundle")}
              type="button"
            >
              <Share2 size={15} />
            </button>
            <button
              className="profiles-toolbar__action profiles-toolbar__action--danger"
              disabled={busyAction !== null}
              onClick={() => void handleDelete()}
              title={t("profiles.delete")}
              type="button"
            >
              <Trash2 size={15} />
            </button>
          </div>


          {/* Zone 3 - Mod checklist */}
          <div className="profiles-zone profiles-zone--mods">
            <div className="profiles-mods-header">
              <span className="profiles-mods-header__title">{t("profiles.modSelection")}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="p-badge p-badge--muted">
                  {selectedCount} / {availableMods.length}
                </span>
                <button
                  className="icon-button"
                  onClick={fillFromCurrentEnabled}
                  title={t("profiles.useCurrentEnabled")}
                  type="button"
                >
                  <DatabaseZap size={15} />
                </button>
              </div>
            </div>
            {availableMods.length === 0 ? (
              <div className="profiles-mods-empty">
                <Package size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                <span>{t("profiles.noModsHelp")}</span>
              </div>
            ) : (
              <div className="profiles-mod-checklist">
                {availableMods.map((mod) => {
                  const included = draft.modIds.some((id) => id.toLowerCase() === mod.id.toLowerCase());
                  return (
                    <button
                      key={mod.id}
                      className={`profiles-mod-row${included ? " is-checked" : ""}`}
                      onClick={() => toggleMod(mod.id)}
                      type="button"
                    >
                      <span className={`profiles-mod-check${included ? " is-on" : ""}`}>
                        {included && <Check size={11} />}
                      </span>
                      <span className="profiles-mod-main">
                        <span className="profiles-mod-title">
                          <span className="profiles-mod-name">{mod.name}</span>
                          {mod.affectsGameplay ? (
                            <span className="profiles-mod-impact" title={multiplayerAffectedLabel}>
                              <span className="profiles-mod-impact-dot" aria-hidden="true"></span>
                              {multiplayerAffectedLabel}
                            </span>
                          ) : null}
                        </span>
                        <span className="profiles-mod-meta">
                          {mod.author || t("profiles.unknownAuthor")}
                          {mod.version ? ` \u00b7 ${mod.version}` : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title={t("profiles.confirmDelete", { name: draft.name || "Untitled" })}
        tone="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* ── Bundle conflict resolution dialog */}
      {bundlePreview && (
        <ConfirmDialog
          open
          title={t("profiles.bundleConflictTitle")}
          confirmLabel={bundleImporting ? t("profiles.bundleImporting") : t("profiles.importBundle")}
          cancelLabel={t("library.savePresetCancel")}
          onConfirm={() => void handleConfirmBundleImport()}
          onCancel={() => setBundlePreview(null)}
        >
          <p className="bundle-summary">
            {t("profiles.bundleConflictDesc", { count: bundlePreview.conflictMods.length })}
          </p>
          {bundlePreview.newMods.length > 0 && (
            <div className="bundle-section">
              <div className="bundle-section__title">
                {t("profiles.bundleNewMods", { count: bundlePreview.newMods.length })}
              </div>
              <div className="bundle-mod-list">
                {bundlePreview.newMods.map((m) => (
                  <div key={m.id} className="bundle-mod-item bundle-mod-item--new">
                    <span className="bundle-mod-item__name">{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {bundlePreview.conflictMods.length > 0 && (
            <div className="bundle-section">
              <div className="bundle-section__title">
                {t("profiles.bundleConflictMods", { count: bundlePreview.conflictMods.length })}
              </div>
              <div className="bundle-mod-list">
                {bundlePreview.conflictMods.map((m) => (
                  <div key={m.id} className="bundle-mod-item bundle-mod-item--conflict">
                    <span className="bundle-mod-item__name">{m.name}</span>
                    <div className="bundle-toggle">
                      <button
                        type="button"
                        className={`bundle-toggle__btn${(bundleConflictResolutions[m.id] ?? "skip") === "skip" ? " is-active" : ""}`}
                        onClick={() => setBundleConflictResolutions((prev) => ({ ...prev, [m.id]: "skip" }))}
                      >
                        {t("profiles.bundleConflictSkip")}
                      </button>
                      <button
                        type="button"
                        className={`bundle-toggle__btn bundle-toggle__btn--replace${(bundleConflictResolutions[m.id] ?? "skip") === "replace" ? " is-active" : ""}`}
                        onClick={() => setBundleConflictResolutions((prev) => ({ ...prev, [m.id]: "replace" }))}
                      >
                        {t("profiles.bundleConflictReplace")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
