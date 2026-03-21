use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSlot {
    pub steam_user_id: String,
    pub kind: SaveKind,
    pub slot_index: u8,
    pub path: String,
    pub has_data: bool,
    pub has_current_run: bool,
    pub file_count: usize,
    pub last_modified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTransferPreview {
    pub source: SaveSlotRef,
    pub target: SaveSlotRef,
    pub source_has_data: bool,
    pub target_has_data: bool,
    pub backup_will_be_created: bool,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSlotRef {
    pub steam_user_id: String,
    pub kind: SaveKind,
    pub slot_index: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBackupEntry {
    pub id: String,
    pub steam_user_id: String,
    pub kind: SaveKind,
    pub slot_index: u8,
    pub backup_path: String,
    pub created_at: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SaveKind {
    Vanilla,
    Modded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSyncPair {
    pub vanilla_slot: u8,
    pub modded_slot: u8,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSyncResult {
    pub synced_count: usize,
    pub details: Vec<SaveSyncDetail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSyncDetail {
    pub slot_index: u8,
    pub direction: String,       // "vanilla_to_modded" | "modded_to_vanilla"
    pub backup_created: bool,
}
