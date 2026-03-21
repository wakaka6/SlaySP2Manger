import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import {
  applyProfile,
  createProfile,
  deleteProfile,
  exportProfile,
  getAppBootstrap,
  listDisabledMods,
  listInstalledMods,
  listProfiles,
  updateProfile,
  type InstalledMod,
  type ModProfile,
} from "../../lib/desktop";
import { Save, LogOut, CheckCircle, Trash2, DatabaseZap, Plus, Layers, Zap, Package, Check } from "lucide-react";

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
  const [profiles, setProfiles] = useState<ModProfile[]>([]);
  const [enabledMods, setEnabledMods] = useState<InstalledMod[]>([]);
  const [availableMods, setAvailableMods] = useState<InstalledMod[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(createEmptyDraft);
  const [isCreating, setIsCreating] = useState(false);
  const [activeProfileName, setActiveProfileName] = useState("No active profile");
  const [status, setStatus] = useState(t("profiles.loading"));
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function reload(nextSelectedId?: string | null) {
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
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const name = draft.name.trim();
    if (!name) {
      setStatus(t("profiles.nameRequired"));
      return;
    }

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
      setBusyAction(null);
    }
  }

  async function handleApply() {
    if (!draft.id) {
      setStatus(t("profiles.applyNeedSave"));
      return;
    }

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
      setBusyAction(null);
    }
  }

  async function handleExport() {
    if (!draft.id) {
      setStatus(t("profiles.exportNeedSave"));
      return;
    }

    setBusyAction("export");
    try {
      const path = await exportProfile(draft.id);
      setStatus(path ? t("profiles.exported", { path }) : t("profiles.exportCancelled"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("profiles.exportFailed"));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete() {
    if (!draft.id) {
      beginCreate();
      return;
    }

    const confirmed = window.confirm(t("profiles.confirmDelete", { name: draft.name || "Untitled" }));
    if (!confirmed) {
      return;
    }

    setBusyAction("delete");
    try {
      const removed = await deleteProfile(draft.id);
      const nextProfile = profiles.find((item) => item.id !== removed.id) ?? null;
      await reload(nextProfile?.id ?? null);
      setStatus(t("profiles.deleted", { name: removed.name }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("profiles.deleteFailed"));
    } finally {
      setBusyAction(null);
    }
  }

  const availableIds = new Set(availableMods.map((m) => m.id.toLowerCase()));
  const selectedCount = draft.modIds.filter((id) => availableIds.has(id.toLowerCase())).length;

  return (
    <section className="page">
      {/* ── Page header */}
      <div className="profiles-header">
        <div>
          <h1 className="profiles-header__title">{t("profiles.title")}</h1>
          <p className="profiles-header__sub">{t("profiles.description")}</p>
        </div>
        <button className="button button--primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={beginCreate} type="button">
          <Plus size={16} />
          {t("profiles.new")}
        </button>
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
          {/* Zone 1 - Identity */}
          <div className="profiles-zone profiles-zone--identity">
            <div className="profiles-zone__eyebrow">
              {isCreating ? t("profiles.eyebrowNew") : t("profiles.eyebrowDetail")}
              {!isCreating && activeProfileName === draft.name && (
                <span className="p-badge p-badge--live" style={{ marginLeft: 8 }}>
                  {t("profiles.liveBadge")}
                </span>
              )}
            </div>
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
          </div>

          {/* Zone 2 - Primary Actions */}
          <div className="profiles-zone profiles-zone--actions">
            <button
              className="profiles-apply-btn"
              disabled={!draft.id || busyAction === "apply"}
              onClick={() => void handleApply()}
              type="button"
            >
              <CheckCircle size={20} />
              <div className="profiles-apply-btn__text">
                <span>{t("profiles.applyTitle")}</span>
                <span className="profiles-apply-btn__sub">{t("profiles.applySub")}</span>
              </div>
            </button>
            <div className="profiles-action-row">
              <button
                className="button button--secondary"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flex: 1,
                  justifyContent: "center",
                }}
                disabled={busyAction === "save"}
                onClick={() => void handleSave()}
                type="button"
              >
                <Save size={15} />
                {t("profiles.save")}
              </button>
              <button
                className="button button--secondary"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flex: 1,
                  justifyContent: "center",
                }}
                disabled={!draft.id || busyAction === "export"}
                onClick={() => void handleExport()}
                type="button"
              >
                <LogOut size={15} />
                {t("profiles.export")}
              </button>
              <button
                className="icon-button icon-button--danger"
                disabled={busyAction === "delete"}
                onClick={() => void handleDelete()}
                title={t("profiles.delete")}
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </div>
            {status && status !== t("profiles.loading") && (
              <div className="profiles-status-toast">{status}</div>
            )}
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
                      <span className="profiles-mod-name">{mod.name}</span>
                      <span className="profiles-mod-meta">
                        {mod.author || t("profiles.unknownAuthor")}
                        {mod.version ? ` \u00b7 ${mod.version}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  );
}

