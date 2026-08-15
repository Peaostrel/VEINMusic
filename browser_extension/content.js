(function () {
  let SERVER_URL = "http://localhost:8000";
  let apiKey = "";

  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["vein_api_key", "vein_api_url"], function (res) {
        if (res && res.vein_api_key) apiKey = res.vein_api_key;
        if (res && res.vein_api_url) SERVER_URL = res.vein_api_url;
      });
    }
  } catch (e) {}

  function getActiveKey() {
    return apiKey || localStorage.getItem("vein_api_key") || "";
  }

  function sendScrobble(track, isPlaying, progressSec) {
    let key = getActiveKey();
    if (!key || !track) return;

    let title = track.title || "";
    let artist = track.artists
      ? track.artists.map((a) => (typeof a === "string" ? a : a.name)).join(", ")
      : "Unknown Artist";
    let album =
      track.albums && track.albums[0] ? track.albums[0].title : "";
    let cover = track.cover
      ? "https://" + track.cover.replace("%%", "400x400")
      : "";
    let trackUrl = track.link ? "https://music.yandex.ru" + track.link : "";
    let duration = track.duration || 180;

    let payload = {
      title: title,
      artist: artist,
      album: album,
      duration: duration,
      source: "yandex",
      cover_url: cover,
      track_url: trackUrl,
      is_playing: isPlaying,
      listened_sec: Math.floor(progressSec || 0),
    };

    fetch(SERVER_URL + "/api/scrobble", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (res.ok) console.log("[VEIN Extension] ✅", artist, "-", title);
      })
      .catch((e) => {});
  }

  let lastTrackId = null;
  let hasScrobbled = false;

  function init() {
    if (!window.externalAPI) {
      setTimeout(init, 1000);
      return;
    }

    console.log("[VEIN Extension] 🎧 Яндекс.Музыка перехвачена!");

    window.externalAPI.on(window.externalAPI.EVENT_TRACK, function () {
      let track = window.externalAPI.getCurrentTrack();
      if (!track) return;
      let id = track.link || track.title;
      if (id !== lastTrackId) {
        lastTrackId = id;
        hasScrobbled = false;
        sendScrobble(track, true, 0);
      }
    });

    window.externalAPI.on(window.externalAPI.EVENT_STATE, function () {
      let isPlaying = window.externalAPI.isPlaying();
      let track = window.externalAPI.getCurrentTrack();
      if (track) sendScrobble(track, isPlaying, 0);
    });

    window.externalAPI.on(window.externalAPI.EVENT_PROGRESS, function () {
      let prog = window.externalAPI.getProgress();
      if (prog && prog.position) {
        let duration = prog.duration || 180;
        if (!hasScrobbled && duration >= 20 && prog.position >= Math.min(duration * 0.5, 240)) {
          hasScrobbled = true;
          let track = window.externalAPI.getCurrentTrack();
          if (track) sendScrobble(track, false, prog.position);
        }
      }
    });
  }

  init();
})();
