pub fn normalize(version: &str) -> String {
    version.trim().trim_start_matches('v').to_string()
}
