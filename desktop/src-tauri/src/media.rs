//! Players on the computer, read from the Windows media panel (System Media
//! Transport Controls): Spotify, the Yandex Music app, AIMP, foobar2000,
//! browsers and anything else that shows its track there.

use crate::tracker::Snapshot;

#[cfg(windows)]
pub fn read_sessions() -> Vec<Snapshot> {
    match windows_impl::read() {
        Ok(sessions) => sessions,
        Err(e) => {
            log::debug!("media panel unavailable: {e}");
            Vec::new()
        }
    }
}

/// Other systems have no Windows media panel (the app is built for Windows;
/// this keeps it compiling and testable elsewhere).
#[cfg(not(windows))]
pub fn read_sessions() -> Vec<Snapshot> {
    Vec::new()
}

#[cfg(windows)]
mod windows_impl {
    use std::time::{SystemTime, UNIX_EPOCH};

    use windows::core::Result;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };

    use crate::tracker::Snapshot;

    /// 100 ns ticks between 1601-01-01 (Windows time) and 1970-01-01.
    const EPOCH_DIFF_TICKS: i64 = 116_444_736_000_000_000;
    const TICKS_PER_SEC: i64 = 10_000_000;

    fn now_ticks() -> i64 {
        let since_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        EPOCH_DIFF_TICKS + (since_unix.as_nanos() / 100) as i64
    }

    pub fn read() -> Result<Vec<Snapshot>> {
        let manager = Manager::RequestAsync()?.get()?;
        let sessions = manager.GetSessions()?;
        let mut out = Vec::new();
        for i in 0..sessions.Size()? {
            if let Ok(snapshot) = snapshot(&sessions.GetAt(i)?) {
                out.push(snapshot);
            }
        }
        Ok(out)
    }

    fn snapshot(session: &Session) -> Result<Snapshot> {
        let app_id = session.SourceAppUserModelId()?.to_string();
        let playing = session.GetPlaybackInfo()?.PlaybackStatus()? == Status::Playing;
        let props = session.TryGetMediaPropertiesAsync()?.get()?;
        let timeline = session.GetTimelineProperties()?;
        let start = timeline.StartTime()?.Duration;
        let end = timeline.EndTime()?.Duration;
        let mut position = timeline.Position()?.Duration - start;
        let updated = timeline.LastUpdatedTime()?.UniversalTime;
        if playing && updated > 0 {
            // The position is as of the player's last update
            position += (now_ticks() - updated).max(0);
        }
        let duration = (end - start).max(0);
        if duration > 0 {
            position = position.min(duration);
        }
        Ok(Snapshot {
            app_id,
            title: props.Title()?.to_string(),
            artist: props.Artist()?.to_string(),
            album: props.AlbumTitle()?.to_string(),
            playing,
            position_sec: (position.max(0) / TICKS_PER_SEC) as u32,
            duration_sec: (duration / TICKS_PER_SEC) as u32,
        })
    }
}
