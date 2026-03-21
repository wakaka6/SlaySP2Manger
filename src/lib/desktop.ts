import { invoke } from "@tauri-apps/api/core";

// ── In-memory API cache ─────────────────────────────────────────────────
// Cached on first request; lives until app closes or invalidated by mutations.
const _cache = new Map<string, unknown>();

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = _cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit as T);
  return fn().then((data) => {
    _cache.set(key, data);
    return data;
  });
}

function invalidate(...patterns: string[]) {
  for (const p of patterns) {
    if (p.endsWith("*")) {
      const prefix = p.slice(0, -1);
      for (const k of _cache.keys()) {
        if (k.startsWith(prefix)) _cache.delete(k);
      }
    } else {
      _cache.delete(p);
    }
  }
}

export type AppBootstrap = {
  appName: string;
  appVersion: string;
  gameDirectory: string | null;
  gameDirectoryValid: boolean;
  installedCount: number;
  disabledCount: number;
  activeProfileName: string;
  locale: string;
  saveAutoSync: boolean;
  saveSyncPairs: SaveSyncPair[];
  nexusApiKey: string | null;
  nexusIsPremium: boolean;
  nexusUserName: string | null;
};

export type InstalledMod = {
  id: string;
  name: string;
  version: string | null;
  author: string | null;
  folderName: string;
  installDir: string;
  manifestPath: string | null;
  state: "enabled" | "disabled" | "update_available" | "conflict" | "broken" | "unknown";
};

export type SaveKind = "vanilla" | "modded";

export type SaveSlot = {
  steamUserId: string;
  kind: SaveKind;
  slotIndex: number;
  path: string;
  hasData: boolean;
  hasCurrentRun: boolean;
  fileCount: number;
  lastModifiedAt: string | null;
};

export type SaveSlotRef = {
  steamUserId: string;
  kind: SaveKind;
  slotIndex: number;
};

export type SaveTransferPreview = {
  source: SaveSlotRef;
  target: SaveSlotRef;
  sourceHasData: boolean;
  targetHasData: boolean;
  backupWillBeCreated: boolean;
  summary: string;
};

export type SaveBackupEntry = {
  id: string;
  steamUserId: string;
  kind: SaveKind;
  slotIndex: number;
  backupPath: string;
  createdAt: string;
  reason: string;
};

export type GameInstall = {
  rootDir: string;
  exePath: string;
  modsDir: string;
  disabledModsDir: string;
  detectedBy: "config" | "steam_default" | "steam_library" | "common_path";
  isValid: boolean;
};

export type RemoteMod = {
  remoteId: string;
  provider: string;
  name: string;
  summary: string | null;
  author: string | null;
  latestVersion: string | null;
  detailUrl: string;
  endorsementCount: number;
  downloadCount: number;
  uniqueDownloads: number;
};

export type RemoteModSearchResult = {
  items: RemoteMod[];
  totalCount: number;
  offset: number;
  count: number;
};

export type ModFileInfo = {
  fileId: number;
  name: string;
  version: string;
  category: string;
  isPrimary: boolean;
  sizeKb: number;
  fileName: string;
};

export type ActivityLog = {
  id: string;
  category: string;
  title: string;
  detail: string | null;
  createdAt: string;
};

export type ArchiveInstallPreview = {
  archivePath: string;
  enableAfterInstall: boolean;
  hasConflicts: boolean;
  items: Array<{
    modId: string;
    name: string;
    version: string | null;
    folderName: string;
    targetDir: string;
    conflicts: string[];
  }>;
};

