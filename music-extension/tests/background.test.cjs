const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
const pairing = fs.readFileSync(path.join(__dirname, '../pairing.js'), 'utf8');

function harness(items, fetch) {
    const state = {
        apiKey: 'test-key',
        offline_scrobbles: items.map((id) => ({ payload: { id }, queuedAt: 1 }))
    };
    let onMessage;
    const chrome = {
        alarms: null,
        runtime: { onMessage: { addListener(listener) { onMessage = listener; } } },
        storage: { local: {
            get(keys, cb) {
                cb(Object.fromEntries(keys.map((key) => [key, structuredClone(state[key])])));
            },
            set(values, cb) {
                Object.assign(state, structuredClone(values));
                cb?.();
            }
        } }
    };
    const context = vm.createContext({
        chrome, fetch, console: { log() {}, warn() {} }, navigator: { userAgent: 'Chrome' },
        Date, URL, setTimeout, clearTimeout
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
    await vm.runInContext('addToOfflineQueue({ id: "D" })', context);
    firstResponse();
    await flushing;
    assert.deepEqual(state.offline_scrobbles.map((x) => x.payload.id), ['B', 'C', 'D']);
});

test('live 429 response stores the scrobble for retry', async () => {
    const { context, state, onMessage } = harness([], async () => ({ ok: false, status: 429 }));
    onMessage({ type: 'SCROBBLE', data: { id: 'live', title: 'Song', artist: 'Artist', source: 'yandex' } }, {});
    await new Promise((resolve) => setImmediate(resolve));
    await vm.runInContext('queueMutation', context);
    assert.deepEqual(state.offline_scrobbles.map((x) => x.payload.id), ['live']);
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
    assert.deepEqual(sent, ['Bearer new-key']);
});

test('failed offline storage is handled without losing the existing queue', async () => {
    const { context, state } = harness(['A'], async () => ({ ok: true }));
    context.chrome.storage.local.set = (_values, callback) => {
        context.chrome.runtime.lastError = { message: 'Storage quota exceeded' };
        callback();
        delete context.chrome.runtime.lastError;
    };
    vm.runInContext('bufferScrobble({ id: "B" })', context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(state.offline_scrobbles.map((item) => item.payload.id), ['A']);
});
