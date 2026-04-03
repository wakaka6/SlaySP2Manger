use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::app::state::AppSettings;
use crate::domain::game::GameInstall;
use crate::domain::install_plan::{
    ArchiveInstallItemPreview, ArchiveInstallPreview,
    BatchImportPreview, BatchInstallItemResult, BatchInstallResult,
    DiscoveredMod, DiscoveredModSourceType, DiscoveredModStatus,
};
use crate::domain::mod_entity::{InstalledMod, InstalledModState};
use crate::integrations::filesystem::list_directories;
use crate::integrations::manifest::{find_manifest_path, read_manifest};
use crate::services::game_service::GameService;
use crate::utils::error::AppError;
use uuid::Uuid;
use zip::read::ZipArchive;

#[derive(Debug, Clone)]
pub struct ModService {
    settings: AppSettings,
}

impl ModService {
    pub fn new(settings: AppSettings) -> Self {
        Self { settings }
    }

    pub fn list_installed(&self) -> Result<Vec<InstalledMod>, AppError> {
        let game = self.resolve_game()?;
        Ok(scan_mod_directory(
            Path::new(&game.mods_dir),
            InstalledModState::Enabled,
        ))
    }

    pub fn list_disabled(&self) -> Result<Vec<InstalledMod>, AppError> {
        let game = self.resolve_game()?;
        Ok(scan_mod_directory(
            Path::new(&game.disabled_mods_dir),
            InstalledModState::Disabled,
        ))
    }

    /// Returns the number of currently enabled mods (folders inside mods/).
    pub fn count_enabled(&self) -> Result<usize, AppError> {
        let game = self.resolve_game()?;
        Ok(scan_mod_directory(Path::new(&game.mods_dir), InstalledModState::Enabled).len())
    }

    pub fn enable(&self, mod_id: &str) -> Result<InstalledMod, AppError> {
        let game = self.resolve_game()?;
        move_mod(
            Path::new(&game.disabled_mods_dir),
            Path::new(&game.mods_dir),
            mod_id,
            InstalledModState::Enabled,
        )
    }

    pub fn disable(&self, mod_id: &str) -> Result<InstalledMod, AppError> {
        let game = self.resolve_game()?;
        move_mod(
            Path::new(&game.mods_dir),
            Path::new(&game.disabled_mods_dir),
            mod_id,
            InstalledModState::Disabled,
        )
    }

    pub fn uninstall(&self, mod_id: &str) -> Result<String, AppError> {
        let game = self.resolve_game()?;
        let enabled = scan_mod_directory(Path::new(&game.mods_dir), InstalledModState::Enabled);
        let disabled =
            scan_mod_directory(Path::new(&game.disabled_mods_dir), InstalledModState::Disabled);

        if let Some(found) = enabled
            .into_iter()
            .chain(disabled)
            .find(|item| item.id.eq_ignore_ascii_case(mod_id))
        {
            fs::remove_dir_all(&found.install_dir)
                .map_err(|error| AppError::Io(error.to_string()))?;
            return Ok(found.id);
        }

        Err(AppError::ModNotFound(mod_id.to_string()))
    }

    pub fn install_archive(
        &self,
        archive_path: &str,
        enable_after_install: bool,
        replace_existing: bool,
    ) -> Result<Vec<InstalledMod>, AppError> {
        let game = self.resolve_game()?;
        let archive = PathBuf::from(archive_path);
        let unpacked = unpack_archive(&archive)?;
        let result = (|| -> Result<Vec<InstalledMod>, AppError> {
            let preview =
                build_archive_preview(&game, archive_path, enable_after_install, &unpacked.mod_dirs);

            if preview.has_conflicts && !replace_existing {
                let first = preview
                    .items
                    .iter()
                    .flat_map(|item| item.conflicts.iter())
                    .next()
                    .cloned()
                    .unwrap_or_else(|| "检测到冲突，请先确认替换策略".to_string());
                return Err(AppError::ModConflict(first));
            }

            let target_root = if enable_after_install {
                Path::new(&game.mods_dir)
            } else {
                Path::new(&game.disabled_mods_dir)
            };
            let current_state = if enable_after_install {
                InstalledModState::Enabled
            } else {
                InstalledModState::Disabled
            };

            let mut installed = Vec::new();
            for mod_dir in &unpacked.mod_dirs {
                let preview_mod = map_mod_directory(mod_dir.clone(), current_state.clone());

                if replace_existing {
                    remove_existing_conflicts(&game, &preview_mod)?;
                }

                let target_dir = target_root.join(&preview_mod.folder_name);
                if target_dir.exists() {
                    return Err(AppError::ModConflict(preview_mod.folder_name));
                }

                move_directory(mod_dir, &target_dir)?;
                installed.push(map_mod_directory(target_dir, current_state.clone()));
            }

            Ok(installed)
        })();

        let _ = fs::remove_dir_all(&unpacked.temp_root);
        result
    }

