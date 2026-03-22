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

// ── Batch Import Types ──────────────────────────────────────────────────

/// Status of each discovered mod target during batch scanning.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveredModStatus {
    /// Successfully discovered and ready for install.
    Ready,
    /// Has conflicts with existing mods.
    Conflict,
    /// The archive format is not supported (e.g., RAR).
    UnsupportedFormat,
    /// Could not parse or extract this target.
    Error,
}

/// How the mod was discovered — already-extracted folder or from an archive.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveredModSourceType {
    /// The mod is an already-extracted folder on disk.
    Folder,
    /// The mod was extracted from an archive (.zip, .7z, etc.).
    Archive,
}

/// A single mod discovered during the batch scanning process.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredMod {
    pub mod_id: String,
    pub name: String,
    pub version: Option<String>,
    pub author: Option<String>,
    pub folder_name: String,
    pub target_dir: String,
    pub source_archive: String,
    pub source_type: DiscoveredModSourceType,
    pub status: DiscoveredModStatus,
    pub conflicts: Vec<String>,
    /// Human-readable message for unsupported or error states.
    pub status_message: Option<String>,
}

/// Batch preview: the result of scanning multiple import targets.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchImportPreview {
    pub discovered_mods: Vec<DiscoveredMod>,
    pub total_targets_scanned: usize,
    pub ready_count: usize,
    pub conflict_count: usize,
    pub unsupported_count: usize,
    pub error_count: usize,
}

/// Result of a single mod install within a batch.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchInstallItemResult {
    pub mod_id: String,
    pub name: String,
    pub success: bool,
    pub error_message: Option<String>,
}

/// Final summary after installing a batch of mods.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchInstallResult {
    pub success_count: usize,
    pub failure_count: usize,
    pub results: Vec<BatchInstallItemResult>,
}

