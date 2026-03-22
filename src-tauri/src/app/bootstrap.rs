use serde::Serialize;
use crate::domain::save::SaveSyncPair;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBootstrapDto {
    pub app_name: String,
    pub app_version: String,
    pub game_directory: Option<String>,
    pub game_directory_valid: bool,
    pub installed_count: usize,
    pub disabled_count: usize,
    pub active_profile_name: String,
    pub locale: String,
    pub save_auto_sync: bool,
    pub save_sync_pairs: Vec<SaveSyncPair>,
    pub nexus_api_key: Option<String>,
    pub nexus_is_premium: bool,
    pub nexus_user_name: Option<String>,
    pub proxy_url: Option<String>,
}
