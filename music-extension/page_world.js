if (globalThis != globalThis.top) {
    throw new Error("VEIN: Остановка клона во фрейме.");
}

if (globalThis.__VEIN_LOADED) {
    throw new Error("VEIN: Обнаружен старый скрипт.");
}
globalThis.__VEIN_LOADED = true;

console.log("[VEIN MAIN] 🌍 Мультиплатформенный трекер запущен. Взламываем аудио-движок...");

if (!globalThis.__VEIN_AUDIO_HOOK) {
    globalThis.__VEIN_AUDIO_HOOK = true;
    globalThis.__vein_audio_elements = new Set(); 
    
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
        globalThis.__vein_audio_elements.add(this); 
        return originalPlay.apply(this, arguments);
    };
}

function isHostOrSubdomain(hostname, domain) {
    return hostname === domain || hostname.endsWith(`.${domain}`);
}

function getPlatformSource(hostname) {
    if (isHostOrSubdomain(hostname, 'music.yandex.ru') || isHostOrSubdomain(hostname, 'music.yandex.com')) return 'yandex';
    if (isHostOrSubdomain(hostname, 'spotify.com')) return 'spotify';
    if (isHostOrSubdomain(hostname, 'music.youtube.com')) return 'youtube_music';
    if (isHostOrSubdomain(hostname, 'soundcloud.com')) {
        const adBadge = document.querySelector('.sc-snippet-ad, .adOverlay, [aria-label="Advertisement"]');
        const titleEl = document.querySelector('.playbackSoundBadge__titleLink');
        if (adBadge || titleEl?.href?.includes('/ads/')) return null; 
        return 'soundcloud';
    }
    if (isHostOrSubdomain(hostname, 'music.apple.com')) return 'apple_music';
    if (isHostOrSubdomain(hostname, 'vk.com')) {
        const isVideoPlaying = Array.from(document.querySelectorAll('video')).some(v => !v.paused && v.offsetHeight > 150 && v.offsetWidth > 150);
        if (!isVideoPlaying) return 'vk';
    }
    return null;
}

function getArtworkCover(metadata, source) {
    if (!metadata?.artwork?.length) return '';
    const coverRaw = metadata.artwork.at(-1).src;
    if (source === 'yandex' || source === 'vk') {
        return coverRaw.replace(/\d{1,4}x\d{1,4}/, '400x400');
    }
    if (source === 'youtube_music') {
        return coverRaw.includes('=') ? coverRaw.split('=')[0] + '=w500-h500' : coverRaw;
    }
    return coverRaw;
}

function getTrackUrlForSource(source, trackTitle) {
    if (source === 'yandex') {
        const trackLinks = Array.from(document.querySelectorAll('a[href*="/track/"]'));
        const correctLink = [...trackLinks].reverse().find(a => a.textContent.includes(trackTitle) || trackTitle.includes(a.textContent)) || trackLinks[0];
        return correctLink ? correctLink.href : globalThis.location.href;
    }
    if (source === 'spotify') {
        const trackLink = document.querySelector('a[data-testid="context-item-link"]');
        return trackLink ? trackLink.href : globalThis.location.href;
    }
    return globalThis.location.href;
}

function getVkMetadata() {
    const vkTitleEl = document.querySelector('.top_audio_player_title') || document.querySelector('.audio_page_player_title_performer');
    if (!vkTitleEl?.textContent) return null;

    const trackTitle = vkTitleEl.textContent.trim();
    let trackArtist = '';
    let trackCover = '';

    const vkArtistEl = document.querySelector('.top_audio_player_artist');
    if (vkArtistEl) trackArtist = vkArtistEl.textContent.trim();

    const vkCoverEl = document.querySelector('.top_audio_player_cover');
    if (vkCoverEl) {
        const bg = globalThis.getComputedStyle(vkCoverEl).backgroundImage;
        if (bg && bg !== 'none') {
            trackCover = bg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '').replace(/\d{1,4}x\d{1,4}/, '400x400');
        }
    }

    return {
        title: trackTitle,
        artist: trackArtist,
        album: '',
        cover: trackCover,
        url: globalThis.location.href
    };
}

