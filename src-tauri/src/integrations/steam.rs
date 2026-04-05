use std::env;
use std::fs;
use std::path::PathBuf;

use crate::domain::game::GameDetectSource;
use crate::integrations::filesystem::contains_game_executable;

const GAME_FOLDER_NAME: &str = "Slay the Spire 2";
const STEAM_APP_ID: &str = "2868840";

/// Find the game installation by checking multiple sources in priority order:
/// 1. Steam registry → libraryfolders.vdf → all Steam libraries
/// 2. Common Steam default paths
/// 3. Common non-Steam install locations
///
/// Every candidate is validated with `contains_game_executable` (checks for SlayTheSpire2.exe).
pub fn find_game_install() -> Option<(PathBuf, GameDetectSource)> {
    // 1. Try Steam registry + library folders (most reliable)
    if let Some(steam_root) = read_steam_root_from_registry() {
        // Check the default steamapps/common directly
        let default_game = steam_root
            .join("steamapps")
            .join("common")
            .join(GAME_FOLDER_NAME);
        if contains_game_executable(&default_game) {
            return Some((default_game, GameDetectSource::SteamDefault));
        }

        // Parse libraryfolders.vdf for additional Steam library paths
        let vdf_path = steam_root.join("steamapps").join("libraryfolders.vdf");
        if let Some(libraries) = parse_library_folders(&vdf_path) {
            for lib_path in libraries {
                let game_path = lib_path
                    .join("steamapps")
                    .join("common")
                    .join(GAME_FOLDER_NAME);
                if contains_game_executable(&game_path) {
                    return Some((game_path, GameDetectSource::SteamLibrary));
                }
            }
        }
    }

    // 2. Fallback: brute-force common paths
    for (candidate, source) in common_candidates() {
        if contains_game_executable(&candidate) {
            return Some((candidate, source));
        }
    }

    None
}

/// Read Steam's installation path from the Windows registry.
fn read_steam_root_from_registry() -> Option<PathBuf> {
    use winreg::enums::*;
    use winreg::RegKey;

    // Try 32-bit registry view (Steam is commonly installed as x86)
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam") {
        if let Ok(path) = key.get_value::<String, _>("InstallPath") {
            let p = PathBuf::from(&path);
            if p.exists() {
                return Some(p);
            }
        }
    }

    // Try native registry view
    if let Ok(key) = hklm.open_subkey("SOFTWARE\\Valve\\Steam") {
        if let Ok(path) = key.get_value::<String, _>("InstallPath") {
            let p = PathBuf::from(&path);
            if p.exists() {
                return Some(p);
            }
        }
    }

    // Try current user
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("Software\\Valve\\Steam") {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            let p = PathBuf::from(&path);
            if p.exists() {
                return Some(p);
            }
        }
    }

    None
}

/// Parse Steam's `libraryfolders.vdf` to extract all library paths.
///
/// The VDF format looks like:
/// ```text
/// "libraryfolders"
/// {
///   "0"
///   {
///     "path"   "C:\\Program Files (x86)\\Steam"
///     "apps"   { "2868840" "..." }
///   }
///   "1"
///   {
///     "path"   "D:\\SteamLibrary"
///   }
/// }
/// ```
///
/// We extract all `"path"` values. If a block's `"apps"` section contains
/// our app ID, we prioritize it by putting it first.
fn parse_library_folders(vdf_path: &PathBuf) -> Option<Vec<PathBuf>> {
    let content = fs::read_to_string(vdf_path).ok()?;
    let mut paths: Vec<PathBuf> = Vec::new();
    let mut prioritized: Vec<PathBuf> = Vec::new();

    let mut current_path: Option<String> = None;
    let mut has_our_app = false;

    for line in content.lines() {
        let trimmed = line.trim();

        // Match "path" "VALUE"
        if trimmed.starts_with("\"path\"") {
            if let Some(value) = extract_vdf_value(trimmed) {
                current_path = Some(value);
                has_our_app = false;
            }
        }

        // Check if this library contains our game
        if trimmed.contains(&format!("\"{}\"", STEAM_APP_ID)) {
            has_our_app = true;
        }

        // When we hit a closing brace, commit the path
        if trimmed == "}" {
            if let Some(ref path) = current_path {
                let pb = PathBuf::from(path);
                if pb.exists() {
                    if has_our_app {
                        prioritized.push(pb);
                    } else {
                        paths.push(pb);
                    }
                }
                current_path = None;
                has_our_app = false;
            }
        }
    }

    // Prioritized paths (containing our app ID) go first
    prioritized.extend(paths);
    if prioritized.is_empty() {
        None
    } else {
        Some(prioritized)
    }
}

