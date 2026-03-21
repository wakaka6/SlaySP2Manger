use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveInstallPreview {
    pub archive_path: String,
    pub enable_after_install: bool,
    pub items: Vec<ArchiveInstallItemPreview>,
    pub has_conflicts: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveInstallItemPreview {
    pub mod_id: String,
    pub name: String,
    pub version: Option<String>,
    pub folder_name: String,
    pub target_dir: String,
    pub conflicts: Vec<String>,
}
