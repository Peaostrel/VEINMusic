const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
const pairing = fs.readFileSync(path.join(__dirname, '../pairing.js'), 'utf8');

function harness(items, fetch) {
    const state = {
        apiKey: 'test-key', trackingEnabled: true,
        offline_scrobbles: items.map((id) => ({ id, accountKey: 'test-key', payload: { id }, queuedAt: Date.now() }))
    };
    let onMessage;
    const chrome = {
        alarms: null,
        runtime: { id: 'test-extension', getURL: (path) => `chrome-extension://test-extension/${path}`,
            onMessage: { addListener(listener) { onMessage = listener; } } },
        storage: { local: {
            get(keys, cb) {
                cb(Object.fromEntries(keys.map((key) => [key, structuredClone(state[key])])));
            },
            set(values, cb) {
                Object.assign(state, structuredClone(values));
                cb?.();
            },
            remove(keys, cb) {
                keys.forEach((key) => { delete state[key]; });
                cb?.();
            }
        } }
    };
    const context = vm.createContext({
        chrome, fetch: async (...args) => {
            const response = await fetch(...args);
            if (response.ok && !response.json) return {...response, json: async () => ({status: 'ok'})};
            return response;
        }, console: { log() {}, warn() {} }, navigator: { userAgent: 'Chrome' },
        Date, URL, setTimeout, clearTimeout, AbortSignal, crypto: require('node:crypto').webcrypto
    });
    vm.runInContext(pairing, context);
    vm.runInContext(source, context);
    return { context, state, onMessage };
}

test('fresh extension uses the API host', () => {
    const { context } = harness([], async () => ({ ok: true }));
    assert.equal(vm.runInContext('veinApiBase({})', context), 'https://api.music.vein.guru');
});

for (const status of [429, 500, 404]) {
    test(`offline queue keeps the failed item and following items on ${status}`, async () => {
        const { context, state } = harness(['A', 'B', 'C'], async () => ({ ok: false, status }));
        await vm.runInContext('flushOfflineQueue()', context);
        assert.deepEqual(state.offline_scrobbles.map((x) => x.payload.id), ['A', 'B', 'C']);
    });
}

test('offline queue removes only successful prefix and keeps new arrivals', async () => {
    let firstResponse;
    const { context, state } = harness(['A', 'B', 'C'], async (_url, options) => {
        const id = JSON.parse(options.body).id;
        if (id === 'A') {
            await new Promise((resolve) => { firstResponse = resolve; });
            return { ok: true };
        }
        return { ok: false, status: 429 };
    });
    const flushing = vm.runInContext('flushOfflineQueue()', context);
    while (!firstResponse) await new Promise((resolve) => setImmediate(resolve));
    await vm.runInContext('addToOfflineQueue({ id: "D" }, "test-key")', context);
    firstResponse();
    await flushing;
    assert.deepEqual(state.offline_scrobbles.map((x) => x.payload.id), ['B', 'C', 'D']);
});

test('live 429 response stores the scrobble for retry', async () => {
    const { context, state, onMessage } = harness([], async () => ({ ok: false, status: 429 }));
    onMessage({ type: 'SCROBBLE', data: { title: 'Song', artist: 'Artist', source: 'yandex', progress_sec: 12, duration: 180 } }, {url: 'https://music.yandex.ru/'});
    await new Promise((resolve) => setImmediate(resolve));
    await vm.runInContext('queueMutation', context);
    assert.deepEqual(state.offline_scrobbles.map((x) => x.payload.title), ['Song']);
});

