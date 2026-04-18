use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompendiumIndex {
    pub game_version: String,
    pub game_commit: Option<String>,
    pub snapshot_version: String,
    pub snapshot_commit: Option<String>,
    pub stale: bool,
    pub locale: String,
    pub native_fonts: Option<CompendiumNativeFonts>,
    pub keyword_catalog: HashMap<String, CompendiumKeywordDefinition>,
    pub cards: Vec<CompendiumCard>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompendiumNativeFonts {
    pub title_latin_file_path: String,
    pub title_cjk_file_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompendiumCard {
    pub id: String,
    pub class_name: String,
    pub name: String,
    pub description_template: String,
    pub character: Option<String>,
    pub type_name: String,
    pub rarity: String,
    pub target: String,
    pub energy: i32,
    pub upgradable: bool,
    pub vars: Vec<CompendiumVar>,
    pub keywords: Vec<String>,
    pub upgrade: CompendiumUpgrade,
    pub art_file_path: Option<String>,
    pub native_assets: Option<CompendiumCardNativeAssets>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompendiumCardNativeAssets {
    pub frame_file_path: String,
    pub banner_file_path: String,
    pub portrait_border_file_path: Option<String>,
    pub type_plaque_file_path: String,
    pub energy_icon_file_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompendiumVar {
    pub kind: String,
    pub key: String,
    pub value: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompendiumUpgrade {
    pub energy_delta: i32,
    pub var_deltas: HashMap<String, f64>,
    pub added_keywords: Vec<String>,
    pub removed_keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompendiumKeywordDefinition {
    pub key: String,
    pub title: String,
    pub description: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CompendiumSnapshot {
    pub version: String,
    pub commit: Option<String>,
    pub generated_at: String,
    pub card_count: usize,
    pub missing_art_ids: Vec<String>,
    pub cards: Vec<CompendiumSnapshotCard>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CompendiumSnapshotCard {
    pub id: String,
    pub class_name: String,
    pub energy: i32,
    #[serde(rename = "type")]
    pub type_name: String,
    pub rarity: String,
    pub target: String,
    pub upgradable: bool,
    pub vars: Vec<CompendiumSnapshotVar>,
    pub keywords: Vec<String>,
    pub upgrade: CompendiumSnapshotUpgrade,
    pub character: Option<String>,
    pub art_stem: String,
    pub art_import_path: Option<String>,
    pub art_ctex_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CompendiumSnapshotVar {
    pub kind: String,
    pub key: String,
    pub value: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CompendiumSnapshotUpgrade {
    pub energy_delta: i32,
    pub var_deltas: HashMap<String, f64>,
    pub added_keywords: Vec<String>,
    pub removed_keywords: Vec<String>,
}
