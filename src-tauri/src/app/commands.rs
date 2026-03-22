use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::app::bootstrap::AppBootstrapDto;
use crate::app::state::{AppSettings, AppState};
use crate::domain::game::GameInstall;
use crate::domain::install_plan::{ArchiveInstallPreview, BatchImportPreview, BatchInstallResult};
use crate::domain::mod_entity::InstalledMod;
use crate::domain::profile::{ApplyProfileResult, ModProfile};
use crate::domain::remote_mod::RemoteModSearchResult;
use crate::domain::save::{SaveBackupEntry, SaveSlot, SaveSlotRef, SaveSyncPair, SaveSyncResult, SaveTransferPreview};
use crate::domain::task::ActivityLogEntry;
use crate::integrations::settings_repo;
use crate::services::discover_service::DiscoverService;
use crate::services::game_service::GameService;
use crate::services::mod_service::ModService;
use crate::services::profile_service::ProfileService;
use crate::services::save_service::SaveService;
use crate::utils::http::http_client;

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
        game_directory_valid: detected_game.as_ref().map(|game| game.is_valid).unwrap_or(false),
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
    })
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
    push_activity(
        &state,
        "settings",
        "Updated Nexus API key",
        None,
    )?;
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
pub fn update_app_locale(locale: String, state: State<'_, AppState>) -> Result<AppSettings, String> {
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
pub fn list_installed_mods(state: State<'_, AppState>) -> Result<Vec<InstalledMod>, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings);
    service.list_installed().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_disabled_mods(state: State<'_, AppState>) -> Result<Vec<InstalledMod>, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings);
    service.list_disabled().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn enable_mod(mod_id: String, state: State<'_, AppState>) -> Result<InstalledMod, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings);
    let updated = service.enable(&mod_id).map_err(|error| error.to_string())?;
    push_activity(
        &state,
        "mods",
        format!("Enabled {}", updated.name),
        Some(updated.install_dir.clone()),
    )?;
    Ok(updated)
}

#[tauri::command]
pub fn disable_mod(mod_id: String, state: State<'_, AppState>) -> Result<InstalledMod, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings);
    let updated = service.disable(&mod_id).map_err(|error| error.to_string())?;
    push_activity(
        &state,
        "mods",
        format!("Disabled {}", updated.name),
        Some(updated.install_dir.clone()),
    )?;
    Ok(updated)
}

#[tauri::command]
pub fn uninstall_mod(mod_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings);
    let removed = service.uninstall(&mod_id).map_err(|error| error.to_string())?;
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

    let service = ModService::new(settings);
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
    state: State<'_, AppState>,
) -> Result<BatchInstallResult, String> {
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings);
    let result = service
        .batch_install(&paths, enable_after_install, replace_existing, &selected_mod_ids)
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
        format!("Created backup for {:?} slot {}", slot.kind, slot.slot_index),
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
pub fn search_remote_mods(
    query: String,
    sort_by: String,
    offset: Option<u64>,
    count: Option<u64>,
    state: State<'_, AppState>,
) -> Result<RemoteModSearchResult, String> {
    let settings = state.settings.read().map_err(|_| "failed to read app settings".to_string())?.clone();
    DiscoverService::new(settings).search(&query, &sort_by, offset.unwrap_or(0), count.unwrap_or(20))
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
    let settings = state.settings.read().map_err(|_| "failed to read app settings".to_string())?.clone();
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
pub fn get_download_link(mod_id: u64, file_id: u64, state: State<'_, AppState>) -> Result<String, String> {
    let settings = state.settings.read().map_err(|_| "failed to read app settings".to_string())?.clone();
    DiscoverService::new(settings).get_download_link(mod_id, file_id)
}

#[tauri::command]
pub fn download_and_install_mod(
    mod_id: u64,
    file_id: u64,
    file_name: String,
    state: State<'_, AppState>,
) -> Result<InstalledMod, String> {
    let settings = state.settings.read().map_err(|_| "failed to read app settings".to_string())?.clone();
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

    let bytes = response.bytes().map_err(|e| format!("Failed to read response: {}", e))?;
    std::fs::write(&file_path, &bytes).map_err(|e| format!("Failed to save file: {}", e))?;

    // 3. Install using existing ModService logic
    let settings = state
        .settings
        .read()
        .map_err(|_| "failed to read app settings".to_string())?
        .clone();

    let service = ModService::new(settings);
    let installed = service
        .install_archive(file_path.to_str().unwrap_or_default(), true, true)
        .map_err(|e| e.to_string())?;

    // 4. Clean up temp file
    let _ = std::fs::remove_file(&file_path);

    push_activity(
        &state,
        "mods",
        format!("Downloaded and installed mod from Nexus (mod_id: {})", mod_id),
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
pub fn update_profile(profile: ModProfile, state: State<'_, AppState>) -> Result<ModProfile, String> {
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
pub fn delete_profile(profile_id: String, state: State<'_, AppState>) -> Result<ModProfile, String> {
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

    let result = SaveService::new().sync_saves(&pairs)?;
    if result.synced_count > 0 {
        push_activity(
            &state,
            "saves",
            format!("Synced {} save slot(s)", result.synced_count),
            None,
        )?;
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
pub fn test_proxy(
    proxy_url: String,
) -> Result<String, String> {
    let trimmed = proxy_url.trim();
    if trimmed.is_empty() {
        return Err("Proxy URL is empty".to_string());
    }

    let proxy = reqwest::Proxy::all(trimmed)
        .map_err(|e| format!("Invalid proxy URL: {}", e))?;

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