test('key synchronization waits for storage before flushing with the new key', async () => {
    const sent = [];
    const { context, onMessage } = harness(['A'], async (_url, options) => {
        sent.push(options.headers.Authorization);
        return { ok: true };
    });
    const originalSet = context.chrome.storage.local.set;
    let save;
    context.chrome.storage.local.set = (values, callback) => {
        save = () => originalSet(values, callback);
    };
    onMessage({ type: 'SYNC_KEYS', data: { username: 'alice', apiKey: 'new-key' } },
        { tab: { url: 'https://music.vein.guru/' } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(sent, []);
    save();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(sent, []); // An old account queue is never sent with a replacement key.
});

test('failed offline storage is handled without losing the existing queue', async () => {
    const { context, state } = harness(['A'], async () => ({ ok: true }));
    context.chrome.storage.local.set = (_values, callback) => {
        context.chrome.runtime.lastError = { message: 'Storage quota exceeded' };
        callback();
        delete context.chrome.runtime.lastError;
    };
    vm.runInContext('bufferScrobble({ id: "B" }, "test-key")', context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(state.offline_scrobbles.map((item) => item.payload.id), ['A']);
});


test('pairing network failure keeps authorization available for retry', async () => {
    const { context, state } = harness([], async () => {
        throw new Error('Network unavailable');
    });
    state.pairing = { device_code: 'pending-code', expires_at: Date.now() + 60_000 };
    const status = await vm.runInContext('veinPollPairing()', context);
    assert.equal(status, 'error');
    assert.equal(state.pairing.device_code, 'pending-code');
    assert.equal(state.apiKey, 'test-key');
});

const payload = {title: 'Song', artist: 'Artist', source: 'yandex', progress_sec: 12, duration: 180, is_playing: true};
const musicSender = {url: 'https://music.yandex.ru/'};
const tick = () => new Promise((resolve) => setImmediate(resolve));

for (const setting of ['disconnected', 'paused']) {
    test(`does not collect or send while ${setting}`, async () => {
        let requests = 0;
        const {context, state, onMessage} = harness([], async () => { requests++; return {ok: true}; });
        if (setting === 'paused') state.trackingEnabled = false;
        else delete state.apiKey;
        onMessage({type: 'SCROBBLE', data: payload}, musicSender);
        await tick();
        await vm.runInContext('queueMutation', context);
        assert.equal(requests, 0);
        assert.deepEqual(state.offline_scrobbles, []);
    });
}

for (const sender of [{url: 'https://evil.example/'}, {url: 'not-a-url'},
    {url: 'https://evil.example/', tab: {url: 'https://music.yandex.ru/'}}]) {
    test(`rejects messages from ${sender.url}`, async () => {
        let requests = 0;
        const {onMessage} = harness([], async () => { requests++; return {ok: true}; });
        onMessage({type: 'SCROBBLE', data: payload}, sender);
        await tick();
        assert.equal(requests, 0);
    });
}

test('rejects a source that does not match the music tab', async () => {
    let requests = 0;
    const {onMessage} = harness([], async () => { requests++; return {ok: true}; });
    onMessage({type: 'SCROBBLE', data: {...payload, source: 'spotify'}}, musicSender);
    await tick();
    assert.equal(requests, 0);
});

test('strips query strings and fragments from transmitted music URLs', async () => {
    let sent;
    const {onMessage} = harness([], async (_url, opts) => { sent = JSON.parse(opts.body); return {ok: true}; });
    onMessage({type: 'SCROBBLE', data: {...payload, track_url: 'https://music.yandex.ru/album/1/track/2?token=secret#private'}}, musicSender);
    await tick();
    assert.equal(sent.track_url, 'https://music.yandex.ru/album/1/track/2');
});

test('an in-flight failed request cannot refill the queue after logout', async () => {
    let resolve;
    const {context, state, onMessage} = harness([], () => new Promise((done) => { resolve = done; }));
    onMessage({type: 'SCROBBLE', data: payload}, musicSender);
    await tick();
    onMessage({type: 'LOGOUT'}, {url: 'https://music.vein.guru/'});
    resolve({ok: false, status: 500});
    await tick();
    await vm.runInContext('queueMutation', context);
    assert.equal(state.apiKey, undefined);
    assert.equal(state.trackingEnabled, undefined);
    assert.deepEqual(state.offline_scrobbles, []);
});

test('old account and expired queue entries are discarded without sending', async () => {
    let requests = 0;
    const {context, state} = harness(['A', 'B'], async () => { requests++; return {ok: true}; });
    state.offline_scrobbles[0].accountKey = 'previous-account';
    state.offline_scrobbles[1].queuedAt = Date.now() - 8 * 24 * 3600 * 1000;
    await vm.runInContext('flushOfflineQueue()', context);
    assert.equal(requests, 0);
    assert.deepEqual(state.offline_scrobbles, []);
});

test('concurrent pairing polls share the one-use authorization response', async () => {
    let requests = 0;
    let complete;
    const {context, state} = harness([], () => { requests++; return new Promise((resolve) => { complete = resolve; }); });
    state.pairing = {device_code: 'pairing-code', expires_at: Date.now() + 60_000};
    const a = vm.runInContext('veinPollPairing()', context);
    const b = vm.runInContext('veinPollPairing()', context);
    await tick();
    assert.equal(requests, 1);
    complete({ok: true, json: async () => ({status: 'approved', api_key: 'paired-key', username: 'alice'})});
    assert.deepEqual(await Promise.all([a, b]), ['approved', 'approved']);
    assert.equal(state.apiKey, 'paired-key');
    assert.equal(state.pairing, undefined);
});

test('an approved pairing response cannot reconnect after cancellation', async () => {
    let complete;
    const {context, state} = harness([], () => new Promise((resolve) => { complete = resolve; }));
    state.pairing = {device_code: 'pairing-code', expires_at: Date.now() + 60_000};
    const poll = vm.runInContext('veinPollPairing()', context);
    await tick();
    delete state.pairing;
    delete state.apiKey;
    complete({ok: true, json: async () => ({status: 'approved', api_key: 'unexpected-key', username: 'alice'})});
    assert.equal(await poll, 'none');
    assert.equal(state.apiKey, undefined);
});

for (const status of ['rate_limited', 'ignored_spam_protection', 'flagged']) {
    test(`HTTP 200 with ${status} is not acknowledged as a saved scrobble`, async () => {
        const {context, state, onMessage} = harness([], async () => ({ok: true, status: 200, json: async () => ({status})}));
        onMessage({type: 'SCROBBLE', data: payload}, musicSender);
        await tick();
        await vm.runInContext('queueMutation', context);
        assert.equal(state.offline_scrobbles.length, 1);
        assert.equal(state.last_delivery.status, status);
        assert.doesNotMatch(state.last_delivery.message, /Событие принято/);
        await vm.runInContext('flushOfflineQueue()', context);
        assert.equal(state.offline_scrobbles.length, 1);
    });
}

for (const status of ['private_session', 'integration_paused', 'artist_ignored']) {
    test(`explains deliberate ${status} filtering without endlessly replaying it`, async () => {
        const {state, onMessage} = harness([], async () => ({ok: true, status: 200, json: async () => ({status})}));
        onMessage({type: 'SCROBBLE', data: payload}, musicSender);
        await tick();
        assert.deepEqual(state.offline_scrobbles, []);
        assert.equal(state.last_delivery.status, status);
    });
}

test('an expired key is visible instead of being reported as connected playback', async () => {
    const {state, onMessage} = harness([], async () => ({ok: false, status: 401}));
    onMessage({type: 'SCROBBLE', data: payload}, musicSender);
    await tick();
    assert.equal(state.last_delivery.status, 'auth_required');
    assert.match(state.last_delivery.message, /заново/);
    assert.deepEqual(state.offline_scrobbles, []);
});

test('only the latest failed state for a service is retained', async () => {
    const {context, state} = harness([], async () => ({ok: true}));
    await vm.runInContext('addToOfflineQueue({source: "yandex", title: "Old"}, "test-key")', context);
    await vm.runInContext('addToOfflineQueue({source: "spotify", title: "Other"}, "test-key")', context);
    await vm.runInContext('addToOfflineQueue({source: "yandex", title: "New"}, "test-key")', context);
    assert.deepEqual(state.offline_scrobbles.map(x => x.payload.title), ['Other', 'New']);
});

for (const source of ['yandex', 'spotify']) {
    test(`a successful current state removes older ${source} retries`, async () => {
    const sent = [];
    const {context, state, onMessage} = harness([], async (_, options) => {
        sent.push(JSON.parse(options.body).title);
        return {ok: true};
    });
    await vm.runInContext(`addToOfflineQueue({source: ${JSON.stringify(source)}, title: "Old"}, "test-key")`, context);
    onMessage({type: 'SCROBBLE', data: {...payload, title: 'Current'}}, musicSender);
    await tick();
    await vm.runInContext('queueMutation', context);
    await vm.runInContext('flushOfflineQueue()', context);
    assert.deepEqual(sent, ['Current']);
    assert.deepEqual(state.offline_scrobbles, []);
});

}

test('a queued request and live switch are serialized in playback order', async () => {
    const sent = [];
    let complete;
    const {context, state, onMessage} = harness([], async (_, options) => {
        const title = JSON.parse(options.body).title;
        sent.push(title);
        if (title === 'Old') await new Promise(resolve => complete = resolve);
        return {ok: true};
    });
    await vm.runInContext('addToOfflineQueue({source: "yandex", title: "Old"}, "test-key")', context);
    const flushing = vm.runInContext('flushOfflineQueue()', context);
    await tick();
    onMessage({type: 'SCROBBLE', data: {...payload, title: 'Current'}}, musicSender);
    await tick();
    assert.deepEqual(sent, ['Old']);
    complete();
    await flushing;
    await tick();
    assert.deepEqual(sent, ['Old', 'Current']);
    assert.deepEqual(state.offline_scrobbles, []);
});

test('a malformed HTTP 200 response is kept for retry', async () => {
    const {state, onMessage} = harness([], async () => ({ok: true, json: async () => {throw new Error('Invalid JSON');}}));
    onMessage({type: 'SCROBBLE', data: payload}, musicSender);
    await tick();
    assert.equal(state.last_delivery.status, 'invalid_response');
    assert.equal(state.offline_scrobbles.length, 1);
});

test('old live snapshots are never reintroduced as current playback', async () => {
    let requests = 0;
    const {context, state} = harness(['old'], async () => {requests++;return {ok: true};});
    state.offline_scrobbles[0].queuedAt = Date.now() - 40000;
    await vm.runInContext('flushOfflineQueue()', context);
    assert.equal(requests, 0);
    assert.deepEqual(state.offline_scrobbles, []);
});

test('an invalid queued payload does not block following valid playback', async () => {
    let requests = 0;
    const {context, state} = harness(['bad', 'valid'], async () => (++requests === 1 ? {ok: false, status: 422} : {ok: true}));
    await vm.runInContext('flushOfflineQueue()', context);
    assert.equal(requests, 2);
    assert.deepEqual(state.offline_scrobbles, []);
});

test('filtering one service does not discard pending playback from another', async () => {
    const {context, state, onMessage} = harness([], async (_, options) => ({
        ok: true, json: async () => ({status: JSON.parse(options.body).source === 'yandex' ? 'source_ignored' : 'ok'})
    }));
    await vm.runInContext('addToOfflineQueue({source: "spotify", title: "Allowed"}, "test-key")', context);
    onMessage({type: 'SCROBBLE', data: payload}, musicSender);
    await tick();
    await vm.runInContext('queueMutation', context);
    assert.deepEqual(state.offline_scrobbles.map(item => item.payload.title), ['Allowed']);
    await vm.runInContext('flushOfflineQueue()', context);
    assert.deepEqual(state.offline_scrobbles, []);
});


test('a seek bypasses the heartbeat throttle without sending ordinary progress ticks', async () => {
    const sent = [];
    const {context} = harness([], async (_url, options) => { sent.push(JSON.parse(options.body)); return {ok: true}; });
    context.livePayload = {...payload};
    await vm.runInContext('sendScrobble(livePayload)', context);
    context.livePayload.progress_sec += 1;
    await vm.runInContext('sendScrobble(livePayload)', context);
    assert.equal(sent.length, 1);
    context.livePayload.progress_sec = 90;
    await vm.runInContext('sendScrobble(livePayload)', context);
    assert.equal(sent.length, 2);
    assert.equal(sent.at(-1).progress_sec, 90);
    context.livePayload.is_playing = false;
    await vm.runInContext('sendScrobble(livePayload)', context);
    assert.equal(sent.at(-1).is_playing, false);
    context.livePayload.is_playing = true;
    await vm.runInContext('sendScrobble(livePayload)', context);
    assert.equal(sent.at(-1).is_playing, true);
});