    pub fn preview_install_archive(
        &self,
        archive_path: &str,
        enable_after_install: bool,
    ) -> Result<ArchiveInstallPreview, AppError> {
        let game = self.resolve_game()?;
        let archive = PathBuf::from(archive_path);
        let unpacked = unpack_archive(&archive)?;
        let preview =
            build_archive_preview(&game, archive_path, enable_after_install, &unpacked.mod_dirs);
        let _ = fs::remove_dir_all(&unpacked.temp_root);
        Ok(preview)
    }

    // ── Batch Import Engine ─────────────────────────────────────────────

    /// Scan multiple import targets (files and/or folders) and discover all mods.
    /// Returns a preview with discovery status for each found mod.
    pub fn process_import_targets(
        &self,
        paths: &[String],
        enable_after_install: bool,
    ) -> Result<BatchImportPreview, AppError> {
        let game = self.resolve_game()?;

        let target_root = if enable_after_install {
            Path::new(&game.mods_dir)
        } else {
            Path::new(&game.disabled_mods_dir)
        };
        let state = if enable_after_install {
            InstalledModState::Enabled
        } else {
            InstalledModState::Disabled
        };

        // Collect all existing mods for conflict detection
        let existing = scan_mod_directory(Path::new(&game.mods_dir), InstalledModState::Enabled)
            .into_iter()
            .chain(scan_mod_directory(
                Path::new(&game.disabled_mods_dir),
                InstalledModState::Disabled,
            ))
            .collect::<Vec<_>>();

        let mut all_discovered: Vec<DiscoveredMod> = Vec::new();
        let mut temp_dirs: Vec<PathBuf> = Vec::new();

        for path_str in paths {
            let path = PathBuf::from(path_str);

            if path.is_dir() {
                // Scan folder for mods and nested archives
                recursive_discover_from_dir(
                    &path,
                    path_str,
                    0,
                    3,
                    &existing,
                    target_root,
                    &state,
                    DiscoveredModSourceType::Folder,
                    &mut all_discovered,
                    &mut temp_dirs,
                );
            } else if path.is_file() {
                recursive_discover_from_file(
                    &path,
                    path_str,
                    0,
                    3,
                    &existing,
                    target_root,
                    &state,
                    &mut all_discovered,
                    &mut temp_dirs,
                );
            }
        }

        // Clean up temp dirs
        for dir in &temp_dirs {
            let _ = fs::remove_dir_all(dir);
        }

        let ready_count = all_discovered.iter().filter(|m| m.status == DiscoveredModStatus::Ready).count();
        let conflict_count = all_discovered.iter().filter(|m| m.status == DiscoveredModStatus::Conflict).count();
        let unsupported_count = all_discovered.iter().filter(|m| m.status == DiscoveredModStatus::UnsupportedFormat).count();
        let error_count = all_discovered.iter().filter(|m| m.status == DiscoveredModStatus::Error).count();

        Ok(BatchImportPreview {
            total_targets_scanned: paths.len(),
            discovered_mods: all_discovered,
            ready_count,
            conflict_count,
            unsupported_count,
            error_count,
        })
    }

