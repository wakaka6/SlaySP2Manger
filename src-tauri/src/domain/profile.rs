use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModProfile {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub mod_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyProfileResult {
    pub profile: ModProfile,
    pub enabled_mod_ids: Vec<String>,
    pub disabled_mod_ids: Vec<String>,
    pub missing_mod_ids: Vec<String>,
}

// ── Preset Bundle types ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetBundleModEntry {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub folder_name: String,
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetBundleManifest {
    pub format_version: u32,
    pub preset: PresetBundlePresetInfo,
    pub mods: Vec<PresetBundleModEntry>,
    pub exported_at: String,
    pub exported_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetBundlePresetInfo {
    pub name: String,
    pub description: Option<String>,
    pub mod_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetBundlePreviewMod {
    pub id: String,
    pub name: String,
    pub folder_name: String,
    pub conflict: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetBundlePreview {
    pub has_manifest: bool,
    pub preset_name: Option<String>,
    pub preset_description: Option<String>,
    pub new_mods: Vec<PresetBundlePreviewMod>,
    pub conflict_mods: Vec<PresetBundlePreviewMod>,
    pub missing_mod_ids: Vec<String>,
    pub temp_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetBundleImportResult {
    pub preset_name: String,
    pub installed_count: usize,
    pub skipped_count: usize,
    pub failed_count: usize,
}
