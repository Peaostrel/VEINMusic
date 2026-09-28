//! "Listening on VEINMusic" status in Discord. Needs a Discord application:
//! its id is set at build time (VEIN_DISCORD_CLIENT_ID); without it the
//! option is hidden.

use std::time::{SystemTime, UNIX_EPOCH};

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};

use crate::tracker::Snapshot;

const CLIENT_ID: Option<&str> = option_env!("VEIN_DISCORD_CLIENT_ID");

pub fn available() -> bool {
    CLIENT_ID.is_some_and(|id| !id.trim().is_empty())
}

#[derive(Default)]
pub struct Discord {
    client: Option<DiscordIpcClient>,
    shown: Option<String>,
}

impl Discord {
    /// Show `track` (or nothing). Discord may be closed: errors are
    /// swallowed and the connection is retried on the next change.
    pub fn show(&mut self, track: Option<&Snapshot>) {
        let key = track.map(|t| format!("{}\u{1}{}\u{1}{}", t.app_id, t.artist, t.title));
        if key == self.shown {
            return;
        }
        let result = match track {
            Some(t) => self.set(t),
            None => self.clear(),
        };
        match result {
            Ok(()) => self.shown = key,
            Err(e) => {
                log::debug!("Discord status: {e}");
                self.client = None; // reconnect next time
                self.shown = None;
            }
        }
    }

    fn connected(&mut self) -> Result<&mut DiscordIpcClient, Box<dyn std::error::Error>> {
        if self.client.is_none() {
            let id = CLIENT_ID.ok_or("no Discord client id")?;
            let mut client = DiscordIpcClient::new(id)?;
            client.connect()?;
            self.client = Some(client);
        }
        Ok(self.client.as_mut().expect("connected"))
    }

    fn set(&mut self, t: &Snapshot) -> Result<(), Box<dyn std::error::Error>> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let started = now - i64::from(t.position_sec);
        let mut timestamps = activity::Timestamps::new().start(started);
        if t.duration_sec > 0 {
            timestamps = timestamps.end(started + i64::from(t.duration_sec));
        }
        let details = t.title.clone();
        let state = t.artist.clone();
        let payload = activity::Activity::new()
            .details(&details)
            .state(&state)
            .timestamps(timestamps)
            .assets(
                activity::Assets::new()
                    .large_image("logo")
                    .large_text("VEINMusic"),
            );
        self.connected()?.set_activity(payload)?;
        Ok(())
    }

    fn clear(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(client) = self.client.as_mut() {
            client.clear_activity()?;
        }
        Ok(())
    }
}