    /// Install a batch of mods from previously scanned paths. Each mod is installed
    /// independently — failures are captured and reported, not propagated.
    pub fn batch_install(
        &self,
        paths: &[String],
        enable_after_install: bool,
        replace_existing: bool,
        selected_mod_ids: &[String],
        conflict_resolutions: &std::collections::HashMap<String, String>,
    ) -> Result<BatchInstallResult, AppError> {
        let game = self.resolve_game()?;

        let target_root = if enable_after_install {
            Path::new(&game.mods_dir)
        } else {
            Path::new(&game.disabled_mods_dir)
        };
        let current_state = if enable_after_install {
            InstalledModState::Enabled
        } else {
            InstalledModState::Disabled
        };

        let mut results: Vec<BatchInstallItemResult> = Vec::new();
        let mut temp_dirs: Vec<PathBuf> = Vec::new();

        for path_str in paths {
            let path = PathBuf::from(path_str);

            // Collect mod directories from this path
            let mut mod_dirs: Vec<(PathBuf, PathBuf)> = Vec::new(); // (mod_dir, temp_root)

            if path.is_dir() {
                // Check if the directory itself is a mod
                if find_manifest_path(&path).is_some() {
                    // The directory itself is a mod — no temp root
                    mod_dirs.push((path.clone(), PathBuf::new()));
                } else {
                    // Scan for archives inside
                    collect_installable_dirs_from_dir(
                        &path,
                        0,
                        3,
                        &mut mod_dirs,
                        &mut temp_dirs,
                    );
                }
            } else if path.is_file() {
                collect_installable_dirs_from_file(
                    &path,
                    0,
                    3,
                    &mut mod_dirs,
                    &mut temp_dirs,
                );
            }

            for (mod_dir, _temp_root) in &mod_dirs {
                let mut mapped = map_mod_directory(mod_dir.clone(), current_state.clone());

                // Skip mods the user didn't select in the preview
                if !selected_mod_ids.is_empty()
                    && !selected_mod_ids.iter().any(|sid| sid.eq_ignore_ascii_case(&mapped.id))
                {
                    continue;
                }

                let resolution = conflict_resolutions.get(&mapped.id).map(|s| s.as_str());

                if resolution == Some("rename") {
                    let mut uuid_str = Uuid::new_v4().to_string();
                    uuid_str.truncate(8);
                    let safe_id = mapped.id.trim().replace(" ", "_");
                    let new_id = format!("{}_{}", safe_id, uuid_str);
                    
                    if let Err(e) = crate::integrations::manifest::rewrite_manifest_id(mod_dir, &new_id) {
                        results.push(BatchInstallItemResult {
                            mod_id: mapped.id.clone(),
                            name: mapped.name.clone(),
                            success: false,
                            error_message: Some(format!("重命名失败: {}", e)),
                        });
                        continue;
                    }
                    
                    mapped.id = new_id.clone();
                    mapped.folder_name = new_id;
                }

                let mod_name = mapped.name.clone();
                let mod_id = mapped.id.clone();
                let replace_this_one = replace_existing || resolution == Some("replace");

                let install_result: Result<(), AppError> = (|| {
                    if replace_this_one {
                        remove_existing_conflicts(&game, &mapped)?;
                    }

                    let target_dir = target_root.join(&mapped.folder_name);
                    if target_dir.exists() && !replace_this_one {
                        return Err(AppError::ModConflict(mapped.folder_name.clone()));
                    }
                    if target_dir.exists() && replace_this_one {
                        fs::remove_dir_all(&target_dir)
                            .map_err(|e| AppError::Io(e.to_string()))?;
                    }

                    // If the source is from a temp directory (archive extraction),
                    // we can move it. If it's an already-extracted user folder
                    // (temp_root is empty), we must copy instead of move to avoid
                    // deleting the user's original files.
                    if _temp_root.as_os_str().is_empty() {
                        copy_directory_recursive(mod_dir, &target_dir)?;
                    } else {
                        move_directory(mod_dir, &target_dir)?;
                    }
                    Ok(())
                })();

                match install_result {
                    Ok(()) => {
                        results.push(BatchInstallItemResult {
                            mod_id,
                            name: mod_name,
                            success: true,
                            error_message: None,
                        });
                    }
                    Err(e) => {
                        results.push(BatchInstallItemResult {
                            mod_id,
                            name: mod_name,
                            success: false,
                            error_message: Some(e.to_string()),
                        });
                    }
                }
            }
        }

        // Clean up all temp dirs
        for dir in &temp_dirs {
            let _ = fs::remove_dir_all(dir);
        }

        let success_count = results.iter().filter(|r| r.success).count();
        let failure_count = results.iter().filter(|r| !r.success).count();

        Ok(BatchInstallResult {
            success_count,
            failure_count,
            results,
        })
    }

