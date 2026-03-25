if (window !== window.top) {
    throw new Error("VEIN: Остановка клона во фрейме.");
}

if (window.__VEIN_LOADED) {
    throw new Error("VEIN: Обнаружен старый скрипт.");
}
window.__VEIN_LOADED = true;

console.log("[VEIN MAIN] 🌍 Мультиплатформенный трекер запущен. Взламываем аудио-движок...");

if (!window.__VEIN_AUDIO_HOOK) {
    window.__VEIN_AUDIO_HOOK = true;
    window.__vein_audio_elements = new Set(); 
    
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
        window.__vein_audio_elements.add(this); 
        return originalPlay.apply(this, arguments);
    };
}

setInterval(() => {
    try {
        let trackTitle = '', trackArtist = '', trackCover = '', trackUrl = '', trackAlbum = '';
        let progressSec = 0, durationSec = 0, isPlaying = false;
        let found = false;

        const hostname = window.location.hostname;
        let source = '';

        if (hostname.includes('music.yandex')) source = 'yandex';
        else if (hostname.includes('spotify.com')) source = 'spotify';
        else if (hostname.includes('music.youtube.com')) source = 'youtube_music';
        else if (hostname.includes('soundcloud.com')) {
            const adBadge = document.querySelector('.sc-snippet-ad, .adOverlay, [aria-label="Advertisement"]');
            const titleEl = document.querySelector('.playbackSoundBadge__titleLink');
            if (adBadge || (titleEl && titleEl.href && titleEl.href.includes('/ads/'))) return; 
            source = 'soundcloud';
        }
        else if (hostname.includes('music.apple.com')) source = 'apple_music';
        else if (hostname.includes('vk.com')) {
            const isVideoPlaying = Array.from(document.querySelectorAll('video')).some(v => !v.paused && v.offsetHeight > 150 && v.offsetWidth > 150);
            if (!isVideoPlaying) source = 'vk';
        }
        
        if (!source) return;

        const metadata = navigator.mediaSession && navigator.mediaSession.metadata;
        const sessionPlaying = navigator.mediaSession && navigator.mediaSession.playbackState === 'playing';

        if (metadata && metadata.title) {
            trackTitle = metadata.title;
            trackArtist = metadata.artist || '';
            trackAlbum = metadata.album || '';
            
            if (source === 'soundcloud' && (!trackArtist || trackArtist.toLowerCase().includes('advertisement') || trackArtist.toLowerCase().includes('soundcloud'))) return;

            if (metadata.artwork && metadata.artwork.length > 0) {
                let coverRaw = metadata.artwork[metadata.artwork.length - 1].src;
                
                if (source === 'yandex' || source === 'vk') {
                    trackCover = coverRaw.replace(/\d+x\d+/, '400x400');
                } else if (source === 'youtube_music') {
                    trackCover = coverRaw.replace(/([=\-]?w\d+-h\d+.*)/, '=w500-h500');
                    if (trackCover === coverRaw && coverRaw.includes('=')) {
                        trackCover = coverRaw.split('=')[0] + '=w500-h500';
                    }
                } else {
                    trackCover = coverRaw;
                }
            }

            if (source === 'yandex') {
                const trackLinks = Array.from(document.querySelectorAll('a[href*="/track/"]'));
                const correctLink = trackLinks.reverse().find(a => a.textContent.includes(trackTitle) || trackTitle.includes(a.textContent)) || trackLinks[0];
                trackUrl = correctLink ? correctLink.href : window.location.href;
            } else if (source === 'spotify') {
                const trackLink = document.querySelector('a[data-testid="context-item-link"]');
                trackUrl = trackLink ? trackLink.href : window.location.href;
            } else {
                trackUrl = window.location.href;
            }
            
            found = true;
        } 
        else if (source === 'vk') {
            const vkTitleEl = document.querySelector('.top_audio_player_title') || document.querySelector('.audio_page_player_title_performer');
            
            if (vkTitleEl && vkTitleEl.textContent) {
                trackTitle = vkTitleEl.textContent.trim();
                
                const vkArtistEl = document.querySelector('.top_audio_player_artist');
                if (vkArtistEl) trackArtist = vkArtistEl.textContent.trim();

                const vkCoverEl = document.querySelector('.top_audio_player_cover');
                if (vkCoverEl) {
                    const bg = window.getComputedStyle(vkCoverEl).backgroundImage;
                    if (bg && bg !== 'none') {
                        trackCover = bg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '').replace(/\d+x\d+/, '400x400');
                    }
                }
                trackUrl = window.location.href;
                found = true;
            }
        }

        const allMedia = Array.from(window.__vein_audio_elements).concat(Array.from(document.querySelectorAll('audio, video')));
        const activeMedia = allMedia.filter(m => !m.paused && m.duration > 0).sort((a, b) => b.currentTime - a.currentTime)[0];
        
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

        if (found && trackTitle) {
            window.postMessage({
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
            }, '*');
        }
    } catch (e) {
        console.error("[VEIN MAIN] ❌ Ошибка:", e);
    }
}, 800);