/// Extract the value from a VDF key-value line like `"path"  "C:\\SteamLibrary"`.
fn extract_vdf_value(line: &str) -> Option<String> {
    let parts: Vec<&str> = line.splitn(2, '"').collect::<Vec<_>>();
    // Split by all quotes: ["", "path", "  ", "value", ""]
    let all_quotes: Vec<&str> = line.split('"').collect();
    if all_quotes.len() >= 4 {
        // The value is at index 3 (0=empty, 1=key, 2=separator, 3=value)
        let value = all_quotes[3].replace("\\\\", "\\");
        if !value.is_empty() {
            return Some(value);
        }
    }
    let _ = parts; // suppress unused
    None
}

/// Hardcoded fallback candidates for when registry lookup fails.
fn common_candidates() -> Vec<(PathBuf, GameDetectSource)> {
    let mut result = Vec::new();

    // Default Steam paths via environment variables
    for env_key in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Ok(base) = env::var(env_key) {
            result.push((
                PathBuf::from(&base)
                    .join("Steam")
                    .join("steamapps")
                    .join("common")
                    .join(GAME_FOLDER_NAME),
                GameDetectSource::SteamDefault,
            ));
        }
    }

    // Scan drives C-H for common Steam library and game locations
    for drive in ['C', 'D', 'E', 'F', 'G', 'H'] {
        let d = format!("{}:", drive);

        // SteamLibrary on drive root
        result.push((
            PathBuf::from(format!(
                "{d}\\SteamLibrary\\steamapps\\common\\{GAME_FOLDER_NAME}"
            )),
            GameDetectSource::SteamLibrary,
        ));

        // Games/SteamLibrary
        result.push((
            PathBuf::from(format!(
                "{d}\\Games\\SteamLibrary\\steamapps\\common\\{GAME_FOLDER_NAME}"
            )),
            GameDetectSource::SteamLibrary,
        ));

        // Steam directly on drive
        result.push((
            PathBuf::from(format!("{d}\\Steam\\steamapps\\common\\{GAME_FOLDER_NAME}")),
            GameDetectSource::SteamDefault,
        ));

        // Direct game folder (non-Steam installs)
        result.push((
            PathBuf::from(format!("{d}\\Games\\{GAME_FOLDER_NAME}")),
            GameDetectSource::CommonPath,
        ));
        result.push((
            PathBuf::from(format!("{d}\\{GAME_FOLDER_NAME}")),
            GameDetectSource::CommonPath,
        ));
    }

    result
}

/// Get the current Steam Account ID for cloud save paths.
pub fn get_current_steam_account_id() -> Option<u32> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("Software\\Valve\\Steam\\ActiveProcess") {
        if let Ok(active_user) = key.get_value::<u32, _>("ActiveUser") {
            if active_user > 0 {
                return Some(active_user);
            }
        }
    }

    // Fallback: parse loginusers.vdf
    if let Some(steam_root) = read_steam_root_from_registry() {
        let vdf_path = steam_root.join("config").join("loginusers.vdf");
        if let Some(account_id) = parse_loginusers_for_account_id(&vdf_path) {
            return Some(account_id);
        }
    }

    None
}

fn parse_loginusers_for_account_id(vdf_path: &PathBuf) -> Option<u32> {
    let content = std::fs::read_to_string(vdf_path).ok()?;
    let mut current_steamid64: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        // Match user root keys which are 17-digit SteamID64s
        if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() == 19 {
            let id = trimmed.trim_matches('"');
            if id.starts_with("7656") && id.len() == 17 {
                current_steamid64 = Some(id.to_string());
            }
        }

        // VDF could be formatted with spaces or tabs
        if trimmed.contains("\"MostRecent\"") && trimmed.contains("\"1\"") {
            if let Some(ref id_str) = current_steamid64 {
                if let Ok(id_u64) = id_str.parse::<u64>() {
                    // SteamID64 to Account ID is id_u64 - 76561197960265728
                    let account_id = (id_u64 - 76561197960265728) as u32;
                    return Some(account_id);
                }
            }
        }
    }

    None
}

/// Find the exact userdata app directory for Slay the Spire 2 cloud saves.
/// Path: `<Steam root>/userdata/<Account ID>/2868840`
pub fn find_cloud_app_dir() -> Option<PathBuf> {
    let steam_root = read_steam_root_from_registry()?;
    let account_id = get_current_steam_account_id()?;

    let app_dir = steam_root
        .join("userdata")
        .join(account_id.to_string())
        .join(STEAM_APP_ID);

    if app_dir.exists() {
        Some(app_dir)
    } else {
        None
    }
}

/// Find the exact userdata path for Slay the Spire 2 cloud saves.
/// Path: `<Steam root>/userdata/<Account ID>/2868840/remote`
pub fn find_cloud_save_dir() -> Option<PathBuf> {
    let remote_dir = find_cloud_app_dir()?.join("remote");
    if remote_dir.exists() {
        Some(remote_dir)
    } else {
        None
    }
}
