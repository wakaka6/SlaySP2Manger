use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct ModManifest {
    pub id: Option<String>,
    pub name: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
}

pub fn find_manifest_path(mod_dir: &Path) -> Option<PathBuf> {
    let folder_name = mod_dir.file_name()?.to_string_lossy().to_string();
    let folder_manifest = mod_dir.join(format!("{folder_name}.json"));
    if folder_manifest.is_file() {
        return Some(folder_manifest);
    }

    let mod_manifest = mod_dir.join("mod_manifest.json");
    if mod_manifest.is_file() {
        return Some(mod_manifest);
    }

    if let Ok(entries) = std::fs::read_dir(mod_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(text) = std::fs::read_to_string(&path) {
                    if serde_json::from_str::<ModManifest>(&text).is_ok() {
                        return Some(path);
                    }
                }
            }
        }
    }

    None
}

pub fn read_manifest(mod_dir: &Path) -> Option<ModManifest> {
    let manifest_path = find_manifest_path(mod_dir)?;
    let text = fs::read_to_string(manifest_path).ok()?;
    serde_json::from_str::<ModManifest>(&text).ok()
}
