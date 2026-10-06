const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../page_world.js'), 'utf8');

function element({ text = '', title = '', href = '', attributes = {}, classes = [], children = {} } = {}) {
    return {
        textContent: text,
        href,
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
    let intervalHandler;
    const messages = [];
    class HTMLMediaElement {}
    HTMLMediaElement.prototype.play = function play() {};
    const context = vm.createContext({
        console: { log() {}, debug() {}, error() {} },
        document: {
            querySelector: (selector) => nodes[selector] || null,
            querySelectorAll: () => []
        },
        getComputedStyle: (node) => node.style,
        HTMLMediaElement,
        location: { hostname: 'soundcloud.com', href: 'https://soundcloud.com/discover' },
        navigator: { mediaSession: null },
        postMessage: (message) => messages.push(message),
        setInterval: (handler) => { intervalHandler = handler; }
    });
    context.top = context;
    vm.runInContext(source, context);
    return { context, messages, runInterval: () => intervalHandler() };
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
