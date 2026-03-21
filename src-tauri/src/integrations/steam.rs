use std::env;
use std::path::PathBuf;

use crate::integrations::filesystem::contains_game_executable;

pub fn find_game_install() -> Option<(PathBuf, crate::domain::game::GameDetectSource)> {
    let candidates = common_candidates();

    for (candidate, source) in candidates {
        if contains_game_executable(&candidate) {
            return Some((candidate, source));
        }
    }

    None
}

fn common_candidates() -> Vec<(PathBuf, crate::domain::game::GameDetectSource)> {
    let mut result = Vec::new();

    for env_key in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Ok(base) = env::var(env_key) {
            result.push((
                PathBuf::from(&base)
                    .join("Steam")
                    .join("steamapps")
                    .join("common")
                    .join("Slay the Spire 2"),
                crate::domain::game::GameDetectSource::SteamDefault,
            ));
        }
    }

    for drive in ['C', 'D', 'E', 'F'] {
        result.push((
            PathBuf::from(format!(
                "{drive}:\\SteamLibrary\\steamapps\\common\\Slay the Spire 2"
            )),
            crate::domain::game::GameDetectSource::SteamLibrary,
        ));
        result.push((
            PathBuf::from(format!(
                "{drive}:\\Games\\SteamLibrary\\steamapps\\common\\Slay the Spire 2"
            )),
            crate::domain::game::GameDetectSource::CommonPath,
        ));
    }

    result
}
