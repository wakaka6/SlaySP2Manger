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
