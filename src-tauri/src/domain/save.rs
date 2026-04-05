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
    pub direction: String, // "vanilla_to_modded" | "modded_to_vanilla"
    pub backup_created: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CloudSaveStatus {
    pub is_available: bool,
    pub cloud_path: Option<String>,
    pub local_path: Option<String>,
    pub has_mismatch: bool,
    pub local_only_count: usize,
    pub cloud_only_count: usize,
    pub different_count: usize,
    pub local_file_count: usize,
    pub cloud_file_count: usize,
    pub sample_paths: Vec<String>,
    pub local_applied_to_cloud: bool,
    pub cloud_applied_to_local: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CloudSaveDiffKind {
    InSync,
    Different,
    LocalOnly,
    CloudOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CloudSaveDiffSide {
    Local,
    Cloud,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSaveDiffEntry {
    pub relative_path: String,
    pub kind: CloudSaveDiffKind,
    pub local_exists: bool,
    pub cloud_exists: bool,
    pub local_size: Option<u64>,
    pub cloud_size: Option<u64>,
    pub local_sha: Option<String>,
    pub cloud_sha: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSaveDiffSideDetail {
    pub path: String,
    pub exists: bool,
    pub is_text: bool,
    pub size: Option<u64>,
    pub sha: Option<String>,
    pub modified_at: Option<String>,
    pub text_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSaveDiffDetail {
    pub relative_path: String,
    pub kind: CloudSaveDiffKind,
    pub local: CloudSaveDiffSideDetail,
    pub cloud: CloudSaveDiffSideDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BackupArtifactStatus {
    pub local_count: usize,
    pub cloud_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BackupArtifactCleanupResult {
    pub local_removed: usize,
    pub cloud_removed: usize,
}
