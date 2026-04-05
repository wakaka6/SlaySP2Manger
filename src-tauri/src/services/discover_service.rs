use crate::app::state::AppSettings;
use crate::domain::remote_mod::{RemoteMod, RemoteModSearchResult};
use crate::utils::http::http_client;
use serde::Deserialize;

const NEXUS_GAME_DOMAIN: &str = "slaythespire2";
const NEXUS_GAME_ID: &str = "8916";
const NEXUS_API_BASE: &str = "https://api.nexusmods.com/v1";
const NEXUS_GRAPHQL_URL: &str = "https://api.nexusmods.com/v2/graphql";
const NEXUS_DETAIL_BASE: &str = "https://www.nexusmods.com/slaythespire2/mods";

pub struct DiscoverService {
    settings: AppSettings,
}

// ── GraphQL response types ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GraphqlResponse {
    data: Option<GraphqlData>,
    errors: Option<Vec<GraphqlError>>,
}

#[derive(Debug, Deserialize)]
struct GraphqlData {
    mods: ModsResult,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModsResult {
    nodes: Vec<GraphqlMod>,
    total_count: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphqlMod {
    mod_id: u64,
    name: Option<String>,
    summary: Option<String>,
    author: Option<String>,
    version: Option<String>,
    endorsements: Option<u64>,
    downloads: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct GraphqlError {
    message: String,
}

// ── v1 REST types (kept for file download) ──────────────────────────────

#[derive(Debug, Deserialize)]
pub struct NexusModFile {
    pub file_id: u64,
    pub name: Option<String>,
    pub version: Option<String>,
    pub category_name: Option<String>,
    pub is_primary: Option<bool>,
    pub size_kb: Option<u64>,
    pub file_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct NexusModFilesResponse {
    pub files: Vec<NexusModFile>,
}

#[derive(Debug, Deserialize)]
pub struct NexusDownloadLink {
    #[serde(rename = "URI")]
    pub uri: String,
}

#[derive(Debug, Deserialize)]
pub struct NexusUserValidation {
    pub name: Option<String>,
    pub is_premium: Option<bool>,
    pub is_supporter: Option<bool>,
    pub profile_url: Option<String>,
}

impl DiscoverService {
    pub fn new(settings: AppSettings) -> Self {
        Self { settings }
    }

    /// Validate API key and return user info (including premium status).
    pub fn validate_user(&self, api_key: &str) -> Result<NexusUserValidation, String> {
        let url = format!("{}/users/validate.json", NEXUS_API_BASE);

        let client = http_client(&self.settings, 10)?;

        let response = client
            .get(&url)
            .header("accept", "application/json")
            .header("apikey", api_key)
            .send()
            .map_err(|e| e.to_string())?;

        if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
            return Err("ERROR_INVALID_API_KEY".to_string());
        }
        if !response.status().is_success() {
            return Err(format!("Nexus API returned {}", response.status()));
        }

        response
            .json::<NexusUserValidation>()
            .map_err(|e| e.to_string())
    }

    /// Search / list mods with pagination via the GraphQL v2 API.
    pub fn search(
        &self,
        query: &str,
        sort_by: &str,
        offset: u64,
        count: u64,
    ) -> Result<RemoteModSearchResult, String> {
        let api_key = self.read_api_key().unwrap_or_default();
        if api_key.is_empty() {
            return Err("ERROR_MISSING_API_KEY".to_string());
        }

        self.search_graphql(query, sort_by, offset, count, &api_key)
    }

    /// Get file list for a mod (v1 REST)
    pub fn get_mod_files(&self, mod_id: u64) -> Result<Vec<NexusModFile>, String> {
        let api_key = self.read_api_key().unwrap_or_default();
        if api_key.is_empty() {
            return Err("ERROR_MISSING_API_KEY".to_string());
        }

        let url = format!(
            "{}/games/{}/mods/{}/files.json",
            NEXUS_API_BASE, NEXUS_GAME_DOMAIN, mod_id
        );

        let client = http_client(&self.settings, 10)?;

        let response = client
            .get(&url)
            .header("accept", "application/json")
            .header("apikey", &api_key)
            .send()
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Err(format!("Nexus API returned {}", response.status()));
        }

        let files_resp: NexusModFilesResponse = response.json().map_err(|e| e.to_string())?;
        Ok(files_resp.files)
    }

    /// Get download link for a specific file (v1 REST)
    pub fn get_download_link(&self, mod_id: u64, file_id: u64) -> Result<String, String> {
        let api_key = self.read_api_key().unwrap_or_default();
        if api_key.is_empty() {
            return Err("ERROR_MISSING_API_KEY".to_string());
        }

        let url = format!(
            "{}/games/{}/mods/{}/files/{}/download_link.json",
            NEXUS_API_BASE, NEXUS_GAME_DOMAIN, mod_id, file_id
        );

        let client = http_client(&self.settings, 10)?;

        let response = client
            .get(&url)
            .header("accept", "application/json")
            .header("apikey", &api_key)
            .send()
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Err(format!("Nexus API returned {}", response.status()));
        }

        let links: Vec<NexusDownloadLink> = response.json().map_err(|e| e.to_string())?;
        links
            .first()
            .map(|l| l.uri.clone())
            .ok_or_else(|| "No download links available".to_string())
    }

    // ── GraphQL search implementation ───────────────────────────────────

    fn search_graphql(
        &self,
        query: &str,
        sort_by: &str,
        offset: u64,
        count: u64,
        api_key: &str,
    ) -> Result<RemoteModSearchResult, String> {
        let sort_clause = match sort_by {
            "latest_updated" => r#"{ updatedAt: { direction: DESC } }"#,
            "trending" => r#"{ endorsements: { direction: DESC } }"#,
            "downloads" => r#"{ downloads: { direction: DESC } }"#,
            _ => r#"{ createdAt: { direction: DESC } }"#,
        };

        let query_trimmed = query.trim();

        let filter = if query_trimmed.is_empty() {
            format!(
                r#"{{ gameId: {{ value: "{}", op: EQUALS }} }}"#,
                NEXUS_GAME_ID
            )
        } else {
            let escaped = query_trimmed.replace('\\', "\\\\").replace('"', "\\\"");
            format!(
                r#"{{ filter: [{{ gameId: {{ value: "{game_id}", op: EQUALS }}, name: {{ value: "{q}", op: EQUALS }} }}, {{ gameId: {{ value: "{game_id}", op: EQUALS }}, description: {{ value: "{q}", op: MATCHES }} }}], op: OR }}"#,
                game_id = NEXUS_GAME_ID,
                q = escaped,
            )
        };

        let graphql_query = format!(
            r#"{{ mods(filter: {filter}, sort: [{sort}], offset: {offset}, count: {count}) {{ totalCount nodes {{ modId name summary author version endorsements downloads }} }} }}"#,
            filter = filter,
            sort = sort_clause,
            offset = offset,
            count = count,
        );

        let body = serde_json::json!({ "query": graphql_query });

        let client = http_client(&self.settings, 10)?;

        let response = client
            .post(NEXUS_GRAPHQL_URL)
            .header("content-type", "application/json")
            .header("apikey", api_key)
            .json(&body)
            .send()
            .map_err(|e| e.to_string())?;

        if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
            return Err("ERROR_INVALID_API_KEY".to_string());
        }
        if !response.status().is_success() {
            return Err(format!("Nexus API returned {}", response.status()));
        }

        let gql_resp: GraphqlResponse = response.json().map_err(|e| e.to_string())?;

        if let Some(errors) = gql_resp.errors {
            if let Some(first) = errors.first() {
                return Err(first.message.clone());
            }
        }

        let mods_result = gql_resp
            .data
            .ok_or("Empty response from Nexus GraphQL API")?
            .mods;

        let items: Vec<RemoteMod> = mods_result
            .nodes
            .into_iter()
            .map(|m| RemoteMod {
                remote_id: m.mod_id.to_string(),
                provider: "nexus".to_string(),
                name: m.name.unwrap_or_else(|| format!("Mod #{}", m.mod_id)),
                summary: m.summary,
                author: m.author,
                latest_version: m.version,
                detail_url: format!("{}/{}", NEXUS_DETAIL_BASE, m.mod_id),
                endorsement_count: m.endorsements.unwrap_or(0),
                download_count: m.downloads.unwrap_or(0),
                unique_downloads: 0,
            })
            .collect();

        Ok(RemoteModSearchResult {
            total_count: mods_result.total_count,
            offset,
            count: items.len() as u64,
            items,
        })
    }

    fn read_api_key(&self) -> Option<String> {
        self.settings
            .nexus_api_key
            .clone()
            .filter(|s| !s.is_empty())
    }
}
