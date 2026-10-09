const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../page_world.js'), 'utf8');

function element({ text = '', title = '', href = '', src = '', attributes = {}, classes = [], children = {} } = {}) {
    return {
        textContent: text,
        href,
        src,
        style: {},
        classList: { contains: (name) => classes.includes(name) },
        getAttribute(name) {
            if (name === 'title') return title || null;
            return attributes[name] ?? null;
        },
        querySelector(selector) {
            return children[selector] || null;
        }
    };
}

function runPageWorld({ nodes, hostname, href, media = [] }) {
    let intervalHandler;
    const messages = [];
    class HTMLMediaElement {}
    HTMLMediaElement.prototype.play = function play() {};
    const context = vm.createContext({
        console: { log() {}, debug() {}, error() {} },
        document: {
            querySelector: (selector) => nodes[selector] || null,
            querySelectorAll: (selector) => selector === 'audio, video' ? media : []
        },
        getComputedStyle: (node) => node.style,
        HTMLMediaElement,
        location: { hostname, href },
        navigator: { mediaSession: null },
        postMessage: (message) => messages.push(message),
        setInterval: (handler) => { intervalHandler = handler; }
    });
    context.top = context;
    vm.runInContext(source, context);
    return { context, messages, runInterval: () => intervalHandler() };
}

function harness({ playing = true, progress = 42 } = {}) {
    const cover = element();
    cover.style.backgroundImage = 'url("https://i1.sndcdn.com/artworks-test-t50x50.jpg")';
    const title = element({ text: 'Current track: Test SongTest Song', title: 'Test Song', href: 'https://soundcloud.com/test-artist/test-song' });
    const artist = element({ text: 'Test Artist', title: 'Test Artist', href: 'https://soundcloud.com/test-artist' });
    const badge = element({
        classes: playing ? [] : ['paused'],
        children: {
            '.playbackSoundBadge__titleLink': title,
            '.playbackSoundBadge__lightLink': artist,
            '.playbackSoundBadge__avatar [style*="background-image"]': cover
        }
    });
    const timeline = element({ attributes: { 'aria-valuenow': String(progress), 'aria-valuemax': '192' } });
    const playButton = element({ attributes: { 'aria-label': playing ? 'Pause current' : 'Play current' } });
    const nodes = {
        '.playbackSoundBadge': badge,
        '.playbackSoundBadge__titleLink': title,
        '.playbackSoundBadge__lightLink': artist,
        '.playbackTimeline__progressWrapper': timeline,
        '.playControls__play': playButton
    };
    return runPageWorld({
        nodes,
        hostname: 'soundcloud.com',
        href: 'https://soundcloud.com/discover'
    });
}

test('reads the current SoundCloud track from the mini-player', () => {
    const { context } = harness();
    const meta = vm.runInContext('getSoundCloudMeta()', context);
    assert.equal(meta.trackTitle, 'Test Song');
    assert.equal(meta.trackArtist, 'Test Artist');
    assert.equal(meta.trackUrl, 'https://soundcloud.com/test-artist/test-song');
    assert.equal(meta.trackCover, 'https://i1.sndcdn.com/artworks-test-t500x500.jpg');
});

test('reads SoundCloud play state and timeline without an audio element', () => {
    const { context } = harness({ playing: true, progress: 42 });
    const progress = vm.runInContext("getMediaProgress(false, 'soundcloud')", context);
    assert.equal(progress.isPlaying, true);
    assert.equal(progress.progressSec, 42);
    assert.equal(progress.durationSec, 192);
});

test('emits a complete SoundCloud scrobble payload', () => {
    const { messages, runInterval } = harness({ playing: true, progress: 42 });
    runInterval();
    assert.equal(messages.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(messages[0].payload)), {
        title: 'Test Song',
        artist: 'Test Artist',
        album: '',
        cover_url: 'https://i1.sndcdn.com/artworks-test-t500x500.jpg',
        track_url: 'https://soundcloud.com/test-artist/test-song',
        source: 'soundcloud',
        progress_sec: 42,
        is_playing: true,
        duration: 192
    });
});

test('does not scrobble a selected SoundCloud track before playback starts', () => {
    const { messages, runInterval } = harness({ playing: false, progress: 0 });
    runInterval();
    assert.equal(messages.length, 0);
});

function youtubeHarness({ ad = false } = {}) {
    const title = element({ text: 'YouTube Song' });
    const artistLink = element({ text: 'YouTube Artist' });
    const byline = element({
        text: 'YouTube Artist • Test Album',
        children: { a: artistLink }
    });
    const cover = element({ src: 'https://lh3.googleusercontent.com/test=s120' });
    const trackLink = element({ href: 'https://music.youtube.com/watch?v=abc123' });
    const playerBar = element({
        children: {
            '.title.ytmusic-player-bar, yt-formatted-string.title, .title': title,
            '.byline.ytmusic-player-bar, .subtitle.ytmusic-player-bar, .byline': byline,
            'img.image, .thumbnail img, img': cover,
            '[class*="ad-badge"], [aria-label*="Advertisement"], [aria-label*="Реклама"]': ad ? element() : null
        }
    });
    const video = { paused: false, currentTime: 37, duration: 201 };
    const nodes = {
        'ytmusic-player-bar': playerBar,
        'ytmusic-player-bar a[href*="watch?v="]': trackLink,
        '.html5-video-player.ad-showing, .ytp-ad-player-overlay': null
    };
    return runPageWorld({
        nodes,
        hostname: 'music.youtube.com',
        href: 'https://music.youtube.com/watch?v=abc123',
        media: [video]
    });
}

test('reads and emits the current YouTube Music track', () => {
    const { context, messages, runInterval } = youtubeHarness();
    const meta = vm.runInContext('getYouTubeMusicMeta()', context);
    assert.equal(meta.trackTitle, 'YouTube Song');
    assert.equal(meta.trackArtist, 'YouTube Artist');
    assert.equal(meta.trackCover, 'https://lh3.googleusercontent.com/test=w500-h500');
    assert.equal(meta.trackUrl, 'https://music.youtube.com/watch?v=abc123');

    runInterval();
    assert.equal(messages.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(messages[0].payload)), {
        title: 'YouTube Song',
        artist: 'YouTube Artist',
        album: '',
        cover_url: 'https://lh3.googleusercontent.com/test=w500-h500',
        track_url: 'https://music.youtube.com/watch?v=abc123',
        source: 'youtube_music',
        progress_sec: 37,
        is_playing: true,
        duration: 201
    });
});

test('does not scrobble YouTube Music advertisements', () => {
    const { messages, runInterval } = youtubeHarness({ ad: true });
    runInterval();
    assert.equal(messages.length, 0);
});
