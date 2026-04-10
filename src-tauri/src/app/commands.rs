use chrono::Utc;
use serde::Serialize;
use tauri::State;
use tauri::async_runtime::spawn_blocking;
use uuid::Uuid;

use crate::app::bootstrap::AppBootstrapDto;
use crate::app::state::{AppSettings, AppState};
use crate::domain::game::GameInstall;
use crate::domain::install_plan::{ArchiveInstallPreview, BatchImportPreview, BatchInstallResult};
use crate::domain::mod_entity::InstalledMod;
use crate::domain::profile::{
    ApplyProfileResult, ModProfile, PresetBundleImportResult, PresetBundleManifest,
    PresetBundleModEntry, PresetBundlePresetInfo, PresetBundlePreview, PresetBundlePreviewMod,
};
use crate::domain::remote_mod::RemoteModSearchResult;
use crate::domain::save::{
    BackupArtifactCleanupResult, BackupArtifactStatus, CloudSaveDiffDetail, CloudSaveDiffEntry,
    CloudSaveDiffSide, CloudSaveStatus, SaveBackupEntry, SaveSlot, SaveSlotRef, SaveSyncPair,
    SaveSyncResult, SaveTransferPreview,
};
use crate::domain::task::ActivityLogEntry;
use crate::integrations::settings_repo;
use crate::services::discover_service::DiscoverService;
use crate::services::game_service::GameService;
use crate::services::mod_service::ModService;
use crate::services::profile_service::ProfileService;
use crate::services::save_service::SaveService;
use crate::utils::http::http_client;

// ── Save Guard types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveGuardInfo {
    pub path_switched: bool,
    pub direction: Option<String>,
    pub had_pairs: bool,
    pub saves_synced: usize,
    pub backups_created: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModToggleResult {
    pub mod_item: InstalledMod,
    pub save_guard: SaveGuardInfo,
}

/// Run save guard logic when mods/ transitions between empty and non-empty.
/// `before_count`: number of enabled mods before the operation.
/// `after_count`: expected number of enabled mods after the operation.
fn run_save_guard(
    before_count: usize,
    after_count: usize,
    settings: &AppSettings,
) -> SaveGuardInfo {
    let was_empty = before_count == 0;
    let will_be_empty = after_count == 0;

    // No path switch — nothing to do
    if was_empty == will_be_empty {
        return SaveGuardInfo::default();
    }

    let direction = if was_empty {
        "vanilla_to_modded"
    } else {
        "modded_to_vanilla"
    };

    let pairs = &settings.save_sync_pairs;
    let had_pairs = !pairs.is_empty();
    let mut backups_created: usize = 0;
    let mut saves_synced: usize = 0;
    let mut error: Option<String> = None;

    let save_svc = SaveService::new();

    // Always try to back up all slots
    match save_svc.backup_all_slots("auto_before_path_switch") {
        Ok(count) => backups_created = count,
        Err(e) => error = Some(format!("Backup failed: {}", e)),
    }

    // Sync using user-configured pairs (if any)
    if had_pairs && error.is_none() {
        match save_svc.sync_by_pairs(pairs, direction) {
            Ok(result) => saves_synced = result.synced_count,
            Err(e) => error = Some(format!("Sync failed: {}", e)),
        }
    }

    // Prune old auto-backups (keep N most recent per kind+slot)
    let _ = save_svc.prune_auto_backups(settings.auto_backup_keep_count);

    SaveGuardInfo {
        path_switched: true,
        direction: Some(direction.to_string()),
        had_pairs,
        saves_synced,
        backups_created,
        error,
    }
}

#[tauri::command]
pub fn get_app_bootstrap(state: State<'_, AppState>) -> Result<AppBootstrapDto, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let game_service = GameService::new(settings.clone());
    let mod_service = ModService::new(settings.clone());

    let detected_game = game_service.detect_install().ok();

    // Auto-persist: if no game_root_dir is configured but we detected one,
    // save it so the user doesn't have to manually click "Auto Detect".
    if settings.game_root_dir.is_none() {
        if let Some(ref game) = detected_game {
            if let Ok(mut w) = state.settings.write() {
                w.game_root_dir = Some(game.root_dir.clone());
                let _ = settings_repo::save_settings(&w);
            }
        }
    }

    let installed = mod_service.list_installed().unwrap_or_default();
    let disabled = mod_service.list_disabled().unwrap_or_default();

    Ok(AppBootstrapDto {
        app_name: "SlaySP2Manager".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        game_directory: detected_game.as_ref().map(|game| game.root_dir.clone()),
        game_directory_valid: detected_game
            .as_ref()
            .map(|game| game.is_valid)
            .unwrap_or(false),
        installed_count: installed.len(),
        disabled_count: disabled.len(),
        active_profile_name: settings.active_profile_name,
        locale: settings.locale,
        save_auto_sync: settings.save_auto_sync,
        save_sync_pairs: settings.save_sync_pairs,
        nexus_api_key: settings.nexus_api_key,
        nexus_is_premium: settings.nexus_is_premium,
        nexus_user_name: settings.nexus_user_name,
        proxy_url: settings.proxy_url,
        auto_backup_keep_count: settings.auto_backup_keep_count,
    })
}

