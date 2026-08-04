/**
 * VEIN Music Extension Content Script
 * -----------------------------------
 * Основной скрипт расширения.
 * Перехватывает данные о текущем треке с поддерживаемых сайтов
 * и отправляет их на бэкенд VEIN для скроблинга.
 */
console.log("[VEIN] 💉 content.js запущен: Внедряем page_world.js в обход защиты Яндекса...");

// Легальный инжект файла, который не блокируется Content-Security-Policy
const script = document.createElement('script');
script.src = chrome.runtime.getURL('page_world.js');
script.onload = function() {
    this.remove(); // Убираем следы из DOM после загрузки
};
(document.head || document.documentElement).appendChild(script);

// Слушаем сообщения от page_world.js и передаем их в ядро расширения
globalThis.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    if (event.source != globalThis || event.data?.type !== 'VEIN_SCROBBLE') return;
    
    chrome.runtime.sendMessage({ 
        type: 'SCROBBLE', 
        data: event.data.payload 
    }).catch(() => {});
});

// Helper to extract metadata from MediaSession
function getMediaSessionMetadata() {
    if (navigator.mediaSession?.metadata) {
        const meta = navigator.mediaSession.metadata;
        if (meta.title) {
            let title = meta.title;
            let artist = meta.artist || '';
            let cover = '';
            if (meta.artwork?.length > 0) {
                cover = meta.artwork.at(-1)?.src || '';
                cover = cover.replace(/\d{1,4}x\d{1,4}/, '400x400');
            }
            return { title, artist, cover };
        }
    }
    return null;
}

// Helper to extract metadata from DOM
function getDOMMetadata() {
    const titleEl = document.querySelector('.track__title, .track__name');
    const artistEl = document.querySelector('.track__artists, .d-artists');
    if (titleEl) {
        let title = titleEl.textContent.trim();
        let artist = artistEl ? artistEl.textContent.trim() : '';
        let cover = '';
        const coverEl = document.querySelector('.entity-cover__image, .track-cover');
        if (coverEl?.src) {
            cover = coverEl.src.replace(/\d{1,4}x\d{1,4}/, '400x400');
        }
        return { title, artist, cover };
    }
    return null;
}

// Helper to get playback status
function getPlaybackStatus() {
    let isPlaying = navigator.mediaSession?.playbackState === 'playing';
    const playBtn = document.querySelector('.player-controls__btn_play');
    if (playBtn?.classList.contains('player-controls__btn_pause')) {
        isPlaying = true;
    }

    let progressSec = 0;
    let durationSec = 0;
    const allMedia = Array.from(document.querySelectorAll('audio, video'));
    const activeMedia = allMedia.filter(m => !m.paused && m.duration > 0).sort((a, b) => b.currentTime - a.currentTime)[0];
    
    if (activeMedia) {
        isPlaying = true;
        progressSec = Math.floor(activeMedia.currentTime);
        durationSec = Math.floor(activeMedia.duration) || 0;
    } else {
        const pausedMedia = allMedia.filter(m => m.currentTime > 0).sort((a, b) => b.currentTime - a.currentTime)[0];
        if (pausedMedia) {
            progressSec = Math.floor(pausedMedia.currentTime);
            durationSec = Math.floor(pausedMedia.duration) || 0;
        }
    }
    return { isPlaying, progressSec, durationSec };
}

// ULTIMATE FALLBACK: Если page_world.js заблокирован браузером
setInterval(() => {
    try {
        const host = window.location.hostname;
        if (!host.includes('yandex')) return;

        let meta = getMediaSessionMetadata() || getDOMMetadata();
        
        if (meta?.title) {
            const { isPlaying, progressSec, durationSec } = getPlaybackStatus();

            chrome.runtime.sendMessage({ 
                type: 'SCROBBLE', 
                data: {
                    title: meta.title,
                    artist: meta.artist,
                    album: "",
                    cover_url: meta.cover,
                    track_url: window.location.href,
                    source: "yandex",
                    progress_sec: progressSec,
                    is_playing: isPlaying,
                    duration: durationSec
                }
            }).catch(() => {});
        }
    } catch (e) {
        // Игнорируем ошибки при закрытии вкладки
        console.debug("VEINMusic: page parse error", e);
    }
}, 5000);