    fn resolve_game(&self) -> Result<GameInstall, AppError> {
        GameService::new(self.settings.clone()).detect_install()
    }
}

// ── Internal Helpers ────────────────────────────────────────────────────

struct UnpackedArchive {
    temp_root: PathBuf,
    mod_dirs: Vec<PathBuf>,
}

fn move_mod(
    source_root: &Path,
    target_root: &Path,
    mod_id: &str,
    target_state: InstalledModState,
) -> Result<InstalledMod, AppError> {
    let mods = scan_mod_directory(
        source_root,
        match target_state {
            InstalledModState::Enabled => InstalledModState::Disabled,
            InstalledModState::Disabled => InstalledModState::Enabled,
            _ => InstalledModState::Unknown,
        },
    );

    let found = mods
        .into_iter()
        .find(|item| item.id.eq_ignore_ascii_case(mod_id))
        .ok_or_else(|| AppError::ModNotFound(mod_id.to_string()))?;

    let target_dir = target_root.join(&found.folder_name);
    if target_dir.exists() {
        return Err(AppError::ModConflict(found.folder_name));
    }

    move_directory(Path::new(&found.install_dir), &target_dir)?;
    Ok(map_mod_directory(target_dir, target_state))
}

fn move_directory(source: &Path, target: &Path) -> Result<(), AppError> {
    match fs::rename(source, target) {
        Ok(_) => Ok(()),
        Err(_) => {
            copy_directory_recursive(source, target)?;
            fs::remove_dir_all(source).map_err(|error| AppError::Io(error.to_string()))
        }
    }
}

fn copy_directory_recursive(source: &Path, target: &Path) -> Result<(), AppError> {
    fs::create_dir_all(target).map_err(|error| AppError::Io(error.to_string()))?;

    for entry in fs::read_dir(source).map_err(|error| AppError::Io(error.to_string()))? {
        let entry = entry.map_err(|error| AppError::Io(error.to_string()))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());

        if source_path.is_dir() {
            copy_directory_recursive(&source_path, &target_path)?;
        } else {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|error| AppError::Io(error.to_string()))?;
            }
            fs::copy(&source_path, &target_path).map_err(|error| AppError::Io(error.to_string()))?;
        }
    }

    Ok(())
}

fn unpack_archive(archive_path: &Path) -> Result<UnpackedArchive, AppError> {
    if !archive_path.is_file() {
        return Err(AppError::InvalidArchive(format!(
            "archive not found: {}",
            archive_path.to_string_lossy()
        )));
    }

    let temp_root = env::temp_dir().join(format!("slaysp2manager-{}", Uuid::new_v4()));
    fs::create_dir_all(&temp_root).map_err(|error| AppError::Io(error.to_string()))?;
    extract_archive(archive_path, &temp_root)?;
    let mod_dirs = find_extracted_mod_dirs(&temp_root);
    if mod_dirs.is_empty() {
        let _ = fs::remove_dir_all(&temp_root);
        return Err(AppError::InvalidArchive(
            "no mod manifest found in archive".to_string(),
        ));
    }

    Ok(UnpackedArchive { temp_root, mod_dirs })
}