// ── Cloud Save API ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_cloud_save_status() -> Result<CloudSaveStatus, String> {
    SaveService::new().get_cloud_save_status()
}

#[tauri::command]
pub fn list_cloud_save_diff_entries() -> Result<Vec<CloudSaveDiffEntry>, String> {
    SaveService::new().list_cloud_save_diff_entries()
}

#[tauri::command]
pub fn get_cloud_save_diff_detail(relative_path: String) -> Result<CloudSaveDiffDetail, String> {
    SaveService::new().get_cloud_save_diff_detail(&relative_path)
}

#[tauri::command]
pub fn save_cloud_save_diff_content(
    relative_path: String,
    target: CloudSaveDiffSide,
    content: String,
    state: State<'_, AppState>,
) -> Result<CloudSaveDiffDetail, String> {
    let detail = SaveService::new().save_cloud_save_diff_content(
        &relative_path,
        target.clone(),
        &content,
    )?;
    push_activity(
        &state,
        "saves",
        format!("Edited cloud diff file {} on {:?}", relative_path, target),
        Some(relative_path),
    )?;
    Ok(detail)
}

#[tauri::command]
pub fn copy_cloud_save_diff_side(
    relative_path: String,
    source: CloudSaveDiffSide,
    target: CloudSaveDiffSide,
    state: State<'_, AppState>,
) -> Result<CloudSaveDiffDetail, String> {
    let detail = SaveService::new().copy_cloud_save_diff_side(
        &relative_path,
        source.clone(),
        target.clone(),
    )?;
    push_activity(
        &state,
        "saves",
        format!(
            "Copied cloud diff file {} from {:?} to {:?}",
            relative_path, source, target
        ),
        Some(relative_path),
    )?;
    Ok(detail)
}

#[tauri::command]
pub fn get_backup_artifact_status() -> Result<BackupArtifactStatus, String> {
    SaveService::new().get_backup_artifact_status()
}

#[tauri::command]
pub fn cleanup_backup_artifacts(
    state: State<'_, AppState>,
) -> Result<BackupArtifactCleanupResult, String> {
    let result = SaveService::new().cleanup_backup_artifacts()?;
    push_activity(
        &state,
        "saves",
        format!(
            "Cleaned backup artifacts: local {}, cloud {}",
            result.local_removed, result.cloud_removed
        ),
        None,
    )?;
    Ok(result)
}

#[tauri::command]
pub async fn ascend_to_cloud_full(
    allow_steam_running: Option<bool>,
) -> Result<CloudSaveStatus, String> {
    crate::services::save_service::SaveService::new()
        .sync_with_cloud(true, allow_steam_running.unwrap_or(false))
}

#[tauri::command]
pub async fn descend_from_cloud_full(
    allow_steam_running: Option<bool>,
) -> Result<CloudSaveStatus, String> {
    crate::services::save_service::SaveService::new()
        .sync_with_cloud(false, allow_steam_running.unwrap_or(false))
}

#[tauri::command]
pub fn update_game_root_dir(
    game_root_dir: String,
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    let mut settings = state
        .settings
        .write()
        .map_err(|_| "failed to write app settings".to_string())?;

    settings.game_root_dir = if game_root_dir.trim().is_empty() {
        None
    } else {
        Some(game_root_dir.trim().to_string())
    };

    settings_repo::save_settings(&settings)?;
    push_activity(
        &state,
        "settings",
        "Updated game directory",
        settings.game_root_dir.clone(),
    )?;
    Ok(settings.clone())
}

#[tauri::command]
pub fn update_nexus_api_key(
    api_key: String,
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    let mut settings = state
        .settings
        .write()
        .map_err(|_| "failed to write app settings".to_string())?;

    let trimmed = api_key.trim().to_string();

    if trimmed.is_empty() {
        settings.nexus_api_key = None;
        settings.nexus_is_premium = false;
        settings.nexus_user_name = None;
    } else {
        // Validate API key and fetch user info
        let discover = DiscoverService::new(settings.clone());
        let user = discover.validate_user(&trimmed)?;

        settings.nexus_api_key = Some(trimmed);
        settings.nexus_is_premium = user.is_premium.unwrap_or(false);
        settings.nexus_user_name = user.name;
    }

    settings_repo::save_settings(&settings)?;
    push_activity(&state, "settings", "Updated Nexus API key", None)?;
    Ok(settings.clone())
}

