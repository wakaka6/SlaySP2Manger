use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::Value;

use crate::utils::text::read_unicode_text_file;

/// Represents a Slay the Spire 2 mod manifest.
///
/// A valid mod manifest **must** contain all four keys: `id`, `name`, `has_pck`, `has_dll`.
/// This strict check prevents false-positive matches against unrelated JSON files.
#[derive(Debug, Clone, Deserialize)]
pub struct ModManifest {
    pub id: Option<String>,
    pub name: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
    pub affects_gameplay: Option<bool>,
    pub has_pck: Option<bool>,
    pub has_dll: Option<bool>,
}

impl ModManifest {
    /// A manifest is valid only if it contains all four required keys:
    /// `id` (non-empty), `name` (non-empty), `has_pck`, and `has_dll`.
    pub fn is_valid(&self) -> bool {
        let has_id = self.id.as_ref().map_or(false, |s| !s.trim().is_empty());
        let has_name = self.name.as_ref().map_or(false, |s| !s.trim().is_empty());
        let has_pck = self.has_pck.is_some();
        let has_dll = self.has_dll.is_some();
        has_id && has_name && has_pck && has_dll
    }
}

/// Try to parse text as a mod manifest and validate its structure.
/// Returns `Some(manifest)` only if:
///   1. The text is valid JSON
///   2. The top-level value is an object (not array/string/etc.)
///   3. The object contains all required fields: id, name, has_pck, has_dll
fn try_parse_manifest(text: &str) -> Option<ModManifest> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);

    // Confirm the top-level value is a JSON object
    let val: Value = serde_json::from_str(text).ok()?;
    if !val.is_object() {
        return None;
    }

    let manifest: ModManifest = serde_json::from_str(text).ok()?;
    if manifest.is_valid() {
        Some(manifest)
    } else {
        None
    }
}

pub fn find_manifest_path(mod_dir: &Path) -> Option<PathBuf> {
    let folder_name = mod_dir.file_name()?.to_string_lossy().to_string();

    // 1. Check <FolderName>.json  (the standard naming convention)
    let folder_manifest = mod_dir.join(format!("{folder_name}.json"));
    if folder_manifest.is_file() {
        if let Ok(text) = read_unicode_text_file(&folder_manifest) {
            if try_parse_manifest(&text).is_some() {
                return Some(folder_manifest);
            }
        }
    }

    // 2. Check mod_manifest.json  (alternative convention)
    let mod_manifest = mod_dir.join("mod_manifest.json");
    if mod_manifest.is_file() {
        if let Ok(text) = read_unicode_text_file(&mod_manifest) {
            if try_parse_manifest(&text).is_some() {
                return Some(mod_manifest);
            }
        }
    }

    // 3. Scan all .json files in the directory for a valid manifest
    if let Ok(entries) = std::fs::read_dir(mod_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(text) = read_unicode_text_file(&path) {
                    if try_parse_manifest(&text).is_some() {
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
    let text = read_unicode_text_file(manifest_path).ok()?;
    try_parse_manifest(&text)
}

/// Rewrites the `id` field in the manifest to a new value, and renames the file if
/// it was named `<old_id>.json`.
pub fn rewrite_manifest_id(mod_dir: &Path, new_id: &str) -> std::io::Result<()> {
    let manifest_path = find_manifest_path(mod_dir).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Manifest file not found for rewrite",
        )
    })?;

    let text = read_unicode_text_file(&manifest_path)?;
    let mut val: Value = serde_json::from_str(&text)?;

    if let Value::Object(ref mut map) = val {
        map.insert("id".to_string(), Value::String(new_id.to_string()));
    }

    let out_text = serde_json::to_string_pretty(&val)?;
    fs::write(&manifest_path, out_text)?;

    // If the file was named after the old folder name/ID, rename it
    if let Some(stem) = manifest_path.file_stem().and_then(|s| s.to_str()) {
        if stem != "mod_manifest" {
            let new_path = mod_dir.join(format!("{}.json", new_id));
            if new_path != manifest_path {
                fs::rename(manifest_path, new_path)?;
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{find_manifest_path, read_manifest};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("{prefix}-{unique}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn finds_and_reads_utf8_bom_manifest() {
        let mod_dir = create_temp_dir("manifest-utf8-bom");
        let manifest_path = mod_dir.join(format!(
            "{}.json",
            mod_dir.file_name().unwrap().to_string_lossy()
        ));
        let bytes = [
            0xEF, 0xBB, 0xBF, b'{', b'"', b'i', b'd', b'"', b':', b'"', b'b', b'a', b's', b'e',
            b'l', b'i', b'b', b'"', b',', b'"', b'n', b'a', b'm', b'e', b'"', b':', b'"', b'B',
            b'a', b's', b'e', b'L', b'i', b'b', b'"', b',', b'"', b'v', b'e', b'r', b's', b'i',
            b'o', b'n', b'"', b':', b'"', b'1', b'.', b'0', b'"', b',', b'"', b'a', b'u', b't',
            b'h', b'o', b'r', b'"', b':', b'"', b'a', b'u', b't', b'h', b'o', b'r', b'"', b',',
            b'"', b'h', b'a', b's', b'_', b'p', b'c', b'k', b'"', b':', b'f', b'a', b'l', b's',
            b'e', b',', b'"', b'h', b'a', b's', b'_', b'd', b'l', b'l', b'"', b':', b't', b'r',
            b'u', b'e', b'}',
        ];
        fs::write(&manifest_path, bytes).unwrap();

        assert_eq!(
            find_manifest_path(&mod_dir).as_deref(),
            Some(manifest_path.as_path())
        );

        let manifest = read_manifest(&mod_dir).unwrap();
        assert_eq!(manifest.id.as_deref(), Some("baselib"));
        assert_eq!(manifest.version.as_deref(), Some("1.0"));
        assert_eq!(manifest.author.as_deref(), Some("author"));

        let _ = fs::remove_dir_all(&mod_dir);
    }

    #[test]
    fn finds_and_reads_utf16_le_manifest() {
        let mod_dir = create_temp_dir("manifest-utf16-le");
        let manifest_path = mod_dir.join("mod_manifest.json");
        let content = r#"{"id":"coopmod","name":"Co-op Mod","version":"2.0","author":"tester","has_pck":false,"has_dll":true,"affects_gameplay":true}"#;
        let mut bytes = vec![0xFF, 0xFE];
        for unit in content.encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        fs::write(&manifest_path, bytes).unwrap();

        assert_eq!(
            find_manifest_path(&mod_dir).as_deref(),
            Some(manifest_path.as_path())
        );

        let manifest = read_manifest(&mod_dir).unwrap();
        assert_eq!(manifest.id.as_deref(), Some("coopmod"));
        assert_eq!(manifest.name.as_deref(), Some("Co-op Mod"));
        assert_eq!(manifest.affects_gameplay, Some(true));

        let _ = fs::remove_dir_all(&mod_dir);
    }
}
