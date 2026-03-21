use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::app::state::AppSettings;
use crate::domain::game::GameInstall;
use crate::domain::install_plan::{ArchiveInstallItemPreview, ArchiveInstallPreview};
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

    fn resolve_game(&self) -> Result<GameInstall, AppError> {
        GameService::new(self.settings.clone()).detect_install()
    }
}

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

    InstalledMod {
        id: manifest
            .as_ref()
            .and_then(|manifest| manifest.id.clone())
            .unwrap_or_else(|| folder_name.clone()),
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
