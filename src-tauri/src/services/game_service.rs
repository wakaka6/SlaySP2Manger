use std::path::PathBuf;

use crate::app::state::AppSettings;
use crate::domain::game::{GameDetectSource, GameInstall};
use crate::integrations::filesystem::contains_game_executable;
use crate::integrations::steam::find_game_install;
use crate::utils::error::AppError;

#[derive(Debug, Clone)]
pub struct GameService {
    settings: AppSettings,
}

impl GameService {
    pub fn new(settings: AppSettings) -> Self {
        Self { settings }
    }

    pub fn detect_install(&self) -> Result<GameInstall, AppError> {
        if let Some(path) = self.settings.game_root_dir.as_ref() {
            let root = PathBuf::from(path);
            if contains_game_executable(&root) {
                return Ok(self.build_install(root, GameDetectSource::Config));
            }
        }

        if let Some((root, source)) = find_game_install() {
            return Ok(self.build_install(root, source));
        }

        Err(AppError::GameNotFound)
    }

    fn build_install(&self, root: PathBuf, detected_by: GameDetectSource) -> GameInstall {
        let disabled_name = self.settings.disabled_mods_dir_name.as_str();
        GameInstall {
            root_dir: root.to_string_lossy().to_string(),
            exe_path: root.join("SlayTheSpire2.exe").to_string_lossy().to_string(),
            mods_dir: root.join("mods").to_string_lossy().to_string(),
            disabled_mods_dir: root.join(disabled_name).to_string_lossy().to_string(),
            detected_by,
            is_valid: true,
        }
    }
}
