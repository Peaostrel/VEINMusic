//! What plays on the computer and when to tell VEINMusic about it.
//!
//! Pure logic without Windows APIs, so it is unit-tested on any system.
//! The server adds listening time between two "still playing" reports that
//! are less than 35 s apart, so the app reports right away on a track switch,
//! pause or resume, and every 15 s while a track plays.

use serde::Serialize;

/// A report is due at least this often while a track plays.
pub const KEEPALIVE_MS: u64 = 15_000;

/// One media session from the Windows media panel.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Snapshot {
    /// The player's app id, e.g. "Spotify.exe" or "chrome.exe".
    pub app_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
    pub position_sec: u32,
    pub duration_sec: u32,
}

impl Snapshot {
    fn same_track(&self, other: &Snapshot) -> bool {
        self.app_id == other.app_id && self.title == other.title && self.artist == other.artist
    }

    /// Something worth scrobbling: a named track, not an ad.
    fn is_track(&self) -> bool {
        let title = self.title.trim();
        let artist = self.artist.trim();
        if title.is_empty() || artist.is_empty() {
            return false; // Spotify ads, podcasts without an author, silence
        }
        !(classify(&self.app_id) == SourceKind::Spotify
            && (title.eq_ignore_ascii_case("advertisement")
                || artist.eq_ignore_ascii_case("spotify")))
    }
}

/// Groups of players the user can switch on and off.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SourceKind {
    Spotify,
    Yandex,
    Browser,
    Other,
}

const BROWSERS: [&str; 9] = [
    "chrome",
    "msedge",
    "firefox",
    "opera",
    "brave",
    "vivaldi",
    "browser.exe",
    "yandex.browser",
    "arc.exe",
];

pub fn classify(app_id: &str) -> SourceKind {
    let id = app_id.to_lowercase();
    if id.contains("spotify") {
        SourceKind::Spotify
    } else if id.contains("yandex") && id.contains("music") {
        SourceKind::Yandex
    } else if BROWSERS.iter().any(|b| id.contains(b)) {
        SourceKind::Browser
    } else {
        SourceKind::Other
    }
}

/// The `source` sent to the API. Every name contains "desktop", so the feed
/// shows these plays under "Приложение" as well as under their service.
pub fn source_name(app_id: &str) -> &'static str {
    let id = app_id.to_lowercase();
    match classify(app_id) {
        SourceKind::Spotify => "spotify_desktop",
        SourceKind::Yandex => "yandex_desktop",
        SourceKind::Browser => "browser_desktop",
        SourceKind::Other if id.contains("apple") => "apple_desktop",
        SourceKind::Other if id.contains("youtube") => "youtube_desktop",
        SourceKind::Other if id.contains("vk") => "vk_desktop",
        SourceKind::Other => "desktop",
    }
}

/// A short player name for the app's window and the tray.
pub fn player_label(app_id: &str) -> String {
    match classify(app_id) {
        SourceKind::Spotify => "Spotify".into(),
        SourceKind::Yandex => "Яндекс Музыка".into(),
        SourceKind::Browser => "Браузер".into(),
        SourceKind::Other => {
            // "C:\\...\\AIMP.exe", "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"
            let name = app_id.rsplit(['\\', '/', '!']).next().unwrap_or(app_id);
            let name = name
                .strip_suffix(".exe")
                .or_else(|| name.strip_suffix(".EXE"))
                .unwrap_or(name);
            if name.is_empty() {
                "Плеер".into()
            } else {
                name.to_string()
            }
        }
    }
}

/// The session to scrobble: the first allowed one that plays a track.
pub fn pick(sessions: &[Snapshot], allowed: impl Fn(SourceKind) -> bool) -> Option<Snapshot> {
    sessions
        .iter()
        .find(|s| s.playing && s.is_track() && allowed(classify(&s.app_id)))
        .cloned()
}

/// Body of POST /api/scrobble.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Report {
    pub title: String,
    pub artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    pub source: String,
    pub progress_sec: u32,
    pub is_playing: bool,
    pub duration: u32,
    #[serde(skip)]
    track: Snapshot,
}

impl Report {
    fn of(track: &Snapshot, is_playing: bool) -> Self {
        let album = track.album.trim();
        Report {
            title: track.title.trim().to_string(),
            artist: track.artist.trim().to_string(),
            album: (!album.is_empty()).then(|| album.to_string()),
            source: source_name(&track.app_id).to_string(),
            progress_sec: track.position_sec,
            is_playing,
            duration: track.duration_sec,
            track: track.clone(),
        }
    }
}

#[derive(Default)]
pub struct Tracker {
    /// The track last reported and whether it was playing then.
    current: Option<Snapshot>,
    reported_playing: bool,
    last_sent_ms: u64,
}