fn build_archive_preview(
    game: &GameInstall,
    archive_path: &str,
    enable_after_install: bool,
    mod_dirs: &[PathBuf],
) -> ArchiveInstallPreview {
    let target_root = if enable_after_install {
        Path::new(&game.mods_dir)
    } else {
        Path::new(&game.disabled_mods_dir)
    };

    let state = if enable_after_install {
        InstalledModState::Enabled
    } else {
        InstalledModState::Disabled
    };

    let existing = scan_mod_directory(Path::new(&game.mods_dir), InstalledModState::Enabled)
        .into_iter()
        .chain(scan_mod_directory(
            Path::new(&game.disabled_mods_dir),
            InstalledModState::Disabled,
        ))
        .collect::<Vec<_>>();

    let items = mod_dirs
        .iter()
        .map(|mod_dir| {
            let mapped = map_mod_directory(mod_dir.clone(), state.clone());
            let mut conflicts = Vec::new();

            if existing
                .iter()
                .any(|item| item.id.eq_ignore_ascii_case(&mapped.id))
            {
                conflicts.push(format!("已存在相同 Mod ID：{}", mapped.id));
            }

            let target_dir = target_root.join(&mapped.folder_name);
            if target_dir.exists() {
                conflicts.push(format!("目标目录已存在：{}", mapped.folder_name));
            }

            ArchiveInstallItemPreview {
                mod_id: mapped.id,
                name: mapped.name,
                version: mapped.version,
                folder_name: mapped.folder_name,
                target_dir: target_dir.to_string_lossy().to_string(),
                conflicts,
            }
        })
        .collect::<Vec<_>>();

    ArchiveInstallPreview {
        archive_path: archive_path.to_string(),
        enable_after_install,
        has_conflicts: items.iter().any(|item| !item.conflicts.is_empty()),
        items,
    }
}

fn remove_existing_conflicts(game: &GameInstall, incoming: &InstalledMod) -> Result<(), AppError> {
    let existing = scan_mod_directory(Path::new(&game.mods_dir), InstalledModState::Enabled)
        .into_iter()
        .chain(scan_mod_directory(
            Path::new(&game.disabled_mods_dir),
            InstalledModState::Disabled,
        ))
        .collect::<Vec<_>>();

    for item in existing {
        let same_id = item.id.eq_ignore_ascii_case(&incoming.id);
        let same_folder = item.folder_name.eq_ignore_ascii_case(&incoming.folder_name);
        if same_id || same_folder {
            fs::remove_dir_all(&item.install_dir).map_err(|error| AppError::Io(error.to_string()))?;
        }
    }

    Ok(())
}

// ── Archive Extraction ──────────────────────────────────────────────────

fn extract_archive(archive_path: &Path, target_root: &Path) -> Result<(), AppError> {
    let file = fs::File::open(archive_path).map_err(|error| AppError::Io(error.to_string()))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| AppError::InvalidArchive(error.to_string()))?;

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| AppError::InvalidArchive(error.to_string()))?;
        let Some(enclosed) = file.enclosed_name().map(|path| path.to_path_buf()) else {
            continue;
        };
        let out_path = target_root.join(enclosed);

        if file.is_dir() {
            fs::create_dir_all(&out_path).map_err(|error| AppError::Io(error.to_string()))?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|error| AppError::Io(error.to_string()))?;
        }

        let mut out_file =
            fs::File::create(&out_path).map_err(|error| AppError::Io(error.to_string()))?;
        io::copy(&mut file, &mut out_file).map_err(|error| AppError::Io(error.to_string()))?;
    }

    Ok(())
}

fn extract_7z(archive_path: &Path, target_root: &Path) -> Result<(), AppError> {
    sevenz_rust::decompress_file(archive_path, target_root)
        .map_err(|error| AppError::InvalidArchive(format!("7z extraction failed: {}", error)))
}

