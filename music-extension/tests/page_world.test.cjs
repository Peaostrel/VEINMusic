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
    const events = new Map();
    let mutate;
    const microtasks = [];
    class HTMLMediaElement {}
    HTMLMediaElement.prototype.play = function play() {};
    const context = vm.createContext({
        console: { log() {}, debug() {}, error() {} },
        document: {
            addEventListener: (name, handler) => events.set(name, handler),
            querySelector: (selector) => nodes[selector] || null,
            querySelectorAll: (selector) => selector === 'audio, video' ? media : []
        },
        getComputedStyle: (node) => node.style,
        MutationObserver: class { constructor(callback) { mutate = callback; } observe() {} },
        queueMicrotask: (handler) => microtasks.push(handler),
        HTMLMediaElement,
        location: { hostname, href },
        navigator: { mediaSession: null },
        postMessage: (message) => messages.push(message),
        setInterval: (handler) => { intervalHandler = handler; }
    });
    context.top = context;
    vm.runInContext(source, context);
    return { context, messages, runInterval: () => intervalHandler(),
        emit: (name, target) => events.get(name)({target}),
        mutate: () => { mutate(); while (microtasks.length) microtasks.shift()(); } };
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
        player_position: true,
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
        player_position: true,
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

for (const [hostname, sourceName] of [['music.yandex.ru', 'yandex'], ['music.yandex.com', 'yandex'],
    ['open.spotify.com', 'spotify'], ['music.apple.com', 'apple_music'], ['vk.ru', 'vk']]) {
    test(`reads MediaSession playback on ${hostname}`, () => {
        const {context, messages, runInterval} = runPageWorld({nodes: {}, hostname, href: `https://${hostname}/`, media: [{paused: false, currentTime: 24, duration: 180}]});
        context.navigator.mediaSession = {metadata: {title: 'Fixture Song', artist: 'Fixture Artist', album: 'Album', artwork: []}, playbackState: 'playing'};
        runInterval();
        assert.equal(messages.length, 1);
        assert.equal(messages[0].payload.source, sourceName);
        assert.equal(messages[0].payload.title, 'Fixture Song');
        assert.equal(messages[0].payload.progress_sec, 24);
    });
}

test('does not report an unplayed MediaSession selection', () => {
    const {context, messages, runInterval} = runPageWorld({nodes: {}, hostname: 'open.spotify.com', href: 'https://open.spotify.com/'});
    context.navigator.mediaSession = {metadata: {title: 'Selected Song', artist: 'Artist'}, playbackState: 'paused'};
    runInterval();
    assert.equal(messages.length, 0);
});

test('a paused old tab reports its pause once and cannot keep replacing another player', () => {
    const media = {paused: false, currentTime: 24, duration: 180};
    const {context, messages, runInterval} = runPageWorld({nodes: {}, hostname: 'open.spotify.com', href: 'https://open.spotify.com/', media: [media]});
    context.navigator.mediaSession = {metadata: {title: 'Song', artist: 'Artist'}, playbackState: 'playing'};
    runInterval();
    media.paused = true;
    context.navigator.mediaSession.playbackState = 'paused';
    runInterval();
    runInterval();
    runInterval();
    assert.deepEqual(messages.map(message => message.payload.is_playing), [true, false]);
    media.paused = false;
    context.navigator.mediaSession.playbackState = 'playing';
    runInterval();
    assert.equal(messages.at(-1).payload.is_playing, true);
});

test('loading an already paused page with an old position does not claim playback', () => {
    const {context, messages, runInterval} = runPageWorld({nodes: {}, hostname: 'open.spotify.com', href: 'https://open.spotify.com/', media: [{paused: true, currentTime: 80, duration: 180}]});
    context.navigator.mediaSession = {metadata: {title: 'Old song', artist: 'Artist'}, playbackState: 'paused'};
    runInterval();
    assert.equal(messages.length, 0);
});

test('an uninitialized audio element cannot hide MediaSession playback', () => {
    const {context, messages, runInterval} = runPageWorld({nodes: {}, hostname: 'open.spotify.com', href: 'https://open.spotify.com/', media: [{paused: true, currentTime: 0, duration: NaN}]});
    context.navigator.mediaSession = {metadata: {title: 'Playing song', artist: 'Artist'}, playbackState: 'playing'};
    runInterval();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].payload.is_playing, true);
});

test('a streaming player with infinite duration emits valid unknown length', () => {
    const {context, messages, runInterval} = runPageWorld({nodes: {}, hostname: 'music.apple.com', href: 'https://music.apple.com/', media: [{paused: false, currentTime: 20, duration: Infinity}]});
    context.navigator.mediaSession = {metadata: {title: 'Stream song', artist: 'Artist'}, playbackState: 'playing'};
    runInterval();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].payload.duration, 0);
    assert.equal(messages[0].payload.progress_sec, 20);
});


test('media pause, resume and seek are reported without advancing the polling timer', () => {
    const media = {paused: false, currentTime: 24, duration: 180};
    const page = runPageWorld({nodes: {}, hostname: 'open.spotify.com', href: 'https://open.spotify.com/', media: [media]});
    page.context.navigator.mediaSession = {metadata: {title: 'Song', artist: 'Artist'}, playbackState: 'playing'};
    page.emit('playing', media);
    media.paused = true;
    page.emit('pause', media);
    assert.equal(page.messages.at(-1).payload.is_playing, false);
    assert.equal(page.messages.at(-1).payload.progress_sec, 24);
    media.paused = false;
    page.emit('playing', media);
    assert.equal(page.messages.at(-1).payload.is_playing, true);
    media.currentTime = 95;
    page.emit('seeked', media);
    assert.equal(page.messages.at(-1).payload.progress_sec, 95);
    page.context.navigator.mediaSession.metadata = {title: 'Next', artist: 'Artist'};
    media.currentTime = 0;
    page.mutate();
    assert.equal(page.messages.at(-1).payload.title, 'Next');
    assert.equal(page.messages.at(-1).payload.progress_sec, 0);
});

test('a newly active media element at zero wins over the old long position', () => {
    const old = {paused: true, currentTime: 160, duration: 180};
    const fresh = {paused: false, currentTime: 0, duration: 180};
    const page = runPageWorld({nodes: {}, hostname: 'open.spotify.com', href: 'https://open.spotify.com/', media: [old, fresh]});
    page.context.navigator.mediaSession = {metadata: {title: 'Next', artist: 'Artist'}, playbackState: 'playing'};
    page.emit('playing', fresh);
    assert.equal(page.messages.at(-1).payload.progress_sec, 0);
    fresh.paused = true;
    page.emit('pause', fresh);
    assert.equal(page.messages.at(-1).payload.is_playing, false);
    assert.equal(page.messages.at(-1).payload.progress_sec, 0);
});
