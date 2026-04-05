use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;

use chrono::{DateTime, Utc};
use filetime::{set_file_mtime, FileTime};
use sha1::{Digest, Sha1};

use crate::domain::save::{
    BackupArtifactCleanupResult, BackupArtifactStatus, CloudSaveDiffDetail, CloudSaveDiffEntry,
    CloudSaveDiffKind, CloudSaveDiffSide, CloudSaveDiffSideDetail, CloudSaveStatus,
    SaveBackupEntry, SaveKind, SaveSlot, SaveSlotRef, SaveSyncDetail, SaveSyncPair, SaveSyncResult,
    SaveTransferPreview,
};

pub struct SaveService;
const STEAM_ID64_OFFSET: u64 = 76561197960265728;
const SLAY_THE_SPIRE_2_APP_ID: &str = "2868840";
const MAX_INLINE_DIFF_BYTES: u64 = 512 * 1024;

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
                "Target slot already has data. A backup will be created before overwrite."
                    .to_string()
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

            let Some(folder_name) = path
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
            else {
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
            return Ok(SaveSyncResult {
                synced_count: 0,
                details: Vec::new(),
            });
        }

        let slots = self.list_slots()?;
        let mut details = Vec::new();

        // Get first steam user id (single-user app)
        let uid = match slots.first() {
            Some(s) => s.steam_user_id.clone(),
            None => {
                return Ok(SaveSyncResult {
                    synced_count: 0,
                    details: Vec::new(),
                })
            }
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
            } else {
                (
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
        Ok(SaveSyncResult {
            synced_count,
            details,
        })
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
            let key = format!(
                "{}_{}",
                match b.kind {
                    SaveKind::Vanilla => "v",
                    SaveKind::Modded => "m",
                },
                b.slot_index
            );
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
    /// This performs a conservative sync between the full local storage
    /// (Vanilla + Modded) and the Steam Cloud remote cache directory.
    ///
    /// Steam maintains additional cache metadata next to `remote/`, so direct
    /// external writes must avoid destructive mirroring. Ascend therefore
    /// merges local files into the cache instead of clearing it first.
    /// Will ALWAYS create a full backup of all data-bearing slots before proceeding.
    pub fn sync_with_cloud(
        &self,
        ascend: bool,
        allow_steam_running: bool,
    ) -> Result<CloudSaveStatus, String> {
        ensure_cloud_sync_processes_are_safe(allow_steam_running)?;

        let account_id = crate::integrations::steam::get_current_steam_account_id()
            .ok_or_else(|| "error.activeUserNotFound".to_string())?;

        let steam_id_64 = steam_id64_from_account_id(account_id);

        let cloud_app_dir = crate::integrations::steam::find_cloud_app_dir()
            .ok_or_else(|| "error.cloudSaveNotFound".to_string())?;
        let cloud_dir = cloud_app_dir.join("remote");

        // The correct mapping is APPDATA/SlayTheSpire2/steam/<SteamID64>/ -> Steam/userdata/<Account_ID>/2868840/remote/
        let local_root = save_root()?.join(steam_id_64.to_string());

        if ascend && !local_root.exists() {
            return Err("error.localSaveNotFound".to_string());
        }

        // Perform auto backups unconditionally before any destructive full-sync.
        let reason = if ascend {
            "auto_before_cloud_ascend"
        } else {
            "auto_before_cloud_descend"
        };
        let _ = self.backup_all_slots(reason);
        let _ = backup_cloud_app_dir(&cloud_app_dir, account_id, reason);

        if ascend {
            // Merge Local into Cloud cache without deleting remote-only files.
            // Removing files from `remote/` while `remotecache.vdf` still tracks
            // them causes Steam to treat the cache as stale and re-download them.
            merge_directory_contents(&local_root, &cloud_dir)?;
            finalize_cloud_cache_sync(&cloud_app_dir, &cloud_dir, &local_root, &cloud_dir)?;
        } else {
            // Overwrite Local with Cloud
            replace_directory_contents(&cloud_dir, &local_root)?;
            finalize_cloud_cache_sync(&cloud_app_dir, &cloud_dir, &cloud_dir, &local_root)?;
        }

        self.get_cloud_save_status()
    }

    pub fn get_cloud_save_status(&self) -> Result<CloudSaveStatus, String> {
        let local_root = crate::integrations::steam::get_current_steam_account_id()
            .map(|account_id| {
                save_root()
                    .map(|root| root.join(steam_id64_from_account_id(account_id).to_string()))
            })
            .transpose()?;
        let cloud_dir = crate::integrations::steam::find_cloud_save_dir();

        let mut status = CloudSaveStatus {
            local_path: local_root
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            cloud_path: cloud_dir
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            is_available: cloud_dir.is_some(),
            ..CloudSaveStatus::default()
        };

        let Some(local_root) = local_root else {
            return Ok(status);
        };

        let Some(cloud_dir) = cloud_dir else {
            return Ok(status);
        };

        let local_files = collect_save_file_snapshots(&local_root)?;
        let cloud_files = collect_save_file_snapshots(&cloud_dir)?;

        status.local_file_count = local_files.len();
        status.cloud_file_count = cloud_files.len();

        for (relative_path, local_file) in &local_files {
            match cloud_files.get(relative_path) {
                Some(cloud_file) if cloud_file.sha != local_file.sha => {
                    status.different_count += 1;
                    push_sample_path(
                        &mut status.sample_paths,
                        format!("different: {relative_path}"),
                    );
                }
                Some(_) => {}
                None => {
                    status.local_only_count += 1;
                    push_sample_path(
                        &mut status.sample_paths,
                        format!("local-only: {relative_path}"),
                    );
                }
            }
        }

        for relative_path in cloud_files.keys() {
            if !local_files.contains_key(relative_path) {
                status.cloud_only_count += 1;
                push_sample_path(
                    &mut status.sample_paths,
                    format!("cloud-only: {relative_path}"),
                );
            }
        }

        status.has_mismatch = status.local_only_count > 0
            || status.cloud_only_count > 0
            || status.different_count > 0;
        status.local_applied_to_cloud = status.local_only_count == 0 && status.different_count == 0;
        status.cloud_applied_to_local = status.cloud_only_count == 0 && status.different_count == 0;

        Ok(status)
    }

    pub fn list_cloud_save_diff_entries(&self) -> Result<Vec<CloudSaveDiffEntry>, String> {
        let roots = active_cloud_paths()?;
        let local_files = collect_save_file_snapshots(&roots.local_root)?;
        let cloud_files = collect_save_file_snapshots(&roots.cloud_dir)?;
        Ok(build_cloud_diff_entries(&local_files, &cloud_files))
    }

    pub fn get_cloud_save_diff_detail(
        &self,
        relative_path: &str,
    ) -> Result<CloudSaveDiffDetail, String> {
        let roots = active_cloud_paths()?;
        let normalized_path = sanitize_relative_diff_path(relative_path)?;
        let local_path = roots.local_root.join(&normalized_path);
        let cloud_path = roots.cloud_dir.join(&normalized_path);
        let local = read_cloud_diff_side(&local_path)?;
        let cloud = read_cloud_diff_side(&cloud_path)?;

        Ok(CloudSaveDiffDetail {
            relative_path: normalize_relative_path(&normalized_path),
            kind: classify_cloud_diff_kind(local.sha.as_deref(), cloud.sha.as_deref()),
            local,
            cloud,
        })
    }

    pub fn save_cloud_save_diff_content(
        &self,
        relative_path: &str,
        target: CloudSaveDiffSide,
        content: &str,
    ) -> Result<CloudSaveDiffDetail, String> {
        let roots = active_cloud_paths()?;
        let normalized_path = sanitize_relative_diff_path(relative_path)?;
        match target {
            CloudSaveDiffSide::Local => ensure_local_save_mutation_is_safe()?,
            CloudSaveDiffSide::Cloud => ensure_cloud_cache_mutation_is_safe()?,
        }
        let target_path = match target {
            CloudSaveDiffSide::Local => roots.local_root.join(&normalized_path),
            CloudSaveDiffSide::Cloud => roots.cloud_dir.join(&normalized_path),
        };

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        fs::write(&target_path, content.as_bytes()).map_err(|error| error.to_string())?;

        if target == CloudSaveDiffSide::Cloud {
            rebuild_remote_cache_vdf(&roots.cloud_app_dir, &roots.cloud_dir)?;
        }

        self.get_cloud_save_diff_detail(&normalize_relative_path(&normalized_path))
    }

    pub fn copy_cloud_save_diff_side(
        &self,
        relative_path: &str,
        source: CloudSaveDiffSide,
        target: CloudSaveDiffSide,
    ) -> Result<CloudSaveDiffDetail, String> {
        let roots = active_cloud_paths()?;
        let normalized_path = sanitize_relative_diff_path(relative_path)?;
        match target {
            CloudSaveDiffSide::Local => ensure_local_save_mutation_is_safe()?,
            CloudSaveDiffSide::Cloud => ensure_cloud_cache_mutation_is_safe()?,
        }
        let source_path = match source {
            CloudSaveDiffSide::Local => roots.local_root.join(&normalized_path),
            CloudSaveDiffSide::Cloud => roots.cloud_dir.join(&normalized_path),
        };
        let target_path = match target {
            CloudSaveDiffSide::Local => roots.local_root.join(&normalized_path),
            CloudSaveDiffSide::Cloud => roots.cloud_dir.join(&normalized_path),
        };

        if !source_path.exists() {
            return Err("source diff side does not exist".to_string());
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        fs::copy(&source_path, &target_path).map_err(|error| error.to_string())?;
        let metadata = fs::metadata(&source_path).map_err(|error| error.to_string())?;
        let modified = FileTime::from_last_modification_time(&metadata);
        set_file_mtime(&target_path, modified).map_err(|error| error.to_string())?;

        if target == CloudSaveDiffSide::Cloud {
            rebuild_remote_cache_vdf(&roots.cloud_app_dir, &roots.cloud_dir)?;
        }

        self.get_cloud_save_diff_detail(&normalize_relative_path(&normalized_path))
    }

    pub fn get_backup_artifact_status(&self) -> Result<BackupArtifactStatus, String> {
        let roots = active_cloud_paths()?;
        Ok(BackupArtifactStatus {
            local_count: collect_backup_artifact_paths(&roots.local_root)?.len(),
            cloud_count: collect_backup_artifact_paths(&roots.cloud_dir)?.len(),
        })
    }

    pub fn cleanup_backup_artifacts(&self) -> Result<BackupArtifactCleanupResult, String> {
        Err("Cloud backup artifact cleanup has been disabled because Slay the Spire 2 still expects these files during Steam cloud sync.".to_string())
    }
}

#[derive(Debug, Clone)]
struct ActiveCloudPaths {
    local_root: PathBuf,
    cloud_app_dir: PathBuf,
    cloud_dir: PathBuf,
}

#[derive(Debug, Clone)]
struct FileSnapshot {
    size: u64,
    sha: String,
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

fn cloud_backups_root() -> Result<PathBuf, String> {
    let app_data = env::var("APPDATA").map_err(|_| "APPDATA not available".to_string())?;
    Ok(PathBuf::from(app_data)
        .join("SlaySP2Manager")
        .join("backups")
        .join("cloud_cache"))
}

fn steam_id64_from_account_id(account_id: u32) -> u64 {
    (account_id as u64) + STEAM_ID64_OFFSET
}

fn active_cloud_paths() -> Result<ActiveCloudPaths, String> {
    let account_id = crate::integrations::steam::get_current_steam_account_id()
        .ok_or_else(|| "error.activeUserNotFound".to_string())?;
    let cloud_app_dir = crate::integrations::steam::find_cloud_app_dir()
        .ok_or_else(|| "error.cloudSaveNotFound".to_string())?;

    Ok(ActiveCloudPaths {
        local_root: save_root()?.join(steam_id64_from_account_id(account_id).to_string()),
        cloud_dir: cloud_app_dir.join("remote"),
        cloud_app_dir,
    })
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
        SaveKind::Modded => base
            .join("modded")
            .join(format!("profile{slot_index}"))
            .join("saves"),
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
    let backup_id = format!(
        "{kind_code}_{}_{}_{}",
        slot.steam_user_id, slot.slot_index, timestamp
    );
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
            fs::remove_dir_all(&path)
                .map_err(|error| format!("clear_dir remove_dir error: {}", error))?;
        } else {
            fs::remove_file(&path)
                .map_err(|error| format!("clear_dir remove_file error: {}", error))?;
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

fn merge_directory_contents(source: &Path, target: &Path) -> Result<(), String> {
    if !source.exists() {
        return Err("source directory does not exist".to_string());
    }

    if !target.exists() {
        fs::create_dir_all(target).map_err(|error| error.to_string())?;
    }

    copy_directory_contents(source, target)
}

#[derive(Debug, Clone)]
struct RemoteCacheHeader {
    change_number: String,
    ostype: String,
}

impl Default for RemoteCacheHeader {
    fn default() -> Self {
        Self {
            change_number: "0".to_string(),
            ostype: "0".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
struct RemoteCacheFileEntry {
    relative_path: String,
    size: u64,
    modified_time: u64,
    sha: String,
}

fn finalize_cloud_cache_sync(
    cloud_app_dir: &Path,
    cloud_dir: &Path,
    timestamp_source_root: &Path,
    timestamp_target_root: &Path,
) -> Result<(), String> {
    sync_matching_file_timestamps(timestamp_source_root, timestamp_target_root)?;
    rebuild_remote_cache_vdf(cloud_app_dir, cloud_dir)
}

fn sync_matching_file_timestamps(source_root: &Path, target_root: &Path) -> Result<(), String> {
    if !source_root.exists() || !target_root.exists() {
        return Ok(());
    }

    let mut relative_dir = PathBuf::new();
    sync_matching_file_timestamps_inner(source_root, target_root, &mut relative_dir)
}

fn sync_matching_file_timestamps_inner(
    current_source_dir: &Path,
    target_root: &Path,
    relative_dir: &mut PathBuf,
) -> Result<(), String> {
    for entry in fs::read_dir(current_source_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let child_path = entry.path();
        let file_name = entry.file_name();

        relative_dir.push(&file_name);
        if child_path.is_dir() {
            sync_matching_file_timestamps_inner(&child_path, target_root, relative_dir)?;
        } else {
            let target_path = target_root.join(&*relative_dir);
            if target_path.exists() {
                let metadata = fs::metadata(&child_path).map_err(|error| error.to_string())?;
                let modified = FileTime::from_last_modification_time(&metadata);
                set_file_mtime(&target_path, modified).map_err(|error| error.to_string())?;
            }
        }
        relative_dir.pop();
    }

    Ok(())
}

fn rebuild_remote_cache_vdf(cloud_app_dir: &Path, cloud_dir: &Path) -> Result<(), String> {
    let vdf_path = cloud_app_dir.join("remotecache.vdf");
    let header = read_remote_cache_header(&vdf_path)?;
    let entries = collect_remote_cache_entries(cloud_dir)?;

    if entries.is_empty() {
        if vdf_path.exists() {
            fs::remove_file(&vdf_path).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }

    let app_id = cloud_app_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(SLAY_THE_SPIRE_2_APP_ID);
    let content = render_remote_cache_vdf(app_id, &header, &entries);
    fs::write(&vdf_path, content).map_err(|error| error.to_string())
}

fn read_remote_cache_header(vdf_path: &Path) -> Result<RemoteCacheHeader, String> {
    if !vdf_path.exists() {
        return Ok(RemoteCacheHeader::default());
    }

    let content = fs::read_to_string(vdf_path).map_err(|error| error.to_string())?;
    let mut header = RemoteCacheHeader::default();

    for line in content.lines() {
        let Some((key, value)) = parse_vdf_string_pair(line) else {
            continue;
        };

        match key.as_str() {
            "ChangeNumber" => header.change_number = value,
            "ostype" => header.ostype = value,
            _ => {}
        }
    }

    Ok(header)
}

fn collect_remote_cache_entries(root: &Path) -> Result<Vec<RemoteCacheFileEntry>, String> {
    let mut entries = Vec::new();
    let mut relative_dir = PathBuf::new();
    collect_remote_cache_entries_inner(root, &mut relative_dir, &mut entries)?;
    entries.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(entries)
}

fn collect_remote_cache_entries_inner(
    current_dir: &Path,
    relative_dir: &mut PathBuf,
    entries: &mut Vec<RemoteCacheFileEntry>,
) -> Result<(), String> {
    if !current_dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(current_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_name = entry.file_name();
        let child_path = entry.path();

        relative_dir.push(&file_name);
        if child_path.is_dir() {
            collect_remote_cache_entries_inner(&child_path, relative_dir, entries)?;
        } else {
            let metadata = fs::metadata(&child_path).map_err(|error| error.to_string())?;
            entries.push(RemoteCacheFileEntry {
                relative_path: normalize_relative_path(relative_dir),
                size: metadata.len(),
                modified_time: file_modified_time_secs(&metadata)?,
                sha: sha1_file(&child_path)?,
            });
        }
        relative_dir.pop();
    }

    Ok(())
}

fn file_modified_time_secs(metadata: &fs::Metadata) -> Result<u64, String> {
    let modified = metadata.modified().map_err(|error| error.to_string())?;
    let duration = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?;
    Ok(duration.as_secs())
}

fn render_remote_cache_vdf(
    app_id: &str,
    header: &RemoteCacheHeader,
    entries: &[RemoteCacheFileEntry],
) -> String {
    let mut content = String::new();
    content.push_str(&format!("\"{}\"\r\n{{\r\n", escape_vdf_value(app_id)));
    content.push_str(&format!(
        "\t\"ChangeNumber\"\t\t\"{}\"\r\n",
        escape_vdf_value(&header.change_number)
    ));
    content.push_str(&format!(
        "\t\"ostype\"\t\t\"{}\"\r\n",
        escape_vdf_value(&header.ostype)
    ));

    for entry in entries {
        let modified_time = entry.modified_time.to_string();
        let size = entry.size.to_string();
        content.push_str(&format!(
            "\t\"{}\"\r\n\t{{\r\n",
            escape_vdf_value(&entry.relative_path)
        ));
        content.push_str("\t\t\"root\"\t\t\"0\"\r\n");
        content.push_str(&format!(
            "\t\t\"size\"\t\t\"{}\"\r\n",
            escape_vdf_value(&size)
        ));
        content.push_str(&format!(
            "\t\t\"localtime\"\t\t\"{}\"\r\n",
            escape_vdf_value(&modified_time)
        ));
        content.push_str(&format!(
            "\t\t\"time\"\t\t\"{}\"\r\n",
            escape_vdf_value(&modified_time)
        ));
        content.push_str(&format!(
            "\t\t\"remotetime\"\t\t\"{}\"\r\n",
            escape_vdf_value(&modified_time)
        ));
        content.push_str(&format!(
            "\t\t\"sha\"\t\t\"{}\"\r\n",
            escape_vdf_value(&entry.sha)
        ));
        content.push_str("\t\t\"syncstate\"\t\t\"1\"\r\n");
        content.push_str("\t\t\"persiststate\"\t\t\"0\"\r\n");
        content.push_str("\t\t\"platformstosync2\"\t\t\"-1\"\r\n");
        content.push_str("\t}\r\n");
    }

    content.push_str("}\r\n");
    content
}

fn parse_vdf_string_pair(line: &str) -> Option<(String, String)> {
    let parts = line.split('"').collect::<Vec<_>>();
    if parts.len() < 4 {
        return None;
    }

    Some((parts[1].to_string(), parts[3].to_string()))
}

fn escape_vdf_value(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn collect_save_file_snapshots(root: &Path) -> Result<BTreeMap<String, FileSnapshot>, String> {
    let mut files = BTreeMap::new();
    let mut relative_root = PathBuf::new();
    collect_save_file_snapshots_inner(root, &mut relative_root, &mut files)?;
    Ok(files)
}

fn collect_save_file_snapshots_inner(
    current_dir: &Path,
    relative_dir: &mut PathBuf,
    files: &mut BTreeMap<String, FileSnapshot>,
) -> Result<(), String> {
    if !current_dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(current_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_name = entry.file_name();
        let child_name = file_name.to_string_lossy().to_string();
        let child_path = entry.path();

        if child_path.is_dir() {
            if should_ignore_directory_name(&child_name) {
                continue;
            }

            relative_dir.push(&file_name);
            collect_save_file_snapshots_inner(&child_path, relative_dir, files)?;
            relative_dir.pop();
            continue;
        }

        let metadata = fs::metadata(&child_path).map_err(|error| error.to_string())?;
        relative_dir.push(&file_name);
        let relative_path = normalize_relative_path(relative_dir);
        files.insert(
            relative_path,
            FileSnapshot {
                size: metadata.len(),
                sha: sha1_file(&current_dir.join(&file_name))?,
            },
        );
        relative_dir.pop();
    }

    Ok(())
}

fn build_cloud_diff_entries(
    local_files: &BTreeMap<String, FileSnapshot>,
    cloud_files: &BTreeMap<String, FileSnapshot>,
) -> Vec<CloudSaveDiffEntry> {
    let mut entries = Vec::new();

    for (relative_path, local_file) in local_files {
        match cloud_files.get(relative_path) {
            Some(cloud_file) if cloud_file.sha != local_file.sha => {
                entries.push(CloudSaveDiffEntry {
                    relative_path: relative_path.clone(),
                    kind: CloudSaveDiffKind::Different,
                    local_exists: true,
                    cloud_exists: true,
                    local_size: Some(local_file.size),
                    cloud_size: Some(cloud_file.size),
                    local_sha: Some(local_file.sha.clone()),
                    cloud_sha: Some(cloud_file.sha.clone()),
                })
            }
            Some(_) => {}
            None => entries.push(CloudSaveDiffEntry {
                relative_path: relative_path.clone(),
                kind: CloudSaveDiffKind::LocalOnly,
                local_exists: true,
                cloud_exists: false,
                local_size: Some(local_file.size),
                cloud_size: None,
                local_sha: Some(local_file.sha.clone()),
                cloud_sha: None,
            }),
        }
    }

    for (relative_path, cloud_file) in cloud_files {
        if local_files.contains_key(relative_path) {
            continue;
        }

        entries.push(CloudSaveDiffEntry {
            relative_path: relative_path.clone(),
            kind: CloudSaveDiffKind::CloudOnly,
            local_exists: false,
            cloud_exists: true,
            local_size: None,
            cloud_size: Some(cloud_file.size),
            local_sha: None,
            cloud_sha: Some(cloud_file.sha.clone()),
        });
    }

    entries.sort_by(|left, right| {
        mismatch_kind_rank(&left.kind)
            .cmp(&mismatch_kind_rank(&right.kind))
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });
    entries
}

fn mismatch_kind_rank(kind: &CloudSaveDiffKind) -> u8 {
    match kind {
        CloudSaveDiffKind::Different => 0,
        CloudSaveDiffKind::LocalOnly => 1,
        CloudSaveDiffKind::CloudOnly => 2,
        CloudSaveDiffKind::InSync => 3,
    }
}

fn metadata_modified_at(metadata: &fs::Metadata) -> Option<String> {
    metadata.modified().ok().map(|time| {
        let datetime: DateTime<Utc> = time.into();
        datetime.to_rfc3339()
    })
}

fn classify_cloud_diff_kind(local_sha: Option<&str>, cloud_sha: Option<&str>) -> CloudSaveDiffKind {
    match (local_sha, cloud_sha) {
        (Some(left), Some(right)) if left == right => CloudSaveDiffKind::InSync,
        (Some(_), Some(_)) => CloudSaveDiffKind::Different,
        (Some(_), None) => CloudSaveDiffKind::LocalOnly,
        (None, Some(_)) => CloudSaveDiffKind::CloudOnly,
        (None, None) => CloudSaveDiffKind::InSync,
    }
}

fn read_cloud_diff_side(path: &Path) -> Result<CloudSaveDiffSideDetail, String> {
    if !path.exists() {
        return Ok(CloudSaveDiffSideDetail {
            path: path.to_string_lossy().to_string(),
            exists: false,
            is_text: true,
            size: None,
            sha: None,
            modified_at: None,
            text_content: None,
        });
    }

    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let size = metadata.len();
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let is_text = size <= MAX_INLINE_DIFF_BYTES && std::str::from_utf8(&bytes).is_ok();
    let text_content = if is_text {
        Some(String::from_utf8(bytes).map_err(|error| error.to_string())?)
    } else {
        None
    };

    Ok(CloudSaveDiffSideDetail {
        path: path.to_string_lossy().to_string(),
        exists: true,
        is_text,
        size: Some(size),
        sha: Some(sha1_file(path)?),
        modified_at: metadata_modified_at(&metadata),
        text_content,
    })
}

fn sanitize_relative_diff_path(relative_path: &str) -> Result<PathBuf, String> {
    let candidate = relative_path.replace('\\', "/");
    let mut normalized = PathBuf::new();

    for component in Path::new(&candidate).components() {
        use std::path::Component;

        match component {
            Component::Normal(part) => normalized.push(part),
            Component::CurDir => {}
            _ => return Err("invalid relative path".to_string()),
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err("relative path cannot be empty".to_string());
    }

    Ok(normalized)
}

fn collect_backup_artifact_paths(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut results = Vec::new();
    collect_backup_artifact_paths_inner(root, &mut results)?;
    results.sort();
    Ok(results)
}

fn collect_backup_artifact_paths_inner(
    root: &Path,
    results: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();

        if path.is_dir() {
            collect_backup_artifact_paths_inner(&path, results)?;
            continue;
        }

        let is_backup = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase().ends_with(".backup"))
            .unwrap_or(false);

        if is_backup {
            results.push(path);
        }
    }

    Ok(())
}

fn should_ignore_directory_name(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".bak")
}

fn normalize_relative_path(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
}

fn sha1_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha1::new();
    let mut buffer = [0_u8; 8192];

    loop {
        let read_bytes = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read_bytes == 0 {
            break;
        }
        hasher.update(&buffer[..read_bytes]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn push_sample_path(samples: &mut Vec<String>, value: String) {
    const MAX_SAMPLE_PATHS: usize = 10;

    if samples.len() < MAX_SAMPLE_PATHS {
        samples.push(value);
    }
}

fn backup_cloud_app_dir(source: &Path, account_id: u32, reason: &str) -> Result<PathBuf, String> {
    if !source.exists() {
        return Err("cloud app directory does not exist".to_string());
    }

    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_dir =
        cloud_backups_root()?.join(format!("account_{}_{}_{}", account_id, timestamp, reason));

    copy_directory_contents(source, &backup_dir)?;
    Ok(backup_dir)
}

fn ensure_cloud_sync_processes_are_safe(allow_steam_running: bool) -> Result<(), String> {
    if is_process_running("SlayTheSpire2.exe") {
        return Err("error.closeGameBeforeCloudSync".to_string());
    }

    if !allow_steam_running && is_process_running("Steam.exe") {
        return Err("error.steamRunningBeforeCloudSync".to_string());
    }

    Ok(())
}

fn ensure_local_save_mutation_is_safe() -> Result<(), String> {
    if is_process_running("SlayTheSpire2.exe") {
        return Err("error.closeGameBeforeCloudSync".to_string());
    }

    Ok(())
}

fn ensure_cloud_cache_mutation_is_safe() -> Result<(), String> {
    ensure_cloud_sync_processes_are_safe(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_vdf_string_pair_extracts_key_value() {
        let pair = parse_vdf_string_pair("\t\"ChangeNumber\"\t\t\"74\"").unwrap();
        assert_eq!(pair.0, "ChangeNumber");
        assert_eq!(pair.1, "74");
    }

    #[test]
    fn render_remote_cache_vdf_keeps_header_and_paths() {
        let header = RemoteCacheHeader {
            change_number: "74".to_string(),
            ostype: "0".to_string(),
        };
        let entries = vec![RemoteCacheFileEntry {
            relative_path: "modded/profile1/saves/progress.save".to_string(),
            size: 149_979,
            modified_time: 1_775_347_786,
            sha: "07cb7f746cf5e46f01fc9eaec8e30a4690dec4ba".to_string(),
        }];

        let rendered = render_remote_cache_vdf(SLAY_THE_SPIRE_2_APP_ID, &header, &entries);

        assert!(rendered.contains("\"2868840\""));
        assert!(rendered.contains("\"ChangeNumber\"\t\t\"74\""));
        assert!(rendered.contains("\"modded/profile1/saves/progress.save\""));
        assert!(rendered.contains("\"sha\"\t\t\"07cb7f746cf5e46f01fc9eaec8e30a4690dec4ba\""));
    }
}

#[cfg(target_os = "windows")]
fn is_process_running(image_name: &str) -> bool {
    let output = Command::new("tasklist")
        .args([
            "/FI",
            &format!("IMAGENAME eq {image_name}"),
            "/FO",
            "CSV",
            "/NH",
        ])
        .output();

    let Ok(output) = output else {
        return false;
    };

    if !output.status.success() {
        return false;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
    stdout.contains(&image_name.to_ascii_lowercase())
}

#[cfg(not(target_os = "windows"))]
fn is_process_running(_image_name: &str) -> bool {
    false
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
        id: format!(
            "{}_{}_{}_{}",
            parts[0], steam_user_id, slot_index, created_at
        ),
        steam_user_id,
        kind,
        slot_index,
        backup_path: path.to_string_lossy().to_string(),
        created_at,
        reason,
    })
}
