use std::env;
use std::fs;
use std::path::PathBuf;

use crate::app::state::AppSettings;
use crate::utils::text::read_unicode_text_file;

pub fn load_settings() -> Result<AppSettings, String> {
    let path = settings_file_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let text = read_unicode_text_file(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_file_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let text = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| error.to_string())
}

fn settings_file_path() -> Result<PathBuf, String> {
    let app_data = env::var("APPDATA").map_err(|_| "APPDATA not available".to_string())?;
    Ok(PathBuf::from(app_data)
        .join("SlaySP2Manager")
        .join("settings.json"))
}
