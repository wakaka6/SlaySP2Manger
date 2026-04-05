use reqwest::blocking::ClientBuilder;

use crate::app::state::AppSettings;

/// Build a `reqwest::blocking::Client` that respects the user's proxy setting.
///
/// Supports `http://`, `https://`, and `socks5://` proxy URLs.
/// If no proxy is configured, falls back to system defaults.
pub fn http_client(
    settings: &AppSettings,
    timeout_secs: u64,
) -> Result<reqwest::blocking::Client, String> {
    let mut builder = ClientBuilder::new().timeout(std::time::Duration::from_secs(timeout_secs));

    if let Some(ref proxy_url) = settings.proxy_url {
        let trimmed = proxy_url.trim();
        if !trimmed.is_empty() {
            let proxy =
                reqwest::Proxy::all(trimmed).map_err(|e| format!("Invalid proxy URL: {}", e))?;
            builder = builder.proxy(proxy);
        }
    }

    builder.build().map_err(|e| e.to_string())
}