impl Tracker {
    /// The report due now, if any. `playing` is what plays now (see `pick`).
    pub fn decide(&self, playing: Option<&Snapshot>, now_ms: u64) -> Option<Report> {
        match playing {
            Some(track) => {
                let same = self.current.as_ref().is_some_and(|c| c.same_track(track));
                let due = now_ms.saturating_sub(self.last_sent_ms) >= KEEPALIVE_MS;
                (!same || !self.reported_playing || due).then(|| Report::of(track, true))
            }
            // Paused, stopped, switched off: the track shown as playing stops
            None => match (&self.current, self.reported_playing) {
                (Some(track), true) => Some(Report::of(track, false)),
                _ => None,
            },
        }
    }

    /// The server accepted `report`.
    pub fn sent(&mut self, report: &Report, now_ms: u64) {
        self.current = Some(report.track.clone());
        self.reported_playing = report.is_playing;
        self.last_sent_ms = now_ms;
    }

    /// Forget everything (signed out).
    pub fn reset(&mut self) {
        *self = Tracker::default();
    }
}

/// A newer release than this build? Versions like "0.2.1".
pub fn is_newer(candidate: &str, current: &str) -> bool {
    version_key(candidate) > version_key(current)
}

/// "0.2.1" -> [0, 2, 1], for ordering releases.
pub fn version_key(version: &str) -> Vec<u64> {
    version
        .trim_start_matches('v')
        .split('.')
        .map(|p| p.parse().unwrap_or(0))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(app: &str, title: &str, playing: bool, pos: u32) -> Snapshot {
        Snapshot {
            app_id: app.into(),
            title: title.into(),
            artist: "Кино".into(),
            album: "Группа крови".into(),
            playing,
            position_sec: pos,
            duration_sec: 284,
        }
    }

    #[test]
    fn players_are_classified() {
        assert_eq!(classify("Spotify.exe"), SourceKind::Spotify);
        assert_eq!(
            classify("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"),
            SourceKind::Spotify
        );
        assert_eq!(classify("ru.yandex.desktop.music"), SourceKind::Yandex);
        assert_eq!(classify("chrome.exe"), SourceKind::Browser);
        assert_eq!(classify("MSEdge"), SourceKind::Browser);
        assert_eq!(classify("AIMP.exe"), SourceKind::Other);
        assert_eq!(source_name("Spotify.exe"), "spotify_desktop");
        assert_eq!(
            source_name("AppleInc.AppleMusicWin_nzyj5cx40ttqa!App"),
            "apple_desktop"
        );
        assert_eq!(source_name("foobar2000.exe"), "desktop");
        assert_eq!(player_label("C:\\Program Files\\AIMP\\AIMP.exe"), "AIMP");
        assert_eq!(player_label("Spotify.exe"), "Spotify");
    }

    #[test]
    fn pick_skips_ads_paused_and_disabled_players() {
        let ad = Snapshot {
            artist: "".into(),
            ..track("Spotify.exe", "Advertisement", true, 0)
        };
        let paused = track("AIMP.exe", "Кукушка", false, 10);
        let browser = track("chrome.exe", "Звезда", true, 5);
        let spotify = track("Spotify.exe", "Группа крови", true, 30);
        let sessions = vec![ad, paused, browser, spotify.clone()];
        let picked = pick(&sessions, |k| k != SourceKind::Browser);
        assert_eq!(picked, Some(spotify));
        assert_eq!(pick(&sessions, |_| false), None);
    }

    #[test]
    fn reports_switch_at_once_keepalive_and_pause() {
        let mut t = Tracker::default();
        let a = track("Spotify.exe", "Группа крови", true, 0);

        let r = t.decide(Some(&a), 1_000).expect("start is reported");
        assert!(r.is_playing);
        assert_eq!(r.source, "spotify_desktop");
        t.sent(&r, 1_000);

        assert!(t.decide(Some(&a), 5_000).is_none(), "nothing new yet");
        let keepalive = t.decide(Some(&a), 16_000).expect("still playing");
        t.sent(&keepalive, 16_000);

        let b = track("Spotify.exe", "Кукушка", true, 0);
        assert_eq!(
            t.decide(Some(&b), 17_000).map(|r| r.title),
            Some("Кукушка".into())
        );

        let pause = t.decide(None, 17_000).expect("pause is reported");
        assert!(!pause.is_playing);
        assert_eq!(pause.title, "Группа крови");
        t.sent(&pause, 17_000);
        assert!(t.decide(None, 40_000).is_none(), "a pause is reported once");
    }

    #[test]
    fn unsent_report_is_retried() {
        let t = Tracker::default();
        let a = track("Spotify.exe", "Группа крови", true, 0);
        assert!(t.decide(Some(&a), 1_000).is_some());
        // The server refused (rate limit): nothing recorded, due again
        assert!(t.decide(Some(&a), 4_000).is_some());
    }

    #[test]
    fn versions_compare() {
        assert!(is_newer("0.2.0", "0.1.9"));
        assert!(is_newer("v1.0.0", "0.9.9"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.0.9", "0.1.0"));
    }
}
