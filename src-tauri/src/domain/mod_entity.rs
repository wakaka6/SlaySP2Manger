use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub author: Option<String>,
    pub folder_name: String,
    pub install_dir: String,
    pub manifest_path: Option<String>,
    pub state: InstalledModState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstalledModState {
    Enabled,
    Disabled,
    UpdateAvailable,
    Conflict,
    Broken,
    Unknown,
}
