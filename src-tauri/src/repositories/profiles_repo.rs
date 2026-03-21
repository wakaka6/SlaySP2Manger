use std::env;
use std::fs;
use std::path::PathBuf;

use chrono::Utc;

use crate::domain::profile::ModProfile;

pub struct ProfilesRepo;

impl ProfilesRepo {
    pub fn load_profiles() -> Result<Vec<ModProfile>, String> {
        let path = profiles_file_path()?;
        if !path.exists() {
            return Ok(default_profiles());
        }

        let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
        serde_json::from_str(&text).map_err(|error| error.to_string())
    }

    pub fn save_profiles(profiles: &[ModProfile]) -> Result<(), String> {
        let path = profiles_file_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        let text = serde_json::to_string_pretty(profiles).map_err(|error| error.to_string())?;
        fs::write(path, text).map_err(|error| error.to_string())
    }
}

fn profiles_file_path() -> Result<PathBuf, String> {
    let app_data = env::var("APPDATA").map_err(|_| "APPDATA not available".to_string())?;
    Ok(PathBuf::from(app_data)
        .join("SlaySP2Manager")
        .join("profiles.json"))
}

fn default_profiles() -> Vec<ModProfile> {
    let now = Utc::now().to_rfc3339();

    vec![
        ModProfile {
            id: "profile_vanilla".to_string(),
            name: "Vanilla".to_string(),
            description: Some("Keep the base game with no enabled mods.".to_string()),
            mod_ids: Vec::new(),
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ModProfile {
            id: "profile_light_qol".to_string(),
            name: "Light QoL".to_string(),
            description: Some("Use only quality-of-life mods for a clean daily setup.".to_string()),
            mod_ids: vec![
                "BetterSpire2".to_string(),
                "QuickRestart".to_string(),
                "ModConfig".to_string(),
            ],
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        ModProfile {
            id: "profile_experiment".to_string(),
            name: "Experiment".to_string(),
            description: Some("Use this profile to test new mods and compatibility.".to_string()),
            mod_ids: vec!["BetterSpire2".to_string()],
            created_at: now.clone(),
            updated_at: now,
        },
    ]
}
