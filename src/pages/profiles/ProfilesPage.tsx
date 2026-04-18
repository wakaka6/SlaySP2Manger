import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  updateProfileModSelection,
  type InstalledMod,
  type ModProfile,
  type PresetBundlePreview,
} from "../../lib/desktop";
import {
  PRESET_MOD_TAGS,
  buildCustomTagCounts,
  buildPresetTagCounts,
  getModCustomTags,
  getModPresetTagIds,
  loadModTags,
  type ModTagMap,
  type PresetModTagId,
} from "../../lib/modTags";
import AnimatedList from "../../components/common/AnimatedList";
import {
  CustomModTagIcon,
  PresetModTagIcon,
  formatCustomTagLabel,
} from "../../components/common/ModTagVisuals";
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
  const [modTags] = useState<ModTagMap>(loadModTags);
  const [selectedPresetTagIds, setSelectedPresetTagIds] = useState<PresetModTagId[]>([]);
  const [selectedCustomTags, setSelectedCustomTags] = useState<string[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(createEmptyDraft);
  const [isCreating, setIsCreating] = useState(false);
  const [activeProfileName, setActiveProfileName] = useState("No active profile");
  const [status, setStatus] = useState(t("profiles.loading"));
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const isBusyRef = useRef(false);
  const profilesRef = useRef<ModProfile[]>([]);
  const autoSaveQueuedRef = useRef<ProfileDraft | null>(null);
  const autoSaveRunningRef = useRef(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bundlePreview, setBundlePreview] = useState<PresetBundlePreview | null>(null);
  const [bundleConflictResolutions, setBundleConflictResolutions] = useState<Record<string, string>>({});
  const [bundleImporting, setBundleImporting] = useState(false);
  const presetTagLabelById = useMemo(
    () => new Map(PRESET_MOD_TAGS.map((item) => [item.id, t(item.messageKey)])),
    [t],
  );

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  const reload = useCallback(async (nextSelectedId?: string | null) => {
    const [profileItems, enabledItems, disabledItems, bootstrap] = await Promise.all([
      listProfiles(),
      listInstalledMods(),
      listDisabledMods(),
      getAppBootstrap(),
    ]);

    profilesRef.current = profileItems;
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

  function replaceProfile(updated: ModProfile) {
    setProfiles((current) => {
      const index = current.findIndex((item) => item.id === updated.id);
      if (index === -1) {
        return current;
      }

      const next = [...current];
      next[index] = updated;
      profilesRef.current = next;
      return next;
    });
  }

  async function saveProfileModSelection(targetDraft: ProfileDraft) {
    if (!targetDraft.id) {
      return null;
    }

    const persisted = profilesRef.current.find((item) => item.id === targetDraft.id);
    const updated = await updateProfileModSelection(
      persisted
        ? {
            ...persisted,
            modIds: [...targetDraft.modIds],
          }
        : {
            id: targetDraft.id,
            name: targetDraft.name.trim(),
            description: targetDraft.description.trim() || null,
            modIds: [...targetDraft.modIds],
            createdAt: targetDraft.createdAt,
            updatedAt: targetDraft.updatedAt,
          },
    );

    replaceProfile(updated);
    setDraft((current) =>
      current.id === updated.id
        ? {
            ...current,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
          }
        : current,
    );
    return updated;
  }

  async function flushAutoSaveQueue() {
    if (autoSaveRunningRef.current || isBusyRef.current) {
      return;
    }

    autoSaveRunningRef.current = true;
    setBusyAction((current) => current ?? "autosave");

    try {
      while (autoSaveQueuedRef.current) {
        const queuedDraft = autoSaveQueuedRef.current;
        autoSaveQueuedRef.current = null;
        await saveProfileModSelection(queuedDraft);
      }
    } catch (error) {
      autoSaveQueuedRef.current = null;
      setStatus(error instanceof Error ? error.message : t("profiles.saveFailed"));
    } finally {
      autoSaveRunningRef.current = false;
      setBusyAction((current) => (current === "autosave" ? null : current));
    }
  }

  function scheduleAutoSave(nextDraft: ProfileDraft) {
    if (!nextDraft.id || isCreating) {
      return;
    }

    autoSaveQueuedRef.current = nextDraft;
    void flushAutoSaveQueue();
  }

  function toggleMod(modId: string) {
    setDraft((current) => {
      const exists = current.modIds.some((item) => item.toLowerCase() === modId.toLowerCase());
      const next = {
        ...current,
        modIds: exists
          ? current.modIds.filter((item) => item.toLowerCase() !== modId.toLowerCase())
          : [...current.modIds, modId],
      };
      scheduleAutoSave(next);
      return next;
    });
  }

  function fillFromCurrentEnabled() {
    setDraft((current) => {
      const next = {
        ...current,
        modIds: enabledMods.map((item) => item.id),
      };
      scheduleAutoSave(next);
      return next;
    });
    setStatus(t("profiles.synced"));
  }

  function getPresetTagLabel(tagId: PresetModTagId) {
    return presetTagLabelById.get(tagId) ?? tagId;
  }

  function toggleSelectedPresetTag(tagId: PresetModTagId) {
    setSelectedPresetTagIds((current) =>
      current.includes(tagId)
        ? current.filter((item) => item !== tagId)
        : [...current, tagId],
    );
  }

  function toggleSelectedCustomTag(tag: string) {
    const compareKey = tag.trim().toLowerCase();
    setSelectedCustomTags((current) =>
      current.some((item) => item.trim().toLowerCase() === compareKey)
        ? current.filter((item) => item.trim().toLowerCase() !== compareKey)
        : [...current, tag],
    );
  }

  async function handleSave() {
    if (isBusyRef.current) return;
    const currentDraft = draft;
    const name = currentDraft.name.trim();
    if (!name) {
      setStatus(t("profiles.nameRequired"));
      return;
    }

    isBusyRef.current = true;
    setBusyAction("save");
    try {
      if (isCreating || !currentDraft.id) {
        const created = await createProfile(name, currentDraft.description.trim() || null, currentDraft.modIds);
        await reload(created.id);
        setStatus(t("profiles.created", { name: created.name }));
      } else {
        const updated = await updateProfile({
          id: currentDraft.id,
          name,
          description: currentDraft.description.trim() || null,
          modIds: currentDraft.modIds,
          createdAt: currentDraft.createdAt,
          updatedAt: currentDraft.updatedAt,
        });
        await reload(updated.id);
        setStatus(t("profiles.saved", { name: updated.name }));
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("profiles.saveFailed"));
    } finally {
      isBusyRef.current = false;
      setBusyAction(null);
      void flushAutoSaveQueue();
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
      void flushAutoSaveQueue();
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
      void flushAutoSaveQueue();
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
      void flushAutoSaveQueue();
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
      void flushAutoSaveQueue();
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
  const presetFilterSet = useMemo(
    () => new Set(selectedPresetTagIds),
    [selectedPresetTagIds],
  );
  const customFilterSet = useMemo(
    () => new Set(selectedCustomTags.map((tag) => tag.trim().toLowerCase())),
    [selectedCustomTags],
  );
  const filteredAvailableMods = useMemo(() => {
    if (presetFilterSet.size === 0 && customFilterSet.size === 0) {
      return availableMods;
    }

    return availableMods.filter((mod) =>
      getModPresetTagIds(modTags, mod.id).some((tagId) => presetFilterSet.has(tagId)) ||
      getModCustomTags(modTags, mod.id).some((tag) => customFilterSet.has(tag.trim().toLowerCase())),
    );
  }, [availableMods, customFilterSet, modTags, presetFilterSet]);
  const presetTagCounts = useMemo(
    () => buildPresetTagCounts(availableMods, modTags),
    [availableMods, modTags],
  );
  const visiblePresetTagOptions = useMemo(
    () =>
      PRESET_MOD_TAGS.filter(
        (item) => presetTagCounts[item.id] > 0 || selectedPresetTagIds.includes(item.id),
      ),
    [presetTagCounts, selectedPresetTagIds],
  );
  const customTagOptions = useMemo(() => {
    const options = buildCustomTagCounts(availableMods, modTags);
    const byKey = new Map(options.map((item) => [item.value.trim().toLowerCase(), item]));

    for (const tag of selectedCustomTags) {
      const compareKey = tag.trim().toLowerCase();
      if (!compareKey || byKey.has(compareKey)) {
        continue;
      }

      options.push({ value: tag, count: 0 });
    }

    return options.sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.value.localeCompare(right.value);
    });
  }, [availableMods, modTags, selectedCustomTags]);
  const hasTagFilterOptions = useMemo(
    () =>
      visiblePresetTagOptions.length > 0 ||
      customTagOptions.length > 0 ||
      selectedCustomTags.length > 0,
    [customTagOptions.length, selectedCustomTags.length, visiblePresetTagOptions.length],
  );
  const hasModFilters = selectedPresetTagIds.length > 0 || selectedCustomTags.length > 0;
  const selectedProfileIndex = !isCreating
    ? profiles.findIndex((profile) => profile.id === selectedProfileId)
    : -1;
  const modSelectionLocked = busyAction !== null && busyAction !== "autosave";

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
          {profiles.length === 0 ? (
            <div className="profile-list">
              <div className="profiles-empty-hint">
                <Layers size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                <span>{t("profiles.noProfilesHelp")}</span>
              </div>
            </div>
          ) : (
            <AnimatedList
              items={profiles}
              selectedIndex={selectedProfileIndex}
              onItemSelect={(profile) => handleSelect(profile)}
              getItemKey={(profile) => profile.id}
              renderItem={(profile, _index, selected) => {
                const isActive = activeProfileName === profile.name;
                const installedCount = profile.modIds.filter((id) => availableIds.has(id.toLowerCase())).length;

                return (
                  <button
                    className={`profile-item${selected ? " is-active" : ""}${isActive ? " is-live" : ""}`}
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
                          {t("profiles.modCountBadge", { count: installedCount })}
                        </span>
                      )}
                    </div>
                  </button>
                );
              }}
              className="profile-list-animated"
              listClassName="profile-list"
              showGradients={profiles.length > 0}
              enableArrowNavigation={false}
              ariaLabel={t("profiles.savedCount", { count: profiles.length })}
            />
          )}
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
                  disabled={modSelectionLocked}
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
              <>
                {hasTagFilterOptions ? (
                  <div className={`profiles-mod-filters${hasModFilters ? " is-filtered" : ""}`}>
                    <div className="profiles-mod-filters__header">
                      <span className="profiles-mod-filters__eyebrow">{t("library.tagFilterTitle")}</span>
                      {hasModFilters ? (
                        <button
                          className="button button--ghost profiles-mod-filters__clear"
                          type="button"
                          onClick={() => {
                            setSelectedPresetTagIds([]);
                            setSelectedCustomTags([]);
                          }}
                        >
                          {t("library.clearFilters")}
                        </button>
                      ) : null}
                    </div>

                    {visiblePresetTagOptions.length > 0 ? (
                      <div className="profiles-mod-filters__group">
                        <div className="profiles-mod-filters__group-title">{t("library.tagPresetGroup")}</div>
                        <div className="profiles-mod-filters__list">
                          {visiblePresetTagOptions.map((item) => {
                            const count = presetTagCounts[item.id];
                            const isActive = selectedPresetTagIds.includes(item.id);
                            return (
                              <button
                                key={item.id}
                                className={`button button--secondary profiles-mod-filter-chip${isActive ? " is-active" : ""}`}
                                type="button"
                                aria-pressed={isActive}
                                disabled={!isActive && count === 0}
                                onClick={() => toggleSelectedPresetTag(item.id)}
                                title={getPresetTagLabel(item.id)}
                              >
                                <PresetModTagIcon className="profiles-mod-filter-chip__icon" size={13} tagId={item.id} />
                                <span className="profiles-mod-filter-chip__label">{getPresetTagLabel(item.id)}</span>
                                <span className="profiles-mod-filter-chip__count">{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {customTagOptions.length > 0 ? (
                      <div className="profiles-mod-filters__group">
                        <div className="profiles-mod-filters__group-title">{t("library.tagCustomGroup")}</div>
                        <div className="profiles-mod-filters__list">
                          {customTagOptions.map((item) => {
                            const isActive = selectedCustomTags.some(
                              (tag) => tag.trim().toLowerCase() === item.value.trim().toLowerCase(),
                            );
                            return (
                              <button
                                key={item.value}
                                className={`button button--secondary profiles-mod-filter-chip${isActive ? " is-active" : ""}`}
                                type="button"
                                aria-pressed={isActive}
                                disabled={!isActive && item.count === 0}
                                onClick={() => toggleSelectedCustomTag(item.value)}
                                title={formatCustomTagLabel(item.value)}
                              >
                                <CustomModTagIcon className="profiles-mod-filter-chip__icon" size={13} />
                                <span className="profiles-mod-filter-chip__label">{formatCustomTagLabel(item.value)}</span>
                                <span className="profiles-mod-filter-chip__count">{item.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {filteredAvailableMods.length === 0 ? (
                  <div className="profiles-mods-empty">
                    <Package size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                    <span>{t("library.noFilterResults")}</span>
                  </div>
                ) : (
                  <div className="profiles-mod-checklist">
                    {filteredAvailableMods.map((mod) => {
                      const included = draft.modIds.some((id) => id.toLowerCase() === mod.id.toLowerCase());
                      const modPresetTagIds = getModPresetTagIds(modTags, mod.id);
                      const modCustomTags = getModCustomTags(modTags, mod.id);
                      return (
                        <button
                          key={mod.id}
                          className={`profiles-mod-row${included ? " is-checked" : ""}`}
                          disabled={modSelectionLocked}
                          onClick={() => toggleMod(mod.id)}
                          type="button"
                        >
                          <span className={`profiles-mod-check${included ? " is-on" : ""}`}>
                            {included && <Check size={11} />}
                          </span>
                          <span className="profiles-mod-main">
                            <span className="profiles-mod-title">
                              <span className="profiles-mod-name">{mod.name}</span>
                              {modPresetTagIds.length > 0 || modCustomTags.length > 0 ? (
                                <span className="profiles-mod-tags">
                                  {modPresetTagIds.map((tagId) => (
                                    <span className="profiles-mod-tag profiles-mod-tag--preset" key={`preset:${tagId}`} title={getPresetTagLabel(tagId)}>
                                      <PresetModTagIcon className="profiles-mod-tag__icon" size={11} tagId={tagId} />
                                      <span className="profiles-mod-tag-text">{getPresetTagLabel(tagId)}</span>
                                    </span>
                                  ))}
                                  {modCustomTags.map((tag) => (
                                    <span className="profiles-mod-tag profiles-mod-tag--custom" key={`custom:${tag}`} title={formatCustomTagLabel(tag)}>
                                      <CustomModTagIcon className="profiles-mod-tag__icon" size={11} />
                                      <span className="profiles-mod-tag-text">{formatCustomTagLabel(tag)}</span>
                                    </span>
                                  ))}
                                </span>
                              ) : null}
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
              </>
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
