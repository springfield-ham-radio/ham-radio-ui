use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::time::Duration;

use url::Url;

const MAX_BODY_BYTES: usize = 1_000_000;
const MAX_REDIRECTS: usize = 5;
const FETCH_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelPackFetchResult {
    pub text: String,
    pub final_url: String,
    pub content_type: Option<String>,
}

fn hambench_user_agent() -> String {
    format!(
        "HamBench/{} (+https://github.com/springfield-ham-radio/ham-radio-ui)",
        env!("CARGO_PKG_VERSION")
    )
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(hambench_user_agent())
        .timeout(FETCH_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| error.to_string())
}

/// Returns an error message when the URL must not be fetched.
pub fn validate_channel_pack_fetch_url(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url.trim()).map_err(|error| error.to_string())?;

    if parsed.scheme() != "https" {
        return Err("Channel pack URL must use https".into());
    }

    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Channel pack URL cannot include credentials".into());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "Channel pack URL is missing a host".to_string())?;

    if is_forbidden_host(host) {
        return Err("Channel pack URL host is not allowed".into());
    }

    Ok(parsed)
}

fn is_forbidden_host(host: &str) -> bool {
    let lower = host.to_ascii_lowercase();

    if lower == "localhost" || lower.ends_with(".localhost") || lower.ends_with(".local") {
        return true;
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_forbidden_ip(ip);
    }

    false
}

fn is_forbidden_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_forbidden_ipv4(v4),
        IpAddr::V6(v6) => is_forbidden_ipv6(v6),
    }
}

fn is_forbidden_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || ip.octets()[0] == 169 && ip.octets()[1] == 254
}

fn is_forbidden_ipv6(ip: Ipv6Addr) -> bool {
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_unique_local()
        || (ip.segments()[0] & 0xfe00) == 0xfe80
}

/// After a redirect, the next URL must pass the same rules.
pub fn validate_redirect_location(location: &str, previous: &Url) -> Result<Url, String> {
    let next = if location.starts_with("http://") || location.starts_with("https://") {
        Url::parse(location).map_err(|error| error.to_string())?
    } else {
        previous
            .join(location)
            .map_err(|error| error.to_string())?
    };

    validate_channel_pack_fetch_url(next.as_str())
}

fn content_type_allowed(content_type: Option<&str>) -> Result<(), String> {
    let raw = content_type.map(|value| value.split(';').next().unwrap_or(value).trim().to_ascii_lowercase());

    if raw.as_deref().is_none_or(|value| value.is_empty()) {
        return Ok(());
    }

    let value = raw.unwrap();

    if value.starts_with("text/")
        || value == "application/json"
        || value == "application/octet-stream"
    {
        return Ok(());
    }

    if value.starts_with("image/")
        || value.starts_with("audio/")
        || value.starts_with("video/")
        || value == "application/pdf"
        || value == "application/zip"
    {
        return Err(format!("Unexpected content type: {value}"));
    }

    Ok(())
}

async fn read_limited_body(response: reqwest::Response) -> Result<Vec<u8>, String> {
    if let Some(length) = response.content_length() {
        if length as usize > MAX_BODY_BYTES {
            return Err(format!(
                "Channel pack is too large (maximum {MAX_BODY_BYTES} characters)"
            ));
        }
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| error.to_string())?;

    if bytes.len() > MAX_BODY_BYTES {
        return Err(format!(
            "Channel pack is too large (maximum {MAX_BODY_BYTES} characters)"
        ));
    }

    Ok(bytes.to_vec())
}

#[tauri::command]
pub async fn fetch_channel_pack(url: String) -> Result<ChannelPackFetchResult, String> {
    let initial = validate_channel_pack_fetch_url(&url)?;
    let http = client()?;
    let mut current = initial;
    let mut redirects = 0usize;

    loop {
        let response = http
            .get(current.clone())
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    "Channel pack download timed out".to_string()
                } else {
                    error.to_string()
                }
            })?;

        if response.status().is_redirection() {
            if redirects >= MAX_REDIRECTS {
                return Err("Channel pack download followed too many redirects".into());
            }

            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "Channel pack redirect is missing a Location header".to_string())?;

            current = validate_redirect_location(location, &current)?;
            redirects += 1;
            continue;
        }

        if !response.status().is_success() {
            return Err(format!(
                "Channel pack download failed: HTTP {}",
                response.status()
            ));
        }

        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string());

        content_type_allowed(content_type.as_deref())?;

        let bytes = read_limited_body(response).await?;
        let text = String::from_utf8(bytes).map_err(|_| "Channel pack body is not valid UTF-8".to_string())?;

        return Ok(ChannelPackFetchResult {
            text,
            final_url: current.to_string(),
            content_type,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_http_and_local_hosts() {
        assert!(validate_channel_pack_fetch_url("http://example.com/pack.hpack").is_err());
        assert!(validate_channel_pack_fetch_url("https://localhost/pack.hpack").is_err());
        assert!(validate_channel_pack_fetch_url("https://127.0.0.1/pack.hpack").is_err());
        assert!(validate_channel_pack_fetch_url("https://club.local/pack.hpack").is_err());
    }

    #[test]
    fn accepts_public_https() {
        let url = validate_channel_pack_fetch_url(
            "https://raw.githubusercontent.com/springfield-ham-radio/ham-radio-ui/main/public/fixtures/sample-club.hpack",
        )
        .expect("public https url");
        assert_eq!(url.host_str(), Some("raw.githubusercontent.com"));
    }

    #[test]
    fn redirect_must_stay_allowed() {
        let base = validate_channel_pack_fetch_url("https://example.com/a.hpack").unwrap();
        assert!(validate_redirect_location("https://evil.local/b.hpack", &base).is_err());
        let next = validate_redirect_location("/b.hpack", &base).expect("relative redirect");
        assert_eq!(next.path(), "/b.hpack");
    }

    #[test]
    fn content_type_gate() {
        assert!(content_type_allowed(Some("text/plain")).is_ok());
        assert!(content_type_allowed(Some("application/json")).is_ok());
        assert!(content_type_allowed(None).is_ok());
        assert!(content_type_allowed(Some("image/png")).is_err());
    }
}
