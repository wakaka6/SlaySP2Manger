use std::sync::RwLock;

use serde::{Deserialize, Serialize};

use crate::domain::save::SaveSyncPair;
use crate::domain::task::ActivityLogEntry;
use crate::integrations::settings_repo;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub game_root_dir: Option<String>,
    #[serde(default = "default_disabled_mods_dir_name")]
    pub disabled_mods_dir_name: String,
    #[serde(default = "default_active_profile_name")]
    pub active_profile_name: String,
    #[serde(default = "default_locale")]
    pub locale: String,
    #[serde(default)]
    pub save_auto_sync: bool,
    #[serde(default)]
    pub save_sync_pairs: Vec<SaveSyncPair>,
    #[serde(default)]
    pub nexus_api_key: Option<String>,
    #[serde(default)]
    pub nexus_is_premium: bool,
    #[serde(default)]
    pub nexus_user_name: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            game_root_dir: None,
            disabled_mods_dir_name: default_disabled_mods_dir_name(),
            active_profile_name: default_active_profile_name(),
            locale: default_locale(),
            save_auto_sync: false,
            save_sync_pairs: Vec::new(),
            nexus_api_key: None,
            nexus_is_premium: false,
            nexus_user_name: None,
        }
    }
}

#[derive(Debug)]
pub struct AppState {
    pub settings: RwLock<AppSettings>,
    pub recent_activity: RwLock<Vec<ActivityLogEntry>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            settings: RwLock::new(settings_repo::load_settings().unwrap_or_default()),
            recent_activity: RwLock::new(Vec::new()),
        }
    }
}

fn default_disabled_mods_dir_name() -> String {
    "mods_disabled".to_string()
}

fn default_active_profile_name() -> String {
    "No active profile".to_string()
}

fn default_locale() -> String {
    "zh-CN".to_string()
}
