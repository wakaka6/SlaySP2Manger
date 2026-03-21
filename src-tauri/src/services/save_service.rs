use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};

use crate::domain::save::{SaveBackupEntry, SaveKind, SaveSlot, SaveSlotRef, SaveTransferPreview};

pub struct SaveService;

impl SaveService {
    pub fn new() -> Self {
        Self
    }

    pub fn list_slots(&self) -> Result<Vec<SaveSlot>, String> {
        let save_root = save_root()?;
        if !save_root.exists() {
            return Ok(Vec::new());
        }

        let mut slots = Vec::new();
        for steam_dir in fs::read_dir(save_root).map_err(|error| error.to_string())? {
            let steam_dir = match steam_dir {
                Ok(entry) => entry.path(),
                Err(_) => continue,
            };
            if !steam_dir.is_dir() {
                continue;
            }

            let steam_user_id = steam_dir
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string());

            for slot_index in 1..=3 {
                slots.push(scan_slot(
                    &steam_dir,
                    &steam_user_id,
                    SaveKind::Vanilla,
                    slot_index,
                ));
                slots.push(scan_slot(
                    &steam_dir,
                    &steam_user_id,
                    SaveKind::Modded,
                    slot_index,
                ));
            }
        }

        Ok(slots)
    }

    pub fn preview_transfer(
        &self,
        source: SaveSlotRef,
        target: SaveSlotRef,
    ) -> Result<SaveTransferPreview, String> {
        let source_path = slot_path(&source)?;
        let target_path = slot_path(&target)?;

        let source_has_data = source_path.join("progress.save").exists();
        let target_has_data = target_path.join("progress.save").exists();

        Ok(SaveTransferPreview {
            source,
            target,
            source_has_data,
            target_has_data,
            backup_will_be_created: target_has_data,
            summary: if target_has_data {
                "Target slot already has data. A backup will be created before overwrite.".to_string()
            } else {
                "Target slot is empty. Files will be copied directly.".to_string()
            },
        })
    }

    pub fn transfer(
        &self,
        source: SaveSlotRef,
        target: SaveSlotRef,
    ) -> Result<Option<SaveBackupEntry>, String> {
        let source_path = slot_path(&source)?;
        let target_path = slot_path(&target)?;

        if !source_path.join("progress.save").exists() {
            return Err("source slot does not contain a save".to_string());
        }

        let backup = if target_path.join("progress.save").exists() {
            Some(create_backup_from_slot(&target, "auto_before_transfer")?)
        } else {
            None
        };

        replace_directory_contents(&source_path, &target_path)?;
        Ok(backup)
    }

    pub fn backup_slot(&self, slot: SaveSlotRef) -> Result<SaveBackupEntry, String> {
        let path = slot_path(&slot)?;
        if !path.join("progress.save").exists() {
            return Err("selected slot does not contain a save".to_string());
        }

        create_backup_from_slot(&slot, "manual_backup")
    }

    pub fn list_backups(&self) -> Result<Vec<SaveBackupEntry>, String> {
        let root = backups_root()?;
        if !root.exists() {
            return Ok(Vec::new());
        }

        let mut backups = Vec::new();
        for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
            let entry = match entry {
                Ok(value) => value,
                Err(_) => continue,
            };
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let Some(folder_name) = path.file_name().map(|value| value.to_string_lossy().to_string()) else {
                continue;
            };

            if let Some(parsed) = parse_backup_folder_name(&folder_name, &path) {
                backups.push(parsed);
            }
        }

        backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(backups)
    }

    pub fn restore_backup(&self, backup_id: &str) -> Result<(), String> {
        let backups = self.list_backups()?;
        let backup = backups
            .into_iter()
            .find(|item| item.id == backup_id)
            .ok_or_else(|| "backup not found".to_string())?;

        let slot = SaveSlotRef {
            steam_user_id: backup.steam_user_id.clone(),
            kind: backup.kind.clone(),
            slot_index: backup.slot_index,
        };

        let target = slot_path(&slot)?;
        let backup_path = PathBuf::from(&backup.backup_path);
        replace_directory_contents(&backup_path, &target)?;
        Ok(())
    }
}

fn save_root() -> Result<PathBuf, String> {
    let app_data = env::var("APPDATA").map_err(|_| "APPDATA not available".to_string())?;
    Ok(PathBuf::from(app_data).join("SlayTheSpire2").join("steam"))
}

