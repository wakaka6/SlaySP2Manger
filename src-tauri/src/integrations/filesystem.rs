use std::fs;
use std::path::Path;

pub fn contains_game_executable(path: &Path) -> bool {
    path.join("SlayTheSpire2.exe").is_file()
}

pub fn list_directories(path: &Path) -> Vec<std::path::PathBuf> {
    match fs::read_dir(path) {
        Ok(entries) => entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .collect(),
        Err(_) => Vec::new(),
    }
}