#[tauri::command]
pub fn detect_game_install(state: State<'_, AppState>) -> Result<GameInstall, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = GameService::new(settings);
    service.detect_install().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_app_locale(
    locale: String,
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    let normalized = match locale.as_str() {
        "en-US" => "en-US",
        _ => "zh-CN",
    };

    let mut settings = state
        .settings
        .write()
        .map_err(|_| "failed to write app settings".to_string())?;

    settings.locale = normalized.to_string();
    settings_repo::save_settings(&settings)?;
    push_activity(
        &state,
        "settings",
        format!("Updated language to {}", normalized),
        None,
    )?;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn list_installed_mods(state: State<'_, AppState>) -> Result<Vec<InstalledMod>, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    spawn_blocking(move || {
        let service = ModService::new(settings);
        service.list_installed().map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn list_disabled_mods(state: State<'_, AppState>) -> Result<Vec<InstalledMod>, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    spawn_blocking(move || {
        let service = ModService::new(settings);
        service.list_disabled().map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn enable_mod(mod_id: String, state: State<'_, AppState>) -> Result<ModToggleResult, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings.clone());
    let before_count = service.count_enabled().map_err(|e| e.to_string())?;
    let save_guard = run_save_guard(before_count, before_count + 1, &settings);

    let updated = service.enable(&mod_id).map_err(|error| error.to_string())?;
    push_activity(
        &state,
        "mods",
        format!("Enabled {}", updated.name),
        Some(updated.install_dir.clone()),
    )?;
    Ok(ModToggleResult {
        mod_item: updated,
        save_guard,
    })
}

#[tauri::command]
pub fn disable_mod(mod_id: String, state: State<'_, AppState>) -> Result<ModToggleResult, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings.clone());
    let before_count = service.count_enabled().map_err(|e| e.to_string())?;
    let save_guard = run_save_guard(before_count, before_count.saturating_sub(1), &settings);

    let updated = service
        .disable(&mod_id)
        .map_err(|error| error.to_string())?;
    push_activity(
        &state,
        "mods",
        format!("Disabled {}", updated.name),
        Some(updated.install_dir.clone()),
    )?;
    Ok(ModToggleResult {
        mod_item: updated,
        save_guard,
    })
}

#[tauri::command]
pub fn uninstall_mod(mod_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings.clone());

    // Check if the mod being uninstalled is enabled (affects mods/ count)
    let enabled_mods = service.list_installed().map_err(|e| e.to_string())?;
    let is_enabled = enabled_mods
        .iter()
        .any(|m| m.id.eq_ignore_ascii_case(&mod_id));
    let before_count = enabled_mods.len();
    let after_count = if is_enabled {
        before_count.saturating_sub(1)
    } else {
        before_count
    };
    let _save_guard = run_save_guard(before_count, after_count, &settings);

    let removed = service
        .uninstall(&mod_id)
        .map_err(|error| error.to_string())?;
    push_activity(&state, "mods", format!("Uninstalled {}", removed), None)?;
    Ok(removed)
}

#[tauri::command]
pub fn install_archive(
    archive_path: String,
    enable_after_install: bool,
    replace_existing: bool,
    state: State<'_, AppState>,
) -> Result<Vec<InstalledMod>, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings.clone());

    // Guard: if enabling and currently no mods, path will switch
    if enable_after_install {
        let before_count = service.count_enabled().map_err(|e| e.to_string())?;
        if before_count == 0 {
            let _ = run_save_guard(0, 1, &settings);
        }
    }

    let installed = service
        .install_archive(&archive_path, enable_after_install, replace_existing)
        .map_err(|error| error.to_string())?;
    push_activity(
        &state,
        "mods",
        format!("Imported {} mod(s) from archive", installed.len()),
        Some(archive_path),
    )?;
    Ok(installed)
}

#[tauri::command]
pub fn preview_install_archive(
    archive_path: String,
    enable_after_install: bool,
    state: State<'_, AppState>,
) -> Result<ArchiveInstallPreview, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings);
    service
        .preview_install_archive(&archive_path, enable_after_install)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn pick_archive_file() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Archive", &["zip", "7z"])
        .pick_file()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn pick_archive_files() -> Vec<String> {
    rfd::FileDialog::new()
        .add_filter("Archive", &["zip", "7z"])
        .pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

#[tauri::command]
pub fn pick_import_folder() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn process_import_targets(
    paths: Vec<String>,
    enable_after_install: bool,
    state: State<'_, AppState>,
) -> Result<BatchImportPreview, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings);
    service
        .process_import_targets(&paths, enable_after_install)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn batch_install_mods(
    paths: Vec<String>,
    enable_after_install: bool,
    replace_existing: bool,
    selected_mod_ids: Vec<String>,
    conflict_resolutions: std::collections::HashMap<String, String>,
    state: State<'_, AppState>,
) -> Result<BatchInstallResult, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings.clone());

    // Guard: if enabling and currently no mods, path will switch
    if enable_after_install {
        let before_count = service.count_enabled().map_err(|e| e.to_string())?;
        if before_count == 0 {
            let _ = run_save_guard(0, 1, &settings);
        }
    }

    let result = service
        .batch_install(
            &paths,
            enable_after_install,
            replace_existing,
            &selected_mod_ids,
            &conflict_resolutions,
        )
        .map_err(|error| error.to_string())?;

    push_activity(
        &state,
        "mods",
        format!(
            "Batch installed {} mod(s), {} failed",
            result.success_count, result.failure_count
        ),
        None,
    )?;
    Ok(result)
}