/// Detect archive format using binary magic bytes and extract accordingly.
/// Returns `Ok(())` on success, `Err` with a descriptive message otherwise.
fn detect_and_extract(file_path: &Path, target_root: &Path) -> Result<(), AppError> {
    let buf = fs::read(file_path).map_err(|e| AppError::Io(e.to_string()))?;
    let kind = infer::get(&buf);

    // Try extension-based matching first for known types
    let ext = file_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "zip" => return extract_archive(file_path, target_root),
        "7z" => return extract_7z(file_path, target_root),
        _ => {}
    }

    // Binary detection fallback
    if let Some(kind) = kind {
        match kind.mime_type() {
            "application/zip" => return extract_archive(file_path, target_root),
            "application/x-7z-compressed" => return extract_7z(file_path, target_root),
            "application/vnd.rar" | "application/x-rar-compressed" => {
                return Err(AppError::UnsupportedFormat(
                    "rar".to_string(),
                    "识别为 RAR 格式，请转换为 .zip 或 .7z 后导入".to_string(),
                ));
            }
            "application/gzip" => {
                return Err(AppError::UnsupportedFormat(
                    "gzip".to_string(),
                    "识别为 Gzip 格式，请转换为 .zip 或 .7z 后导入".to_string(),
                ));
            }
            "application/x-tar" => {
                return Err(AppError::UnsupportedFormat(
                    "tar".to_string(),
                    "识别为 Tar 格式，请转换为 .zip 或 .7z 后导入".to_string(),
                ));
            }
            _ => {}
        }
    }

    // Last resort: try zip, then 7z
    if extract_archive(file_path, target_root).is_ok() {
        return Ok(());
    }
    if extract_7z(file_path, target_root).is_ok() {
        return Ok(());
    }

    Err(AppError::InvalidArchive(format!(
        "unable to extract: {}",
        file_path.to_string_lossy()
    )))
}

// ── Batch Discovery ─────────────────────────────────────────────────────

/// Supported archive extensions for batch scanning.
fn is_archive_extension(ext: &str) -> bool {
    matches!(ext.to_lowercase().as_str(), "zip" | "7z" | "rar" | "gz" | "tar")
}

/// Recursively discover mods from a directory (looking for manifests and nested archives).
fn recursive_discover_from_dir(
    dir: &Path,
    source_label: &str,
    depth: usize,
    max_depth: usize,
    existing: &[InstalledMod],
    target_root: &Path,
    state: &InstalledModState,
    source_type: DiscoveredModSourceType,
    discovered: &mut Vec<DiscoveredMod>,
    temp_dirs: &mut Vec<PathBuf>,
) {
    if depth > max_depth || !dir.is_dir() {
        return;
    }

    // If this directory is itself a mod
    if find_manifest_path(dir).is_some() {
        let mapped = map_mod_directory(dir.to_path_buf(), state.clone());
        let (status, conflicts, msg) = check_conflicts(&mapped, existing, target_root);
        let target_dir = target_root.join(&mapped.folder_name).to_string_lossy().to_string();
        discovered.push(DiscoveredMod {
            mod_id: mapped.id,
            name: mapped.name,
            version: mapped.version,
            author: mapped.author,
            folder_name: mapped.folder_name,
            target_dir,
            source_archive: source_label.to_string(),
            source_type: source_type.clone(),
            status,
            conflicts,
            status_message: msg,
            resolve_strategy: None,
        });
        return;
    }

    // Scan children
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let child = entry.path();
        if child.is_dir() {
            recursive_discover_from_dir(
                &child,
                source_label,
                depth + 1,
                max_depth,
                existing,
                target_root,
                state,
                source_type.clone(),
                discovered,
                temp_dirs,
            );
        } else if child.is_file() {
            let ext = child.extension().and_then(|s| s.to_str()).unwrap_or("");
            if is_archive_extension(ext) {
                recursive_discover_from_file(
                    &child,
                    source_label,
                    depth + 1,
                    max_depth,
                    existing,
                    target_root,
                    state,
                    discovered,
                    temp_dirs,
                );
            }
        }
    }
}

