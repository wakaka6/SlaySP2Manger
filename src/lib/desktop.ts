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
  let bootstrapInvalidated = false;
  for (const p of patterns) {
    if (p === "app_bootstrap") bootstrapInvalidated = true;
    if (p.endsWith("*")) {
      const prefix = p.slice(0, -1);
      for (const k of _cache.keys()) {
        if (k.startsWith(prefix)) _cache.delete(k);
        if (k === "app_bootstrap") bootstrapInvalidated = true;
      }
    } else {
      _cache.delete(p);
    }
  }
  // Notify listeners (e.g. AppShell sidebar badge) that bootstrap data changed
  if (bootstrapInvalidated) {
    window.dispatchEvent(new CustomEvent("slaymgr:bootstrap-changed"));
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
  proxyUrl: string | null;
  autoBackupKeepCount: number;
};

export type InstalledMod = {
  id: string;
  name: string;
  version: string | null;
  author: string | null;
  folderName: string;
  installDir: string;
  manifestPath: string | null;
  affectsGameplay: boolean;
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

export type SaveGuardInfo = {
  pathSwitched: boolean;
  direction: string | null;
  hadPairs: boolean;
  savesSynced: number;
  backupsCreated: number;
  error: string | null;
};

export type ModToggleResult = {
  modItem: InstalledMod;
  saveGuard: SaveGuardInfo;
};

export type RemoteMod = {
  remoteId: string;
  provider: string;
  name: string;
  summary: string | null;
  author: string | null;
  latestVersion: string | null;
  pictureUrl: string | null;
  thumbnailUrl: string | null;
  thumbnailLargeUrl: string | null;
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

/** Invalidate mod list caches and re-read from disk via the backend. */
export async function refreshModList(): Promise<{
  enabled: InstalledMod[];
  disabled: InstalledMod[];
}> {
  invalidate("installed_mods", "disabled_mods", "app_bootstrap");
  const [enabled, disabled] = await Promise.all([
    listInstalledMods(),
    listDisabledMods(),
  ]);
  return { enabled, disabled };
}

export async function listActivityLogs(): Promise<ActivityLog[]> {
  return cached("activity_logs", () => invoke<ActivityLog[]>("list_activity_logs"));
}

export async function enableMod(modId: string): Promise<ModToggleResult> {
  const result = await invoke<ModToggleResult>("enable_mod", { modId });
  invalidate("installed_mods", "disabled_mods", "app_bootstrap", "save_slots", "save_backups");
  return result;
}

export async function disableMod(modId: string): Promise<ModToggleResult> {
  const result = await invoke<ModToggleResult>("disable_mod", { modId });
  invalidate("installed_mods", "disabled_mods", "app_bootstrap", "save_slots", "save_backups");
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

export async function pickArchiveFiles(): Promise<string[]> {
  return invoke<string[]>("pick_archive_files");
}

export async function pickImportFolder(): Promise<string | null> {
  return invoke<string | null>("pick_import_folder");
}

// ── Batch Import Types ────────────────────────────────────────────────

export type DiscoveredModStatus = "ready" | "conflict" | "unsupported_format" | "error";
export type DiscoveredModSourceType = "folder" | "archive";

export type DiscoveredMod = {
  modId: string;
  name: string;
  version: string | null;
  author: string | null;
  folderName: string;
  targetDir: string;
  sourceArchive: string;
  sourceType: DiscoveredModSourceType;
  status: DiscoveredModStatus;
  conflicts: string[];
  statusMessage: string | null;
};

export type BatchImportPreview = {
  discoveredMods: DiscoveredMod[];
  totalTargetsScanned: number;
  readyCount: number;
  conflictCount: number;
  unsupportedCount: number;
  errorCount: number;
};

export type BatchInstallItemResult = {
  modId: string;
  name: string;
  success: boolean;
  errorMessage: string | null;
};

export type BatchInstallResult = {
  successCount: number;
  failureCount: number;
  results: BatchInstallItemResult[];
};

export async function processImportTargets(
  paths: string[],
  enableAfterInstall: boolean,
): Promise<BatchImportPreview> {
  return invoke<BatchImportPreview>("process_import_targets", {
    paths,
    enableAfterInstall,
  });
}

export async function batchInstallMods(
  paths: string[],
  enableAfterInstall: boolean,
  replaceExisting: boolean,
  selectedModIds: string[],
  conflictResolutions: Record<string, string>,
): Promise<BatchInstallResult> {
  const result = await invoke<BatchInstallResult>("batch_install_mods", {
    paths,
    enableAfterInstall,
    replaceExisting,
    selectedModIds,
    conflictResolutions,
  });
  invalidate("installed_mods", "disabled_mods", "app_bootstrap");
  return result;
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

export type CloudSaveStatusDto = {
  isAvailable: boolean;
  cloudPath: string | null;
  localPath: string | null;
  hasMismatch: boolean;
  localOnlyCount: number;
  cloudOnlyCount: number;
  differentCount: number;
  localFileCount: number;
  cloudFileCount: number;
  samplePaths: string[];
  localAppliedToCloud: boolean;
  cloudAppliedToLocal: boolean;
};

export type CloudSaveDiffKind = "in_sync" | "different" | "local_only" | "cloud_only";
export type CloudSaveDiffSide = "local" | "cloud";

export type CloudSaveDiffEntryDto = {
  relativePath: string;
  kind: CloudSaveDiffKind;
  localExists: boolean;
  cloudExists: boolean;
  localSize: number | null;
  cloudSize: number | null;
  localSha: string | null;
  cloudSha: string | null;
};

export type CloudSaveDiffSideDetailDto = {
  path: string;
  exists: boolean;
  isText: boolean;
  size: number | null;
  sha: string | null;
  modifiedAt: string | null;
  textContent: string | null;
};

export type CloudSaveDiffDetailDto = {
  relativePath: string;
  kind: CloudSaveDiffKind;
  local: CloudSaveDiffSideDetailDto;
  cloud: CloudSaveDiffSideDetailDto;
};

export type BackupArtifactStatusDto = {
  localCount: number;
  cloudCount: number;
};

export type BackupArtifactCleanupResultDto = {
  localRemoved: number;
  cloudRemoved: number;
};

export async function getCloudSaveStatus(): Promise<CloudSaveStatusDto> {
  return invoke<CloudSaveStatusDto>("get_cloud_save_status");
}

export async function listCloudSaveDiffEntries(): Promise<CloudSaveDiffEntryDto[]> {
  return invoke<CloudSaveDiffEntryDto[]>("list_cloud_save_diff_entries");
}

export async function getCloudSaveDiffDetail(relativePath: string): Promise<CloudSaveDiffDetailDto> {
  return invoke<CloudSaveDiffDetailDto>("get_cloud_save_diff_detail", { relativePath });
}

export async function saveCloudSaveDiffContent(
  relativePath: string,
  target: CloudSaveDiffSide,
  content: string,
): Promise<CloudSaveDiffDetailDto> {
  const result = await invoke<CloudSaveDiffDetailDto>("save_cloud_save_diff_content", {
    relativePath,
    target,
    content,
  });
  invalidate("save_slots");
  return result;
}

export async function copyCloudSaveDiffSide(
  relativePath: string,
  source: CloudSaveDiffSide,
  target: CloudSaveDiffSide,
): Promise<CloudSaveDiffDetailDto> {
  const result = await invoke<CloudSaveDiffDetailDto>("copy_cloud_save_diff_side", {
    relativePath,
    source,
    target,
  });
  invalidate("save_slots");
  return result;
}

export async function getBackupArtifactStatus(): Promise<BackupArtifactStatusDto> {
  return invoke<BackupArtifactStatusDto>("get_backup_artifact_status");
}

export async function cleanupBackupArtifacts(): Promise<BackupArtifactCleanupResultDto> {
  const result = await invoke<BackupArtifactCleanupResultDto>("cleanup_backup_artifacts");
  invalidate("save_slots");
  return result;
}

export async function ascendToCloudFull(allowSteamRunning = false): Promise<CloudSaveStatusDto> {
  const result = await invoke<CloudSaveStatusDto>("ascend_to_cloud_full", { allowSteamRunning });
  invalidate("save_slots", "save_backups");
  return result;
}

export async function descendFromCloudFull(allowSteamRunning = false): Promise<CloudSaveStatusDto> {
  const result = await invoke<CloudSaveStatusDto>("descend_from_cloud_full", { allowSteamRunning });
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

export async function updateProxyUrl(proxyUrl: string) {
  await invoke<void>("update_proxy_url", { proxyUrl });
  invalidate("app_bootstrap");
}

export async function testProxy(proxyUrl: string) {
  return invoke<string>("test_proxy", { proxyUrl });
}

export async function updateAutoBackupKeepCount(count: number) {
  await invoke<void>("update_auto_backup_keep_count", { count });
  invalidate("app_bootstrap", "save_backups");
}