export type ModProfile = {
  id: string;
  name: string;
  description: string | null;
  modIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ApplyProfileResult = {
  profile: ModProfile;
  enabledModIds: string[];
  disabledModIds: string[];
  missingModIds: string[];
};

export async function getAppBootstrap(): Promise<AppBootstrap> {
  return cached("app_bootstrap", () => invoke<AppBootstrap>("get_app_bootstrap"));
}

export async function listInstalledMods(): Promise<InstalledMod[]> {
  return cached("installed_mods", () => invoke<InstalledMod[]>("list_installed_mods"));
}

export async function listDisabledMods(): Promise<InstalledMod[]> {
  return cached("disabled_mods", () => invoke<InstalledMod[]>("list_disabled_mods"));
}

export async function listActivityLogs(): Promise<ActivityLog[]> {
  return cached("activity_logs", () => invoke<ActivityLog[]>("list_activity_logs"));
}

export async function enableMod(modId: string) {
  const result = await invoke<InstalledMod>("enable_mod", { modId });
  invalidate("installed_mods", "disabled_mods", "app_bootstrap");
  return result;
}

export async function disableMod(modId: string) {
  const result = await invoke<InstalledMod>("disable_mod", { modId });
  invalidate("installed_mods", "disabled_mods", "app_bootstrap");
  return result;
}

export async function uninstallMod(modId: string) {
  const result = await invoke<string>("uninstall_mod", { modId });
  invalidate("installed_mods", "disabled_mods", "app_bootstrap");
  return result;
}

export async function openModsDirectory() {
  return invoke<void>("open_mods_directory");
}

export async function openModFolder(modId: string) {
  return invoke<void>("open_mod_folder", { modId });
}

export async function previewInstallArchive(
  archivePath: string,
  enableAfterInstall: boolean,
): Promise<ArchiveInstallPreview> {
  return invoke<ArchiveInstallPreview>("preview_install_archive", {
    archivePath,
    enableAfterInstall,
  });
}

export async function installArchiveWithReplace(
  archivePath: string,
  enableAfterInstall: boolean,
  replaceExisting: boolean,
) {
  const result = await invoke<InstalledMod[]>("install_archive", {
    archivePath,
    enableAfterInstall,
    replaceExisting,
  });
  invalidate("installed_mods", "disabled_mods", "app_bootstrap");
  return result;
}

export async function pickArchiveFile(): Promise<string | null> {
  return invoke<string | null>("pick_archive_file");
}

export async function updateGameRootDir(gameRootDir: string) {
  await invoke("update_game_root_dir", { gameRootDir });
  invalidate("app_bootstrap", "installed_mods", "disabled_mods", "save_slots", "save_backups");
}

export async function updateAppLocale(locale: string) {
  await invoke("update_app_locale", { locale });
  invalidate("app_bootstrap");
}

export async function detectGameInstall(): Promise<GameInstall | null> {
  return invoke<GameInstall>("detect_game_install");
}

export async function listSaveSlots(): Promise<SaveSlot[]> {
  return cached("save_slots", () => invoke<SaveSlot[]>("list_save_slots"));
}

export async function previewSaveTransfer(
  source: SaveSlotRef,
  target: SaveSlotRef,
): Promise<SaveTransferPreview> {
  return invoke<SaveTransferPreview>("preview_save_transfer", { source, target });
}

export async function transferSave(source: SaveSlotRef, target: SaveSlotRef) {
  const result = await invoke<SaveBackupEntry | null>("transfer_save", { source, target });
  invalidate("save_slots", "save_backups");
  return result;
}

export async function deleteSaveBackup(backupId: string) {
  await invoke<void>("delete_save_backup", { id: backupId });
  invalidate("save_backups");
}

export async function openPathInExplorer(path: string) {
  return invoke<void>("open_path_in_explorer", { path });
}

export async function createSaveBackup(slot: SaveSlotRef) {
  const result = await invoke<SaveBackupEntry>("create_save_backup", { slot });
  invalidate("save_backups");
  return result;
}

export async function listSaveBackups(): Promise<SaveBackupEntry[]> {
  return cached("save_backups", () => invoke<SaveBackupEntry[]>("list_save_backups"));
}

export type SaveSyncPair = {
  vanillaSlot: number;
  moddedSlot: number;
};

export type SaveSyncResult = {
  syncedCount: number;
  details: Array<{
    slotIndex: number;
    direction: string;
    backupCreated: boolean;
  }>;
};

export async function toggleSaveAutoSync(enabled: boolean) {
  await invoke("toggle_save_auto_sync", { enabled });
  invalidate("app_bootstrap");
}

export async function updateSaveSyncPairs(pairs: SaveSyncPair[]) {
  await invoke("update_save_sync_pairs", { pairs });
  invalidate("app_bootstrap");
}

export async function syncSaves(): Promise<SaveSyncResult> {
  const result = await invoke<SaveSyncResult>("sync_saves");
  invalidate("save_slots", "save_backups");
  return result;
}

export async function restoreSaveBackup(backupId: string) {
  await invoke<void>("restore_save_backup", { backupId });
  invalidate("save_slots", "save_backups");
}

export async function searchRemoteMods(
  query: string,
  sortBy = "latest_added",
  offset = 0,
  count = 20,
): Promise<RemoteModSearchResult> {
  const key = `search:${query}:${sortBy}:${offset}:${count}`;
  return cached(key, () =>
    invoke<RemoteModSearchResult>("search_remote_mods", { query, sortBy, offset, count }),
  );
}

export async function getModFiles(modId: number): Promise<ModFileInfo[]> {
  return invoke<ModFileInfo[]>("get_mod_files", { modId });
}

export async function getDownloadLink(modId: number, fileId: number): Promise<string> {
  return invoke<string>("get_download_link", { modId, fileId });
}

export async function downloadAndInstallMod(modId: number, fileId: number, fileName: string): Promise<InstalledMod> {
  const result = await invoke<InstalledMod>("download_and_install_mod", { modId, fileId, fileName });
  invalidate("installed_mods", "disabled_mods", "app_bootstrap");
  return result;
}

export async function listProfiles(): Promise<ModProfile[]> {
  return cached("profiles", () => invoke<ModProfile[]>("list_profiles"));
}

export async function createProfile(
  name: string,
  description: string | null,
  modIds: string[],
): Promise<ModProfile> {
  const result = await invoke<ModProfile>("create_profile", { name, description, modIds });
  invalidate("profiles", "app_bootstrap");
  return result;
}

export async function updateProfile(profile: ModProfile): Promise<ModProfile> {
  const result = await invoke<ModProfile>("update_profile", { profile });
  invalidate("profiles", "app_bootstrap");
  return result;
}

export async function deleteProfile(profileId: string): Promise<ModProfile> {
  const result = await invoke<ModProfile>("delete_profile", { profileId });
  invalidate("profiles", "app_bootstrap");
  return result;
}

export async function applyProfile(profileId: string): Promise<ApplyProfileResult> {
  const result = await invoke<ApplyProfileResult>("apply_profile", { profileId });
  invalidate("profiles", "installed_mods", "disabled_mods", "app_bootstrap");
  return result;
}

export async function exportProfile(profileId: string): Promise<string | null> {
  return invoke<string | null>("export_profile", { profileId });
}

export async function launchGame() {
  return invoke<void>("launch_game");
}

export async function updateNexusApiKey(apiKey: string) {
  await invoke<void>("update_nexus_api_key", { apiKey });
  invalidate("app_bootstrap", "search:*");
}

export async function openUrlInBrowser(url: string) {
  return invoke<void>("open_url_in_browser", { url });
}