/// Extract an archive file and recursively discover mods within it.
fn recursive_discover_from_file(
    file: &Path,
    source_label: &str,
    depth: usize,
    max_depth: usize,
    existing: &[InstalledMod],
    target_root: &Path,
    state: &InstalledModState,
    discovered: &mut Vec<DiscoveredMod>,
    temp_dirs: &mut Vec<PathBuf>,
) {
    if depth > max_depth {
        return;
    }

    let file_name = file.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| source_label.to_string());

    let temp_root = env::temp_dir().join(format!("slaysp2manager-batch-{}", Uuid::new_v4()));
    if fs::create_dir_all(&temp_root).is_err() {
        discovered.push(DiscoveredMod {
            mod_id: file_name.clone(),
            name: file_name.clone(),
            version: None,
            author: None,
            folder_name: file_name.clone(),
            target_dir: String::new(),
            source_archive: source_label.to_string(),
            source_type: DiscoveredModSourceType::Archive,
            status: DiscoveredModStatus::Error,
            conflicts: vec![],
            status_message: Some("无法创建临时目录".to_string()),
            resolve_strategy: None,
        });
        return;
    }
    temp_dirs.push(temp_root.clone());

    match detect_and_extract(file, &temp_root) {
        Ok(()) => {
            // Recursively discover inside the extracted content
            recursive_discover_from_dir(
                &temp_root,
                &file_name,
                depth,
                max_depth,
                existing,
                target_root,
                state,
                DiscoveredModSourceType::Archive,
                discovered,
                temp_dirs,
            );
        }
        Err(AppError::UnsupportedFormat(_fmt, suggestion)) => {
            discovered.push(DiscoveredMod {
                mod_id: file_name.clone(),
                name: file_name.clone(),
                version: None,
                author: None,
                folder_name: file_name.clone(),
                target_dir: String::new(),
                source_archive: source_label.to_string(),
                source_type: DiscoveredModSourceType::Archive,
                status: DiscoveredModStatus::UnsupportedFormat,
                conflicts: vec![],
                status_message: Some(suggestion),
                resolve_strategy: None,
            });
        }
        Err(e) => {
            discovered.push(DiscoveredMod {
                mod_id: file_name.clone(),
                name: file_name.clone(),
                version: None,
                author: None,
                folder_name: file_name.clone(),
                target_dir: String::new(),
                source_archive: source_label.to_string(),
                source_type: DiscoveredModSourceType::Archive,
                status: DiscoveredModStatus::Error,
                conflicts: vec![],
                status_message: Some(e.to_string()),
                resolve_strategy: None,
            });
        }
    }
}

/// Collect installable mod directories from a folder (for batch_install).
fn collect_installable_dirs_from_dir(
    dir: &Path,
    depth: usize,
    max_depth: usize,
    mod_dirs: &mut Vec<(PathBuf, PathBuf)>,
    temp_dirs: &mut Vec<PathBuf>,
) {
    if depth > max_depth || !dir.is_dir() {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let child = entry.path();
        if child.is_dir() {
            if find_manifest_path(&child).is_some() {
                mod_dirs.push((child, PathBuf::new()));
            } else {
                collect_installable_dirs_from_dir(&child, depth + 1, max_depth, mod_dirs, temp_dirs);
            }
        } else if child.is_file() {
            let ext = child.extension().and_then(|s| s.to_str()).unwrap_or("");
            if is_archive_extension(ext) {
                collect_installable_dirs_from_file(&child, depth + 1, max_depth, mod_dirs, temp_dirs);
            }
        }
    }
}

/// Extract archive and collect mod dirs from it (for batch_install).
fn collect_installable_dirs_from_file(
    file: &Path,
    depth: usize,
    max_depth: usize,
    mod_dirs: &mut Vec<(PathBuf, PathBuf)>,
    temp_dirs: &mut Vec<PathBuf>,
) {
    if depth > max_depth {
        return;
    }

    let temp_root = env::temp_dir().join(format!("slaysp2manager-batch-{}", Uuid::new_v4()));
    if fs::create_dir_all(&temp_root).is_err() {
        return;
    }
    temp_dirs.push(temp_root.clone());

    if detect_and_extract(file, &temp_root).is_ok() {
        // Find mod dirs within extracted content
        let found = find_extracted_mod_dirs(&temp_root);
        for mod_dir in found {
            mod_dirs.push((mod_dir, temp_root.clone()));
        }

        // Also check for nested archives
        collect_installable_dirs_from_dir(&temp_root, depth, max_depth, mod_dirs, temp_dirs);
    }
}

