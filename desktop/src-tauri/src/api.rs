//! VEINMusic API: device pairing, scrobbles, account info; GitHub releases
//! for update checks.

use std::time::Duration;

use serde::Deserialize;
use serde_json::json;

use crate::tracker::{is_newer, version_key, Report};

const DEFAULT_API: &str = "https://api.music.vein.guru";
const DEFAULT_SITE: &str = "https://music.vein.guru";
const RELEASES_URL: &str = "https://api.github.com/repos/Peaostrel/VEINMusic/releases?per_page=20";
const RELEASE_TAG_PREFIX: &str = "desktop-v";
pub const CLIENT_NAME: &str = "VEINMusic для Windows";

/// VEIN_API_URL / VEIN_SITE_URL point a build at a local server.
pub fn api_base() -> String {
    std::env::var("VEIN_API_URL")
        .unwrap_or_else(|_| DEFAULT_API.into())
        .trim_end_matches('/')
        .into()
}

pub fn site_base() -> String {
    std::env::var("VEIN_SITE_URL")
        .unwrap_or_else(|_| DEFAULT_SITE.into())
        .trim_end_matches('/')
        .into()
}

#[derive(Debug)]
pub enum ApiError {
    /// The key was revoked or the account banned: pair again.
    Unauthorized,
    Other(String),
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiError::Unauthorized => write!(f, "Ключ приложения больше не действует"),
            ApiError::Other(message) => write!(f, "{message}"),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri_complete: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Deserialize)]
pub struct TokenAnswer {
    pub status: String,
    pub api_key: Option<String>,
    pub username: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Update {
    pub version: String,
    pub url: String,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

#[derive(Clone)]
pub struct Api {
    client: reqwest::Client,
    base: String,
}

impl Api {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(concat!("VEINMusic-Desktop/", env!("CARGO_PKG_VERSION")))
            .timeout(Duration::from_secs(12))
            .build()
            .expect("HTTP client");
        Api {
            client,
            base: api_base(),
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base, path)
    }

    pub async fn start_pairing(&self) -> Result<DeviceCode, ApiError> {
        let res = self
            .client
            .post(self.url("/api/devices/code"))
            .json(&json!({ "client_name": CLIENT_NAME }))
            .send()
            .await
            .map_err(network)?;
        if !res.status().is_success() {
            return Err(ApiError::Other(format!("Сервер ответил {}", res.status())));
        }
        res.json().await.map_err(network)
    }

    pub async fn poll_token(&self, device_code: &str) -> Result<TokenAnswer, ApiError> {
        let res = self
            .client
            .post(self.url("/api/devices/token"))
            .json(&json!({ "device_code": device_code }))
            .send()
            .await
            .map_err(network)?;
        res.json().await.map_err(network)
    }

    /// Returns the server's status ("ok", "rate_limited", ...).
    pub async fn scrobble(&self, key: &str, report: &Report) -> Result<String, ApiError> {
        let res = self
            .client
            .post(self.url("/api/scrobble"))
            .header("X-API-Key", key)
            .json(report)
            .send()
            .await
            .map_err(network)?;
        let status = res.status();
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(ApiError::Unauthorized);
        }
        if !status.is_success() {
            return Err(ApiError::Other(format!("Сервер ответил {status}")));
        }
        let body: serde_json::Value = res.json().await.map_err(network)?;
        Ok(body
            .get("status")
            .and_then(|s| s.as_str())
            .unwrap_or("ok")
            .to_string())
    }

    /// Whether the account has Yandex Music connected on the site.
    pub async fn yandex_linked(&self, key: &str, username: &str) -> Option<bool> {
        let res = self
            .client
            .get(self.url(&format!("/api/user/{username}")))
            .header("X-API-Key", key)
            .send()
            .await
            .ok()?;
        let body: serde_json::Value = res.json().await.ok()?;
        body.get("yandex_linked").and_then(|v| v.as_bool())
    }

    /// The newest published desktop release, if newer than this build.
    pub async fn check_update(&self) -> Option<Update> {
        let releases: Vec<Release> = self
            .client
            .get(RELEASES_URL)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .ok()?
            .json()
            .await
            .ok()?;
        releases
            .into_iter()
            .filter(|r| !r.draft && !r.prerelease)
            .filter_map(|r| {
                let version = r.tag_name.strip_prefix(RELEASE_TAG_PREFIX)?.to_string();
                Some(Update {
                    version,
                    url: r.html_url,
                })
            })
            .filter(|u| is_newer(&u.version, env!("CARGO_PKG_VERSION")))
            .max_by_key(|u| version_key(&u.version))
    }
}

fn network(e: reqwest::Error) -> ApiError {
    ApiError::Other(if e.is_timeout() || e.is_connect() {
        "Нет связи с сервером VEINMusic".to_string()
    } else {
        format!("Ошибка сети: {e}")
    })
}
