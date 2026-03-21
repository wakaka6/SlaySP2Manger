use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCandidate {
    pub mod_id: String,
    pub local_version: Option<String>,
    pub remote_version: Option<String>,
}
