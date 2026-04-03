use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};

use crate::domain::save::{
    SaveBackupEntry, SaveKind, SaveSlot, SaveSlotRef, SaveSyncDetail, SaveSyncPair,
    SaveSyncResult, SaveTransferPreview,
};

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
        let source_saves = slot_path(&source)?;
        let target_saves = slot_path(&target)?;

        if !source_saves.join("progress.save").exists() {
            return Err("source slot does not contain a save".to_string());
        }

        let backup = if target_saves.join("progress.save").exists() {
            Some(create_backup_from_slot(&target, "auto_before_transfer")?)
        } else {
            None
        };

        // Copy at profile level to include replay/ and other sibling directories
        let source_profile = profile_dir_path(&source)?;
        let target_profile = profile_dir_path(&target)?;
        replace_directory_contents(&source_profile, &target_profile)?;
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

    /// Bidirectional sync: for each configured pair, copy the newer save to the older one.
    pub fn sync_saves(&self, pairs: &[SaveSyncPair]) -> Result<SaveSyncResult, String> {
        if pairs.is_empty() {
            return Ok(SaveSyncResult { synced_count: 0, details: Vec::new() });
        }

        let slots = self.list_slots()?;
        let mut details = Vec::new();

        // Get first steam user id (single-user app)
        let uid = match slots.first() {
            Some(s) => s.steam_user_id.clone(),
            None => return Ok(SaveSyncResult { synced_count: 0, details: Vec::new() }),
        };

        for pair in pairs {
            let vanilla = slots.iter().find(|s| {
                s.steam_user_id == uid
                    && s.kind == SaveKind::Vanilla
                    && s.slot_index == pair.vanilla_slot
            });
            let modded = slots.iter().find(|s| {
                s.steam_user_id == uid
                    && s.kind == SaveKind::Modded
                    && s.slot_index == pair.modded_slot
            });

            let (vanilla, modded) = match (vanilla, modded) {
                (Some(v), Some(m)) => (v, m),
                _ => continue,
            };

            if !vanilla.has_data && !modded.has_data {
                continue;
            }

            let v_time = vanilla.last_modified_at.as_deref().unwrap_or("");
            let m_time = modded.last_modified_at.as_deref().unwrap_or("");

            let direction = if vanilla.has_data && !modded.has_data {
                "vanilla_to_modded"
            } else if modded.has_data && !vanilla.has_data {
                "modded_to_vanilla"
            } else if v_time > m_time {
                "vanilla_to_modded"
            } else if m_time > v_time {
                "modded_to_vanilla"
            } else {
                continue;
            };

            let (source_ref, target_ref) = if direction == "vanilla_to_modded" {
                (
                    SaveSlotRef { steam_user_id: uid.clone(), kind: SaveKind::Vanilla, slot_index: pair.vanilla_slot },
                    SaveSlotRef { steam_user_id: uid.clone(), kind: SaveKind::Modded, slot_index: pair.modded_slot },
                )
            } else {
                (
                    SaveSlotRef { steam_user_id: uid.clone(), kind: SaveKind::Modded, slot_index: pair.modded_slot },
                    SaveSlotRef { steam_user_id: uid.clone(), kind: SaveKind::Vanilla, slot_index: pair.vanilla_slot },
                )
            };

            let target_saves = slot_path(&target_ref)?;

            let backup_created = if target_saves.join("progress.save").exists() {
                create_backup_from_slot(&target_ref, "auto_before_sync")?;
                true
            } else {
                false
            };

            // Copy at profile level to include replay/ and other sibling directories
            let source_profile = profile_dir_path(&source_ref)?;
            let target_profile = profile_dir_path(&target_ref)?;
            replace_directory_contents(&source_profile, &target_profile)?;

            details.push(SaveSyncDetail {
                slot_index: pair.vanilla_slot,
                direction: direction.to_string(),
                backup_created,
            });
        }

        let synced_count = details.len();
        Ok(SaveSyncResult { synced_count, details })
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

        let target_profile = profile_dir_path(&slot)?;
        let backup_path = PathBuf::from(&backup.backup_path);
        replace_directory_contents(&backup_path, &target_profile)?;
        Ok(())
    }

    /// Backup all slots that have data (both vanilla and modded).
    /// Returns the number of backups created.
    pub fn backup_all_slots(&self, reason: &str) -> Result<usize, String> {
        let slots = self.list_slots()?;
        let mut count = 0;

        for slot in &slots {
            if !slot.has_data {
                continue;
            }
            let slot_ref = SaveSlotRef {
                steam_user_id: slot.steam_user_id.clone(),
                kind: slot.kind.clone(),
                slot_index: slot.slot_index,
            };
            create_backup_from_slot(&slot_ref, reason)?;
            count += 1;
        }

        Ok(count)
    }

    /// Remove old auto-backups, keeping only the most recent `keep` per kind+slot.
    /// Manual backups (reason == "manual_backup") are never pruned.
    pub fn prune_auto_backups(&self, keep: usize) -> Result<usize, String> {
        let backups = self.list_backups()?; // already sorted newest-first
        let mut groups: std::collections::HashMap<String, Vec<&SaveBackupEntry>> =
            std::collections::HashMap::new();

        for b in &backups {
            if b.reason == "manual_backup" || b.reason == "backup" {
                continue; // never prune manual backups
            }
            let key = format!("{}_{}", match b.kind { SaveKind::Vanilla => "v", SaveKind::Modded => "m" }, b.slot_index);
            groups.entry(key).or_default().push(b);
        }

        let mut removed = 0;
        for (_key, entries) in &groups {
            if entries.len() <= keep {
                continue;
            }
            for old in &entries[keep..] {
                let path = PathBuf::from(&old.backup_path);
                if path.exists() {
                    let _ = fs::remove_dir_all(&path);
                    removed += 1;
                }
            }
        }

        Ok(removed)
    }

    /// Directional sync using user-configured pairs.
    ///
    /// `direction` determines source/target mapping:
    /// - `"modded_to_vanilla"` — source = modded, target = vanilla
    /// - `"vanilla_to_modded"` — source = vanilla, target = modded
    ///
    /// For each pair: backs up both sides first, then copies source→target
    /// only if source has data AND is newer than target (or target is empty).
    pub fn sync_by_pairs(
        &self,
        pairs: &[SaveSyncPair],
        direction: &str,
    ) -> Result<SaveSyncResult, String> {
        if pairs.is_empty() {
            return Ok(SaveSyncResult {
                synced_count: 0,
                details: Vec::new(),
            });
        }

        let slots = self.list_slots()?;
        let uid = match slots.first() {
            Some(s) => s.steam_user_id.clone(),
            None => {
                return Ok(SaveSyncResult {
                    synced_count: 0,
                    details: Vec::new(),
                })
            }
        };

        let mut details = Vec::new();

        for pair in pairs {
            let vanilla = slots.iter().find(|s| {
                s.steam_user_id == uid
                    && s.kind == SaveKind::Vanilla
                    && s.slot_index == pair.vanilla_slot
            });
            let modded = slots.iter().find(|s| {
                s.steam_user_id == uid
                    && s.kind == SaveKind::Modded
                    && s.slot_index == pair.modded_slot
            });

            let (vanilla, modded) = match (vanilla, modded) {
                (Some(v), Some(m)) => (v, m),
                _ => continue,
            };

            // Back up both sides first (if they have data)
            if vanilla.has_data {
                let _ = create_backup_from_slot(
                    &SaveSlotRef {
                        steam_user_id: uid.clone(),
                        kind: SaveKind::Vanilla,
                        slot_index: pair.vanilla_slot,
                    },
                    "auto_before_path_switch",
                );
            }
            if modded.has_data {
                let _ = create_backup_from_slot(
                    &SaveSlotRef {
                        steam_user_id: uid.clone(),
                        kind: SaveKind::Modded,
                        slot_index: pair.modded_slot,
                    },
                    "auto_before_path_switch",
                );
            }

            // Determine source/target based on direction
            let (source, target, source_ref, target_ref) = if direction == "modded_to_vanilla" {
                (
                    modded,
                    vanilla,
                    SaveSlotRef {
                        steam_user_id: uid.clone(),
                        kind: SaveKind::Modded,
                        slot_index: pair.modded_slot,
                    },
                    SaveSlotRef {
                        steam_user_id: uid.clone(),
                        kind: SaveKind::Vanilla,
                        slot_index: pair.vanilla_slot,
                    },
                )
            } else {
                (
                    vanilla,
                    modded,
                    SaveSlotRef {
                        steam_user_id: uid.clone(),
                        kind: SaveKind::Vanilla,
                        slot_index: pair.vanilla_slot,
                    },
                    SaveSlotRef {
                        steam_user_id: uid.clone(),
                        kind: SaveKind::Modded,
                        slot_index: pair.modded_slot,
                    },
                )
            };

            // Skip if source has no data
            if !source.has_data {
                continue;
            }

            // Compare timestamps: only copy if source is newer (or target is empty)
            let should_copy = if !target.has_data {
                true
            } else {
                let s_time = source.last_modified_at.as_deref().unwrap_or("");
                let t_time = target.last_modified_at.as_deref().unwrap_or("");
                s_time > t_time
            };

            if should_copy {
                // Copy at profile level to include replay/ and other sibling directories
                let source_profile = profile_dir_path(&source_ref)?;
                let target_profile = profile_dir_path(&target_ref)?;
                replace_directory_contents(&source_profile, &target_profile)?;

                details.push(SaveSyncDetail {
                    slot_index: pair.vanilla_slot,
                    direction: direction.to_string(),
                    backup_created: true,
                });
            }
        }

        let synced_count = details.len();
        Ok(SaveSyncResult {
            synced_count,
            details,
        })
    }

    /// Holistic cloud synchronization.
    /// `ascend`: 
    ///   - true: Ascend to Cloud (Overwrite Cloud with Local)
    ///   - false: Descend from Cloud (Overwrite Local with Cloud)
    /// 
    /// This performs a FULL sync of the entire local storage (Vanilla + Modded)
    /// and the Steam Cloud remote directory, treating them as mirrors.
    /// Will ALWAYS create a full backup of all data-bearing slots before proceeding.
    pub fn sync_with_cloud(&self, ascend: bool) -> Result<(), String> {
        let account_id = crate::integrations::steam::get_current_steam_account_id()
             .ok_or_else(|| "error.activeUserNotFound".to_string())?;

        let steam_id_64 = (account_id as u64) + 76561197960265728;

        let cloud_dir = crate::integrations::steam::find_cloud_save_dir()
            .ok_or_else(|| "error.cloudSaveNotFound".to_string())?;

        // The correct mapping is APPDATA/SlayTheSpire2/steam/<SteamID64>/ -> Steam/userdata/<Account_ID>/2868840/remote/
        let local_root = save_root()?.join(steam_id_64.to_string());
        
        if ascend && !local_root.exists() {
            return Err("error.localSaveNotFound".to_string());
        }

        // Perform auto backups unconditionally before any destructive full-sync.
        let reason = if ascend { "auto_before_cloud_ascend" } else { "auto_before_cloud_descend" };
        let _ = self.backup_all_slots(reason);

        if ascend {
            // Overwrite Cloud with Local
            replace_directory_contents(&local_root, &cloud_dir)?;
        } else {
            // Overwrite Local with Cloud
            replace_directory_contents(&cloud_dir, &local_root)?;
        }

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

/// Returns profileN/saves/ — used for checking progress.save existence.
fn slot_path(slot: &SaveSlotRef) -> Result<PathBuf, String> {
    Ok(profile_dir_path(slot)?.join("saves"))
}

/// Returns profileN/ — used for copy/backup/sync operations
/// so that replay/ and other sibling directories are included.
fn profile_dir_path(slot: &SaveSlotRef) -> Result<PathBuf, String> {
    let root = save_root()?;
    Ok(match slot.kind {
        SaveKind::Vanilla => root
            .join(&slot.steam_user_id)
            .join(format!("profile{}", slot.slot_index)),
        SaveKind::Modded => root
            .join(&slot.steam_user_id)
            .join("modded")
            .join(format!("profile{}", slot.slot_index)),
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
    // Backup at profile level to include replay/ and other sibling directories
    let source = profile_dir_path(slot)?;
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

fn clear_directory_contents(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|error| format!("clear_dir read error: {}", error))? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|error| format!("clear_dir remove_dir error: {}", error))?;
        } else {
            fs::remove_file(&path).map_err(|error| format!("clear_dir remove_file error: {}", error))?;
        }
    }
    Ok(())
}

fn replace_directory_contents(source: &Path, target: &Path) -> Result<(), String> {
    if !target.exists() {
        fs::create_dir_all(target).map_err(|error| error.to_string())?;
    } else {
        clear_directory_contents(target)?;
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
    // Convert YYYYMMDD_HHMMSS to RFC3339 so frontend can parse it correctly
    let date_part = parts[3];
    let time_part = parts[4];
    if date_part.len() < 8 || time_part.len() < 6 {
        return None;
    }
    let created_at = format!(
        "{}-{}-{}T{}:{}:{}+00:00",
        &date_part[..4],
        &date_part[4..6],
        &date_part[6..8],
        &time_part[..2],
        &time_part[2..4],
        &time_part[4..6]
    );
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