#[tauri::command]
pub fn list_activity_logs(state: State<'_, AppState>) -> Result<Vec<ActivityLogEntry>, String> {
    let activity = state
        .recent_activity
        .read()
        .map_err(|_| "failed to read activity logs".to_string())?;
    Ok(activity.clone())
}

#[tauri::command]
pub fn list_save_slots() -> Result<Vec<SaveSlot>, String> {
    SaveService::new().list_slots()
}

#[tauri::command]
pub fn preview_save_transfer(
    source: SaveSlotRef,
    target: SaveSlotRef,
) -> Result<SaveTransferPreview, String> {
    SaveService::new().preview_transfer(source, target)
}

#[tauri::command]
pub fn transfer_save(
    source: SaveSlotRef,
    target: SaveSlotRef,
    state: State<'_, AppState>,
) -> Result<Option<SaveBackupEntry>, String> {
    let backup = SaveService::new().transfer(source.clone(), target.clone())?;
    push_activity(
        &state,
        "saves",
        format!(
            "Transferred {:?} slot {} to {:?} slot {}",
            source.kind, source.slot_index, target.kind, target.slot_index
        ),
        backup.as_ref().map(|item| item.backup_path.clone()),
    )?;
    Ok(backup)
}

#[tauri::command]
pub fn create_save_backup(
    slot: SaveSlotRef,
    state: State<'_, AppState>,
) -> Result<SaveBackupEntry, String> {
    let backup = SaveService::new().backup_slot(slot.clone())?;
    push_activity(
        &state,
        "saves",
        format!(
            "Created backup for {:?} slot {}",
            slot.kind, slot.slot_index
        ),
        Some(backup.backup_path.clone()),
    )?;
    Ok(backup)
}

#[tauri::command]
pub fn list_save_backups() -> Result<Vec<SaveBackupEntry>, String> {
    SaveService::new().list_backups()
}

#[tauri::command]
pub fn restore_save_backup(backup_id: String, state: State<'_, AppState>) -> Result<(), String> {
    SaveService::new().restore_backup(&backup_id)?;
    push_activity(
        &state,
        "saves",
        format!("Restored backup {}", backup_id),
        None,
    )?;
    Ok(())
}