fn backups_root() -> Result<PathBuf, String> {
    let app_data = env::var("APPDATA").map_err(|_| "APPDATA not available".to_string())?;
    Ok(PathBuf::from(app_data)
        .join("SlaySP2Manager")
        .join("backups")
        .join("saves"))
}

fn slot_path(slot: &SaveSlotRef) -> Result<PathBuf, String> {
    let root = save_root()?;
    Ok(match slot.kind {
        SaveKind::Vanilla => root
            .join(&slot.steam_user_id)
            .join(format!("profile{}", slot.slot_index))
            .join("saves"),
        SaveKind::Modded => root
            .join(&slot.steam_user_id)
            .join("modded")
            .join(format!("profile{}", slot.slot_index))
            .join("saves"),
    })
}

fn scan_slot(base: &Path, steam_user_id: &str, kind: SaveKind, slot_index: u8) -> SaveSlot {
    let path = match kind {
        SaveKind::Vanilla => base.join(format!("profile{slot_index}")).join("saves"),
        SaveKind::Modded => base.join("modded").join(format!("profile{slot_index}")).join("saves"),
    };

    let files = fs::read_dir(&path)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .collect::<Vec<_>>();

    let progress = path.join("progress.save");
    let current_run = path.join("current_run.save");
    let last_modified_at = fs::metadata(&progress)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .map(|time| {
            let datetime: DateTime<Utc> = time.into();
            datetime.to_rfc3339()
        });

    SaveSlot {
        steam_user_id: steam_user_id.to_string(),
        kind,
        slot_index,
        path: path.to_string_lossy().to_string(),
        has_data: progress.exists(),
        has_current_run: current_run.exists(),
        file_count: files.len(),
        last_modified_at,
    }
}

fn create_backup_from_slot(slot: &SaveSlotRef, reason: &str) -> Result<SaveBackupEntry, String> {
    let source = slot_path(slot)?;
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let kind_code = match slot.kind {
        SaveKind::Vanilla => "vanilla",
        SaveKind::Modded => "modded",
    };
    let backup_id = format!("{kind_code}_{}_{}_{}", slot.steam_user_id, slot.slot_index, timestamp);
    let backup_dir = backups_root()?.join(format!(
        "{kind_code}_{}_{}_{}_{}",
        slot.steam_user_id, slot.slot_index, timestamp, reason
    ));

    copy_directory_contents(&source, &backup_dir)?;

    Ok(SaveBackupEntry {
        id: backup_id,
        steam_user_id: slot.steam_user_id.clone(),
        kind: slot.kind.clone(),
        slot_index: slot.slot_index,
        backup_path: backup_dir.to_string_lossy().to_string(),
        created_at: Utc::now().to_rfc3339(),
        reason: reason.to_string(),
    })
}

fn copy_directory_contents(source: &Path, target: &Path) -> Result<(), String> {
    if !source.exists() {
        return Err("source directory does not exist".to_string());
    }

    fs::create_dir_all(target).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());

        if source_path.is_dir() {
            copy_directory_contents(&source_path, &target_path)?;
        } else {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            fs::copy(&source_path, &target_path).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn replace_directory_contents(source: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        fs::remove_dir_all(target).map_err(|error| error.to_string())?;
    }
    copy_directory_contents(source, target)
}

fn parse_backup_folder_name(folder_name: &str, path: &Path) -> Option<SaveBackupEntry> {
    let parts = folder_name.split('_').collect::<Vec<_>>();
    if parts.len() < 5 {
        return None;
    }

    let kind = match parts[0] {
        "vanilla" => SaveKind::Vanilla,
        "modded" => SaveKind::Modded,
        _ => return None,
    };

    let steam_user_id = parts[1].to_string();
    let slot_index = parts[2].parse::<u8>().ok()?;
    let created_at = format!("{}_{}", parts[3], parts[4]);
    let reason = if parts.len() > 5 {
        parts[5..].join("_")
    } else {
        "backup".to_string()
    };

    Some(SaveBackupEntry {
        id: format!("{}_{}_{}_{}", parts[0], steam_user_id, slot_index, created_at),
        steam_user_id,
        kind,
        slot_index,
        backup_path: path.to_string_lossy().to_string(),
        created_at,
        reason,
    })
}