/// Check a mod against existing installations for conflicts.
/// Detects conflicts across both enabled and disabled state — so importing a mod
/// that already exists in the opposite state is still flagged.
fn check_conflicts(
    mapped: &InstalledMod,
    existing: &[InstalledMod],
    target_root: &Path,
) -> (DiscoveredModStatus, Vec<String>, Option<String>) {
    let mut conflicts = Vec::new();

    // Check ID conflict across both enabled and disabled
    for item in existing {
        if item.id.eq_ignore_ascii_case(&mapped.id) {
            let state_label = match &item.state {
                InstalledModState::Enabled => "已启用",
                InstalledModState::Disabled => "已禁用",
                _ => "已安装",
            };
            conflicts.push(format!(
                "已存在相同 Mod ID：{} (当前状态: {})",
                mapped.id, state_label
            ));
            break;
        }
    }

    // Check folder name conflict across both enabled and disabled
    for item in existing {
        if item.folder_name.eq_ignore_ascii_case(&mapped.folder_name)
            && !item.id.eq_ignore_ascii_case(&mapped.id)
        {
            conflicts.push(format!("目标目录已存在：{}", mapped.folder_name));
            break;
        }
    }

    // Also check the target directory on disk
    let target_dir = target_root.join(&mapped.folder_name);
    if target_dir.exists() && conflicts.is_empty() {
        conflicts.push(format!("目标目录已存在：{}", mapped.folder_name));
    }

    if conflicts.is_empty() {
        (DiscoveredModStatus::Ready, conflicts, None)
    } else {
        (DiscoveredModStatus::Conflict, conflicts, None)
    }
}

// ── Mod Directory Scanning ──────────────────────────────────────────────

fn find_extracted_mod_dirs(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    walk_for_mod_dirs(root, 0, 3, &mut found);
    found
}

fn walk_for_mod_dirs(current: &Path, depth: usize, max_depth: usize, found: &mut Vec<PathBuf>) {
    if depth > max_depth || !current.is_dir() {
        return;
    }

    if find_manifest_path(current).is_some() {
        found.push(current.to_path_buf());
        return;
    }

    for child in list_directories(current) {
        walk_for_mod_dirs(&child, depth + 1, max_depth, found);
    }
}

fn scan_mod_directory(directory: &Path, state: InstalledModState) -> Vec<InstalledMod> {
    let mut mods: Vec<InstalledMod> = list_directories(directory)
        .into_iter()
        .map(|mod_dir| map_mod_directory(mod_dir, state.clone()))
        .collect();

    mods.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    mods
}

fn map_mod_directory(mod_dir: PathBuf, state: InstalledModState) -> InstalledMod {
    let manifest_path = find_manifest_path(&mod_dir);
    let mut folder_name = mod_dir
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    if let Some(path) = &manifest_path {
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            if stem != "mod_manifest" {
                folder_name = stem.to_string();
            }
        }
    }

    let manifest = read_manifest(&mod_dir);
    let manifest_path = find_manifest_path(&mod_dir);

    // For mod ID: use manifest `id` (always present due to strict validation), fallback to folder name
    let mod_id = manifest
        .as_ref()
        .and_then(|m| m.id.clone())
        .unwrap_or_else(|| folder_name.clone());

    InstalledMod {
        id: mod_id,
        name: manifest
            .as_ref()
            .and_then(|manifest| manifest.name.clone())
            .unwrap_or_else(|| folder_name.clone()),
        version: manifest.as_ref().and_then(|manifest| manifest.version.clone()),
        author: manifest.as_ref().and_then(|manifest| manifest.author.clone()),
        folder_name,
        install_dir: mod_dir.to_string_lossy().to_string(),
        manifest_path: manifest_path.map(|path| path.to_string_lossy().to_string()),
        state,
    }
}