#[tauri::command]
pub async fn search_remote_mods(
    query: String,
    sort_by: String,
    offset: Option<u64>,
    count: Option<u64>,
    state: State<'_, AppState>,
) -> Result<RemoteModSearchResult, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let real_offset = offset.unwrap_or(0);
    let real_count = count.unwrap_or(20);

    spawn_blocking(move || {
        DiscoverService::new(settings).search(&query, &sort_by, real_offset, real_count)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModFileInfo {
    pub file_id: u64,
    pub name: String,
    pub version: String,
    pub category: String,
    pub is_primary: bool,
    pub size_kb: u64,
    pub file_name: String,
}

#[tauri::command]
pub fn get_mod_files(mod_id: u64, state: State<'_, AppState>) -> Result<Vec<ModFileInfo>, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();
    let files = DiscoverService::new(settings).get_mod_files(mod_id)?;
    Ok(files
        .into_iter()
        .map(|f| ModFileInfo {
            file_id: f.file_id,
            name: f.name.unwrap_or_default(),
            version: f.version.unwrap_or_default(),
            category: f.category_name.unwrap_or_default(),
            is_primary: f.is_primary.unwrap_or(false),
            size_kb: f.size_kb.unwrap_or(0),
            file_name: f.file_name.unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub fn get_download_link(
    mod_id: u64,
    file_id: u64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();
    DiscoverService::new(settings).get_download_link(mod_id, file_id)
}

#[tauri::command]
pub fn download_and_install_mod(
    mod_id: u64,
    file_id: u64,
    file_name: String,
    state: State<'_, AppState>,
) -> Result<InstalledMod, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();
    let discover = DiscoverService::new(settings.clone());

    // 1. Get download URL
    let download_url = discover.get_download_link(mod_id, file_id)?;

    // 2. Download the file to a temp directory
    let temp_dir = std::env::temp_dir().join("slaysp2_downloads");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let file_path = temp_dir.join(&file_name);

    let client = http_client(&settings, 300)?;

    let response = client
        .get(&download_url)
        .send()
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download returned status {}", response.status()));
    }

    let bytes = response
        .bytes()
        .map_err(|e| format!("Failed to read response: {}", e))?;
    std::fs::write(&file_path, &bytes).map_err(|e| format!("Failed to save file: {}", e))?;

    // 3. Guard: download always enables, check path switch
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings.clone());
    let before_count = service.count_enabled().map_err(|e| e.to_string())?;
    if before_count == 0 {
        let _ = run_save_guard(0, 1, &settings);
    }

    let installed = service
        .install_archive(file_path.to_str().unwrap_or_default(), true, true)
        .map_err(|e| e.to_string())?;

    // 4. Clean up temp file
    let _ = std::fs::remove_file(&file_path);

    push_activity(
        &state,
        "mods",
        format!(
            "Downloaded and installed mod from Nexus (mod_id: {})",
            mod_id
        ),
        None,
    )?;

    // Return the first installed mod
    installed
        .into_iter()
        .next()
        .ok_or_else(|| "No mods were installed from the archive".to_string())
}

#[tauri::command]
pub fn list_profiles() -> Result<Vec<ModProfile>, String> {
    ProfileService.list()
}

#[tauri::command]
pub fn create_profile(
    name: String,
    description: Option<String>,
    mod_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<ModProfile, String> {
    let profile = ProfileService.create(name, description, mod_ids)?;
    push_activity(
        &state,
        "profiles",
        format!("Created profile {}", profile.name),
        Some(profile.id.clone()),
    )?;
    Ok(profile)
}

#[tauri::command]
pub fn update_profile(
    profile: ModProfile,
    state: State<'_, AppState>,
) -> Result<ModProfile, String> {
    let previous = ProfileService.get(&profile.id)?;
    let updated = ProfileService.update(profile)?;

    {
        let mut settings = state
            .settings
            .write()
            .map_err(|_| "failed to write app settings".to_string())?;
        if settings.active_profile_name == previous.name {
            settings.active_profile_name = updated.name.clone();
            settings_repo::save_settings(&settings)?;
        }
    }

    push_activity(
        &state,
        "profiles",
        format!("Updated profile {}", updated.name),
        Some(updated.id.clone()),
    )?;
    Ok(updated)
}

#[tauri::command]
pub fn delete_profile(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<ModProfile, String> {
    let removed = ProfileService.delete(&profile_id)?;

    {
        let mut settings = state
            .settings
            .write()
            .map_err(|_| "failed to write app settings".to_string())?;
        if settings.active_profile_name == removed.name {
            settings.active_profile_name = "No active profile".to_string();
            settings_repo::save_settings(&settings)?;
        }
    }

    push_activity(
        &state,
        "profiles",
        format!("Deleted profile {}", removed.name),
        Some(removed.id.clone()),
    )?;
    Ok(removed)
}

#[tauri::command]
pub fn apply_profile(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<ApplyProfileResult, String> {
    let settings_snapshot = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    // Pre-compute path switch: how many mods will be enabled after apply?
    let mod_service = ModService::new(settings_snapshot.clone());
    let before_count = mod_service.count_enabled().map_err(|e| e.to_string())?;

    let profile = ProfileService.get(&profile_id)?;
    let all_enabled = mod_service.list_installed().map_err(|e| e.to_string())?;
    let all_disabled = mod_service.list_disabled().map_err(|e| e.to_string())?;
    let all_known: std::collections::HashSet<String> = all_enabled
        .iter()
        .chain(all_disabled.iter())
        .map(|m| m.id.to_lowercase())
        .collect();
    let after_count = profile
        .mod_ids
        .iter()
        .filter(|id| all_known.contains(&id.to_lowercase()))
        .count();

    let _save_guard = run_save_guard(before_count, after_count, &settings_snapshot);

    let result = ProfileService.apply(&profile_id, settings_snapshot)?;

    {
        let mut settings = state
            .settings
            .write()
            .map_err(|_| "failed to write app settings".to_string())?;
        settings.active_profile_name = result.profile.name.clone();
        settings_repo::save_settings(&settings)?;
    }

    push_activity(
        &state,
        "profiles",
        format!("Applied profile {}", result.profile.name),
        Some(result.profile.id.clone()),
    )?;
    Ok(result)
}

#[tauri::command]
pub fn export_profile(profile_id: String) -> Result<Option<String>, String> {
    let profile = ProfileService.get(&profile_id)?;
    let default_name = sanitize_profile_filename(&profile.name);

    let Some(path) = rfd::FileDialog::new()
        .set_file_name(&format!("{default_name}.json"))
        .add_filter("JSON", &["json"])
        .save_file()
    else {
        return Ok(None);
    };

    let content = serde_json::to_string_pretty(&profile).map_err(|error| error.to_string())?;
    std::fs::write(&path, content).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

// ── Preset Bundle: Export ───────────────────────────────────────────────

#[tauri::command]
pub async fn export_preset_bundle(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();
    let app_version = env!("CARGO_PKG_VERSION").to_string();

    spawn_blocking(move || {
        let profile = ProfileService.get(&profile_id)?;
        let _game = GameService::new(settings.clone())
            .detect_install()
            .map_err(|e| e.to_string())?;

        let default_name = sanitize_profile_filename(&profile.name);
        let Some(save_path) = rfd::FileDialog::new()
            .set_file_name(&format!("{default_name}_bundle.zip"))
            .add_filter("ZIP Archive", &["zip"])
            .save_file()
        else {
            return Ok(None);
        };

        let mod_service = ModService::new(settings);
        let enabled = mod_service.list_installed().map_err(|e| e.to_string())?;
        let disabled = mod_service.list_disabled().map_err(|e| e.to_string())?;
        let all_mods: Vec<InstalledMod> = enabled.into_iter().chain(disabled).collect();

        let mut mod_entries: Vec<PresetBundleModEntry> = Vec::new();
        let mut mod_dirs: Vec<(String, std::path::PathBuf)> = Vec::new();

        eprintln!("[bundle] profile has {} mod_ids, all_mods has {} entries", profile.mod_ids.len(), all_mods.len());
        for mod_id in &profile.mod_ids {
            eprintln!("[bundle] looking for mod_id={mod_id:?}");
            if let Some(m) = all_mods
                .iter()
                .find(|item| item.id.eq_ignore_ascii_case(mod_id))
            {
                eprintln!("[bundle] found mod: id={}, folder={}, install_dir={}", m.id, m.folder_name, m.install_dir);
                let dir = std::path::Path::new(&m.install_dir);
                eprintln!("[bundle] install_dir exists={}, is_dir={}", dir.exists(), dir.is_dir());
                mod_entries.push(PresetBundleModEntry {
                    id: m.id.clone(),
                    name: m.name.clone(),
                    version: m.version.clone(),
                    folder_name: m.folder_name.clone(),
                    author: m.author.clone(),
                });
                mod_dirs.push((
                    m.folder_name.clone(),
                    std::path::PathBuf::from(&m.install_dir),
                ));
            }
        }

        let manifest = PresetBundleManifest {
            format_version: 1,
            preset: PresetBundlePresetInfo {
                name: profile.name.clone(),
                description: profile.description.clone(),
                mod_ids: profile.mod_ids.clone(),
            },
            mods: mod_entries,
            exported_at: Utc::now().to_rfc3339(),
            exported_by: format!("SlaySP2Manager v{}", app_version),
        };

        let file = std::fs::File::create(&save_path).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // Write preset.spm
        let manifest_json =
            serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
        zip.start_file("preset.spm", options)
            .map_err(|e| e.to_string())?;
        std::io::Write::write_all(&mut zip, manifest_json.as_bytes())
            .map_err(|e| e.to_string())?;

        // Write mod folders
        for (folder_name, dir_path) in &mod_dirs {
            write_directory_to_zip(&mut zip, dir_path, &format!("mods/{folder_name}"), options)?;
        }

        zip.finish().map_err(|e| e.to_string())?;

        Ok(Some(save_path.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn write_directory_to_zip<W: std::io::Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    source_dir: &std::path::Path,
    prefix: &str,
    options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
    if !source_dir.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(source_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let zip_path = format!("{prefix}/{name}");
        if path.is_dir() {
            write_directory_to_zip(zip, &path, &zip_path, options)?;
        } else {
            zip.start_file(&zip_path, options)
                .map_err(|e| e.to_string())?;
            let data = std::fs::read(&path).map_err(|e| e.to_string())?;
            std::io::Write::write_all(zip, &data).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// ── Preset Bundle: Preview ──────────────────────────────────────────────

#[tauri::command]
pub async fn preview_preset_bundle(
    archive_path: String,
    state: State<'_, AppState>,
) -> Result<PresetBundlePreview, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    spawn_blocking(move || {
        let temp_dir = std::env::temp_dir().join(format!("spm_bundle_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

        // Extract the archive
        let file = std::fs::File::open(&archive_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        archive.extract(&temp_dir).map_err(|e| e.to_string())?;

        // Check for preset.spm
        let spm_path = temp_dir.join("preset.spm");
        if !spm_path.exists() {
            return Ok(PresetBundlePreview {
                has_manifest: false,
                preset_name: None,
                preset_description: None,
                new_mods: Vec::new(),
                conflict_mods: Vec::new(),
                missing_mod_ids: Vec::new(),
                temp_dir: temp_dir.to_string_lossy().to_string(),
            });
        }

        let spm_content = std::fs::read_to_string(&spm_path).map_err(|e| e.to_string())?;
        let manifest: PresetBundleManifest =
            serde_json::from_str(&spm_content).map_err(|e| e.to_string())?;

        // List existing local mods
        let mod_service = ModService::new(settings);
        let enabled = mod_service.list_installed().map_err(|e| e.to_string())?;
        let disabled = mod_service.list_disabled().map_err(|e| e.to_string())?;
        let existing_ids: std::collections::HashSet<String> = enabled
            .iter()
            .chain(disabled.iter())
            .map(|m| m.id.to_lowercase())
            .collect();
        let existing_folders: std::collections::HashSet<String> = enabled
            .iter()
            .chain(disabled.iter())
            .map(|m| m.folder_name.to_lowercase())
            .collect();

        let mods_dir = temp_dir.join("mods");
        let mut new_mods = Vec::new();
        let mut conflict_mods = Vec::new();
        let mut found_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

        for mod_entry in &manifest.mods {
            let folder_path = mods_dir.join(&mod_entry.folder_name);
            if !folder_path.is_dir() {
                continue;
            }
            found_ids.insert(mod_entry.id.to_lowercase());

            let is_conflict = existing_ids.contains(&mod_entry.id.to_lowercase())
                || existing_folders.contains(&mod_entry.folder_name.to_lowercase());

            let preview_mod = PresetBundlePreviewMod {
                id: mod_entry.id.clone(),
                name: mod_entry.name.clone(),
                folder_name: mod_entry.folder_name.clone(),
                conflict: is_conflict,
            };

            if is_conflict {
                conflict_mods.push(preview_mod);
            } else {
                new_mods.push(preview_mod);
            }
        }

        let missing_mod_ids: Vec<String> = manifest
            .preset
            .mod_ids
            .iter()
            .filter(|id| !found_ids.contains(&id.to_lowercase()))
            .cloned()
            .collect();

        Ok(PresetBundlePreview {
            has_manifest: true,
            preset_name: Some(manifest.preset.name),
            preset_description: manifest.preset.description,
            new_mods,
            conflict_mods,
            missing_mod_ids,
            temp_dir: temp_dir.to_string_lossy().to_string(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Preset Bundle: Confirm Import ───────────────────────────────────────

#[tauri::command]
pub async fn confirm_import_preset_bundle(
    temp_dir: String,
    conflict_resolutions: std::collections::HashMap<String, String>,
    state: State<'_, AppState>,
) -> Result<PresetBundleImportResult, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    spawn_blocking(move || {
        let temp_path = std::path::PathBuf::from(&temp_dir);
        let spm_path = temp_path.join("preset.spm");
        let spm_content = std::fs::read_to_string(&spm_path).map_err(|e| e.to_string())?;
        let manifest: PresetBundleManifest =
            serde_json::from_str(&spm_content).map_err(|e| e.to_string())?;

        let game = GameService::new(settings.clone())
            .detect_install()
            .map_err(|e| e.to_string())?;
        let mods_target = std::path::PathBuf::from(&game.mods_dir);

        let mod_service = ModService::new(settings);
        let enabled = mod_service.list_installed().map_err(|e| e.to_string())?;
        let disabled = mod_service.list_disabled().map_err(|e| e.to_string())?;
        let existing_ids: std::collections::HashSet<String> = enabled
            .iter()
            .chain(disabled.iter())
            .map(|m| m.id.to_lowercase())
            .collect();
        let existing_folders: std::collections::HashSet<String> = enabled
            .iter()
            .chain(disabled.iter())
            .map(|m| m.folder_name.to_lowercase())
            .collect();

        let mods_source = temp_path.join("mods");
        let mut installed_count: usize = 0;
        let mut skipped_count: usize = 0;
        let mut failed_count: usize = 0;
        let mut actual_mod_ids: Vec<String> = Vec::new();

        for mod_entry in &manifest.mods {
            let source = mods_source.join(&mod_entry.folder_name);
            if !source.is_dir() {
                skipped_count += 1;
                continue;
            }

            let is_conflict = existing_ids.contains(&mod_entry.id.to_lowercase())
                || existing_folders.contains(&mod_entry.folder_name.to_lowercase());

            if is_conflict {
                let resolution = conflict_resolutions
                    .get(&mod_entry.id)
                    .map(|s| s.as_str())
                    .unwrap_or("skip");
                if resolution == "skip" {
                    skipped_count += 1;
                    // Still include in preset mod_ids since the local copy is used
                    actual_mod_ids.push(mod_entry.id.clone());
                    continue;
                }
                // Replace: remove existing first
                if let Some(existing) = enabled
                    .iter()
                    .chain(disabled.iter())
                    .find(|m| m.id.eq_ignore_ascii_case(&mod_entry.id))
                {
                    let _ = std::fs::remove_dir_all(&existing.install_dir);
                }
            }

            let target = mods_target.join(&mod_entry.folder_name);
            match copy_dir_recursive(&source, &target) {
                Ok(()) => {
                    installed_count += 1;
                    actual_mod_ids.push(mod_entry.id.clone());
                }
                Err(_) => {
                    failed_count += 1;
                }
            }
        }

        // Create profile with a unique name
        let profile_svc = ProfileService;
        let profiles = profile_svc.list().unwrap_or_default();
        let mut preset_name = manifest.preset.name.clone();
        let base_name = preset_name.clone();
        let mut suffix = 2u32;
        while profiles
            .iter()
            .any(|p| p.name.eq_ignore_ascii_case(&preset_name))
        {
            preset_name = format!("{} ({})", base_name, suffix);
            suffix += 1;
        }

        let _ = profile_svc.create(
            preset_name.clone(),
            manifest.preset.description.clone(),
            actual_mod_ids,
        );

        // Cleanup temp directory
        let _ = std::fs::remove_dir_all(&temp_path);

        Ok(PresetBundleImportResult {
            preset_name,
            installed_count,
            skipped_count,
            failed_count,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let target = dst.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// ── Preset Bundle: Pick file ────────────────────────────────────────────

#[tauri::command]
pub fn pick_preset_bundle() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("ZIP Archive", &["zip"])
        .pick_file()
        .map(|path| path.to_string_lossy().to_string())
}

fn push_activity(
    state: &State<'_, AppState>,
    category: impl Into<String>,
    title: impl Into<String>,
    detail: Option<String>,
) -> Result<(), String> {
    let mut activity = state
        .recent_activity
        .write()
        .map_err(|_| "failed to write activity logs".to_string())?;

    activity.insert(
        0,
        ActivityLogEntry {
            id: Uuid::new_v4().to_string(),
            category: category.into(),
            title: title.into(),
            detail,
            created_at: Utc::now().to_rfc3339(),
        },
    );

    if activity.len() > 20 {
        activity.truncate(20);
    }

    Ok(())
}

fn sanitize_profile_filename(name: &str) -> String {
    let mut output = String::new();

    for ch in name.chars() {
        if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
            output.push('_');
        } else {
            output.push(ch);
        }
    }

    let trimmed = output.trim();
    if trimmed.is_empty() {
        "profile".to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
pub fn launch_game() -> Result<(), String> {
    let steam_url = "steam://rungameid/2868840";

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", steam_url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(steam_url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(steam_url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn open_mods_directory(state: State<'_, AppState>) -> Result<(), String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let game_service = crate::services::game_service::GameService::new(settings);
    let detected_game = game_service.detect_install().map_err(|e| e.to_string())?;

    let path = std::path::Path::new(&detected_game.mods_dir);
    if path.exists() {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    } else {
        return Err("Mods directory does not exist".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn open_mod_folder(mod_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings);
    let installed = service.list_installed().unwrap_or_default();
    let disabled = service.list_disabled().unwrap_or_default();

    let found = installed
        .into_iter()
        .chain(disabled)
        .find(|m| m.id == mod_id)
        .ok_or_else(|| "Mod not found".to_string())?;

    let path = std::path::Path::new(&found.install_dir);
    if path.exists() {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    } else {
        return Err("Mod directory does not exist".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn open_path_in_explorer(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg("/select,")
                .arg(p.as_os_str())
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg("-R")
                .arg(p.as_os_str())
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(p.parent().unwrap_or(p))
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    } else {
        return Err("Path does not exist".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn open_url_in_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_save_auto_sync(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    let mut settings = state
        .settings
        .write()
        .map_err(|_| "failed to write app settings".to_string())?;

    settings.save_auto_sync = enabled;
    settings_repo::save_settings(&settings)?;
    Ok(settings.clone())
}

#[tauri::command]
pub fn update_save_sync_pairs(
    pairs: Vec<SaveSyncPair>,
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    let mut settings = state
        .settings
        .write()
        .map_err(|_| "failed to write app settings".to_string())?;

    settings.save_sync_pairs = pairs;
    settings_repo::save_settings(&settings)?;
    Ok(settings.clone())
}

#[tauri::command]
pub fn sync_saves(state: State<'_, AppState>) -> Result<SaveSyncResult, String> {
    let pairs = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .save_sync_pairs
        .clone();

    let svc = SaveService::new();
    let result = svc.sync_saves(&pairs)?;
    if result.synced_count > 0 {
        push_activity(
            &state,
            "saves",
            format!("Synced {} save slot(s)", result.synced_count),
            None,
        )?;
        // Prune old auto-backups after sync
        let keep = state
            .settings
            .read()
            .map(|s| s.auto_backup_keep_count)
            .unwrap_or(5);
        let _ = svc.prune_auto_backups(keep);
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_save_backup(id: String) -> Result<(), String> {
    let service = SaveService::new();
    let backups = service.list_backups().map_err(|e| e.to_string())?;
    if let Some(backup) = backups.iter().find(|b| b.id == id) {
        if std::path::Path::new(&backup.backup_path).exists() {
            if backup.backup_path.ends_with(".zip") {
                std::fs::remove_file(&backup.backup_path).map_err(|e| e.to_string())?;
            } else {
                std::fs::remove_dir_all(&backup.backup_path).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn update_proxy_url(
    proxy_url: String,
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    let mut settings = state
        .settings
        .write()
        .map_err(|_| "failed to write app settings".to_string())?;

    settings.proxy_url = if proxy_url.trim().is_empty() {
        None
    } else {
        Some(proxy_url.trim().to_string())
    };

    settings_repo::save_settings(&settings)?;
    Ok(settings.clone())
}

#[tauri::command]
pub fn update_auto_backup_keep_count(
    count: usize,
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    let clamped = count.clamp(1, 50);
    let mut settings = state
        .settings
        .write()
        .map_err(|_| "failed to write app settings".to_string())?;

    settings.auto_backup_keep_count = clamped;
    settings_repo::save_settings(&settings)?;

    // Immediately prune to new limit
    let _ = SaveService::new().prune_auto_backups(clamped);

    Ok(settings.clone())
}

#[tauri::command]
pub fn test_proxy(proxy_url: String) -> Result<String, String> {
    let trimmed = proxy_url.trim();
    if trimmed.is_empty() {
        return Err("Proxy URL is empty".to_string());
    }

    let proxy = reqwest::Proxy::all(trimmed).map_err(|e| format!("Invalid proxy URL: {}", e))?;

    let client = reqwest::blocking::Client::builder()
        .proxy(proxy)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get("https://api.github.com")
        .header("User-Agent", "SlaySP2Manager")
        .send()
        .map_err(|e| format!("Proxy connection failed: {}", e))?;

    Ok(format!("OK ({})", response.status()))
}
