//! App settings (a JSON file in the app's config folder) and the account's
//! API key (Windows Credential Manager, not a plain file).

use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::tracker::SourceKind;

const KEYRING_SERVICE: &str = "VEINMusic";
const KEYRING_USER: &str = "api_key";

/// Which players are scrobbled.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Sources {
    pub spotify: bool,
    /// The Yandex Music app. Off when the account already has Yandex
    /// connected on the site: the server scrobbles it directly.
    pub yandex: bool,
    /// Browser tabs. Off by default: the VEIN extension covers them.
    pub browsers: bool,
    /// AIMP, foobar2000, VLC, Apple Music, MusicBee and the rest.
    pub other: bool,
}

impl Default for Sources {
    fn default() -> Self {
        Sources {
            spotify: true,
            yandex: true,
            browsers: false,
            other: true,
        }
    }
}

impl Sources {
    pub fn allows(&self, kind: SourceKind) -> bool {
        match kind {
            SourceKind::Spotify => self.spotify,
            SourceKind::Yandex => self.yandex,
            SourceKind::Browser => self.browsers,
            SourceKind::Other => self.other,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub scrobbling: bool,
    pub discord: bool,
    pub sources: Sources,
    /// The connected account, shown in the app.
    pub username: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            scrobbling: true,
            discord: true,
            sources: Sources::default(),
            username: None,
        }
    }
}

impl Settings {
    pub fn load(path: &Path) -> Self {
        fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let text = serde_json::to_string_pretty(self).map_err(io::Error::other)?;
        fs::write(path, text)
    }

    /// Switch one option by name (from the settings window).
    pub fn set(&mut self, name: &str, value: bool) -> bool {
        let slot = match name {
            "scrobbling" => &mut self.scrobbling,
            "discord" => &mut self.discord,
            "sources.spotify" => &mut self.sources.spotify,
            "sources.yandex" => &mut self.sources.yandex,
            "sources.browsers" => &mut self.sources.browsers,
            "sources.other" => &mut self.sources.other,
            _ => return false,
        };
        *slot = value;
        true
    }
}

fn entry() -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()
}

pub fn load_api_key() -> Option<String> {
    entry()?.get_password().ok().filter(|k| !k.is_empty())
}

pub fn save_api_key(key: &str) -> Result<(), String> {
    entry()
        .ok_or_else(|| "Хранилище учётных данных Windows недоступно".to_string())?
        .set_password(key)
        .map_err(|e| format!("Не удалось сохранить ключ: {e}"))
}

pub fn delete_api_key() {
    if let Some(entry) = entry() {
        let _ = entry.delete_credential();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_or_old_file_gets_defaults() {
        let dir = std::env::temp_dir().join(format!("vein-settings-{}", std::process::id()));
        let path = dir.join("settings.json");
        assert_eq!(Settings::load(&path), Settings::default());

        fs::create_dir_all(&dir).unwrap();
        fs::write(
            &path,
            r#"{"discord": false, "sources": {"browsers": true}}"#,
        )
        .unwrap();
        let s = Settings::load(&path);
        assert!(!s.discord && s.scrobbling);
        assert!(s.sources.browsers && s.sources.spotify);

        let mut s = s;
        assert!(s.set("sources.yandex", false));
        assert!(!s.set("unknown", true));
        s.save(&path).unwrap();
        assert!(!Settings::load(&path).sources.yandex);
        let _ = fs::remove_dir_all(dir);
    }
}
