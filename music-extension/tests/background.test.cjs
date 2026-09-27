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
