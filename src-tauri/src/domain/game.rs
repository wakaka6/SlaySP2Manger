use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameInstall {
    pub root_dir: String,
    pub exe_path: String,
    pub mods_dir: String,
    pub disabled_mods_dir: String,
    pub detected_by: GameDetectSource,
    pub is_valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GameDetectSource {
    Config,
    SteamDefault,
    SteamLibrary,
    CommonPath,
}