function getMediaProgress(sessionPlaying) {
    const allMedia = Array.from(globalThis.__vein_audio_elements || []).concat(Array.from(document.querySelectorAll('audio, video')));
    const activeMedia = allMedia.filter(m => !m.paused && m.duration > 0).sort((a, b) => b.currentTime - a.currentTime)[0];
    
    let isPlaying = false;
    let progressSec = 0;
    let durationSec = 0;

    if (activeMedia) {
        isPlaying = true;
        progressSec = Math.floor(activeMedia.currentTime);
        durationSec = Math.floor(activeMedia.duration) || 0;
    } else {
        isPlaying = allMedia.length > 0 ? false : sessionPlaying;
        const pausedMedia = allMedia.filter(m => m.currentTime > 0).sort((a, b) => b.currentTime - a.currentTime)[0];
        if (pausedMedia) {
            progressSec = Math.floor(pausedMedia.currentTime);
            durationSec = Math.floor(pausedMedia.duration) || 0;
        }
    }
    
    try {
        if (globalThis.externalAPI) {
            isPlaying = globalThis.externalAPI.isPlaying();
            const progressObj = globalThis.externalAPI.getProgress();
            if (progressObj) {
                progressSec = Math.floor(progressObj.position || 0);
                durationSec = Math.floor(progressObj.duration || 0);
            }
        }
    } catch(e) {}

    return { isPlaying, progressSec, durationSec };
}

function getMediaSessionMeta(source) {
    const metadata = navigator.mediaSession?.metadata;
    if (!metadata?.title) return null;
    const trackTitle = metadata.title;
    const trackArtist = metadata.artist || '';
    const trackAlbum = metadata.album || '';
    if (source === 'soundcloud' && (!trackArtist || trackArtist.toLowerCase().includes('advertisement') || trackArtist.toLowerCase().includes('soundcloud'))) return null;
    const trackCover = getArtworkCover(metadata, source);
    const trackUrl = getTrackUrlForSource(source, trackTitle);
    return { trackTitle, trackArtist, trackAlbum, trackCover, trackUrl };
}

function getYandexMeta() {
    if (!globalThis.externalAPI) return null;
    try {
        const yandexTrack = globalThis.externalAPI.getCurrentTrack();
        if (yandexTrack) {
            const trackTitle = yandexTrack.title;
            const trackArtist = yandexTrack.artists ? yandexTrack.artists.map(a => a.title).join(', ') : '';
            const trackAlbum = yandexTrack.album ? yandexTrack.album.title : '';
            const trackCover = yandexTrack.cover ? 'https://' + yandexTrack.cover.replace('%%', '400x400') : '';
            const trackUrl = yandexTrack.link ? 'https://music.yandex.ru' + yandexTrack.link : globalThis.location.href;
            return { trackTitle, trackArtist, trackAlbum, trackCover, trackUrl };
        }
    } catch(e) {
        console.debug("VEINMusic: yandex API parse error", e);
    }
    return null;
}

function getVkMetaForWorld() {
    const vkMeta = getVkMetadata();
    if (vkMeta) {
        return {
            trackTitle: vkMeta.title,
            trackArtist: vkMeta.artist,
            trackAlbum: vkMeta.album,
            trackCover: vkMeta.cover,
            trackUrl: vkMeta.url
        };
    }
    return null;
}

function getTrackMetadataForSource(source) {
    let meta = getMediaSessionMeta(source);
    if (meta) return meta;
    
    if (source === 'yandex') {
        return getYandexMeta();
    }
    
    if (source === 'vk') {
        return getVkMetaForWorld();
    }
    
    return null;
}

setInterval(() => {
    try {
        const source = getPlatformSource(globalThis.location.hostname);
        if (!source) return;

        let meta = getTrackMetadataForSource(source);
        if (!meta?.trackTitle) return;

        let { trackTitle, trackArtist, trackAlbum, trackCover, trackUrl } = meta;

        if (trackTitle) {
            const sessionPlaying = navigator.mediaSession?.playbackState === 'playing';
            const { isPlaying, progressSec, durationSec } = getMediaProgress(sessionPlaying);
            globalThis.postMessage({
                type: 'VEIN_SCROBBLE',
                payload: {
                    title: trackTitle,
                    artist: trackArtist,
                    album: trackAlbum,
                    cover_url: trackCover,
                    track_url: trackUrl,
                    source: source,
                    progress_sec: progressSec,
                    is_playing: isPlaying,
                    duration: durationSec
                }
            }, globalThis.location.origin);
        }
    } catch (e) {
        console.error("[VEIN MAIN] ❌ Ошибка:", e);
    }
}, 800);