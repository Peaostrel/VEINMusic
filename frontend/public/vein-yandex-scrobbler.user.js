// ==UserScript==
// @name         VEINMusic Yandex Auto-Scrobbler
// @namespace    https://music.vein.guru/
// @version      2.0
// @description  Автоматический скробблинг из Яндекс.Музыки в VEINMusic прямо из вкладки браузера
// @author       VEIN
// @match        https://music.yandex.ru/*
// @match        https://music.yandex.by/*
// @match        https://music.yandex.kz/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      localhost
// @connect      127.0.0.1
// @connect      music.vein.guru
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  let API_URL = GM_getValue("vein_api_url", "http://localhost:8000");
  let API_KEY = GM_getValue("vein_api_key", "");

  if (typeof GM_registerMenuCommand !== "undefined") {
    GM_registerMenuCommand("🔑 Указать VEIN API Key", function () {
      let key = prompt("Введите ваш VEINMusic API Key:", API_KEY);
      if (key !== null) {
        GM_setValue("vein_api_key", key.trim());
        API_KEY = key.trim();
        alert("✅ VEIN API Key сохранен!");
      }
    });
    GM_registerMenuCommand("🌐 Изменить адрес сервера VEIN", function () {
      let url = prompt("Адрес VEIN сервера:", API_URL);
      if (url !== null) {
        GM_setValue("vein_api_url", url.trim().replace(/\/$/, ""));
        API_URL = url.trim().replace(/\/$/, "");
        alert("✅ Адрес сервера сохранен!");
      }
    });
  }

  function getApiKey() {
    if (API_KEY) return API_KEY;
    try {
      let local = localStorage.getItem("vein_api_key");
      if (local) return local;
    } catch (e) {}
    return "";
  }

  function sendScrobble(track, isPlaying, progressSec) {
    let key = getApiKey();
    if (!key || !track) {
      console.warn("[VEIN] API Key не настроен. Укажите ключ в меню расширения.");
      return;
    }

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

    if (typeof GM_xmlhttpRequest !== "undefined") {
      GM_xmlhttpRequest({
        method: "POST",
        url: API_URL + "/api/scrobble",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": key,
          Authorization: "Bearer " + key,
        },
        data: JSON.stringify(payload),
        onload: function (res) {
          if (res.status === 200) {
            console.log("[VEIN] ✅ Трек отправлен:", artist, "-", title);
          } else {
            console.warn("[VEIN] Ошибка сервера:", res.status, res.responseText);
          }
        },
        onerror: function (err) {
          console.error("[VEIN] Ошибка сети:", err);
        },
      });
    } else {
      fetch(API_URL + "/api/scrobble", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": key,
          Authorization: "Bearer " + key,
        },
        body: JSON.stringify(payload),
      }).catch((e) => console.error("[VEIN] Fetch error:", e));
    }
  }

  let lastTrackId = null;
  let listenedSeconds = 0;
  let hasScrobbled = false;

  function setupHooks() {
    if (!window.externalAPI) {
      setTimeout(setupHooks, 1000);
      return;
    }

    console.log("[VEIN] 🎵 Яндекс.Музыка обнаружена! Авто-скробблер активен.");

    window.externalAPI.on(window.externalAPI.EVENT_TRACK, function () {
      let track = window.externalAPI.getCurrentTrack();
      if (!track) return;

      let trackId = track.link || track.title + (track.artists ? track.artists[0]?.name : "");
      if (trackId !== lastTrackId) {
        lastTrackId = trackId;
        listenedSeconds = 0;
        hasScrobbled = false;
        sendScrobble(track, true, 0);
      }
    });

    window.externalAPI.on(window.externalAPI.EVENT_STATE, function () {
      let isPlaying = window.externalAPI.isPlaying();
      let track = window.externalAPI.getCurrentTrack();
      if (track) {
        sendScrobble(track, isPlaying, listenedSeconds);
      }
    });

    window.externalAPI.on(window.externalAPI.EVENT_PROGRESS, function () {
      let prog = window.externalAPI.getProgress();
      if (prog && prog.position !== undefined) {
        listenedSeconds = prog.position;
        let duration = prog.duration || 180;
        if (!hasScrobbled && duration >= 20 && listenedSeconds >= Math.min(duration * 0.5, 240)) {
          hasScrobbled = true;
          let track = window.externalAPI.getCurrentTrack();
          if (track) {
            sendScrobble(track, false, listenedSeconds);
          }
        }
      }
    });
  }

  setupHooks();
})();
