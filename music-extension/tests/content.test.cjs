const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');

// Firefox runs content scripts in a sandbox whose global is not the page
// window; Chromium's isolated world uses the window itself as the global.
function runContent({ firefox }) {
    const listeners = [];
    const unloads = [];
    const sent = [];
    const context = vm.createContext({
        console: { debug() {} },
        location: { origin: 'https://soundcloud.com', hostname: 'soundcloud.com' },
        setInterval() {},
        addEventListener: (name, handler) => {
            if (name === 'message') listeners.push(handler);
            if (name === 'pagehide') unloads.push(handler);
        },
        chrome: {
            storage: {
                local: { get: (_keys, callback) => callback({ trackingEnabled: true, apiKey: 'key' }) },
                onChanged: { addListener() {} }
            },
            runtime: { sendMessage: (message) => { sent.push(message); return Promise.resolve(); } }
        }
    });
    const pageWindow = firefox ? {} : vm.runInContext('globalThis', context);
    context.window = pageWindow;
    vm.runInContext(source, context);
    const post = (data, sourceWindow = pageWindow) => listeners.forEach((listener) =>
        listener({ origin: 'https://soundcloud.com', source: sourceWindow, data }));
    const unload = () => unloads.forEach((handler) => handler({ persisted: false }));
    return { sent, post, unload };
}

for (const firefox of [false, true]) {
    test(`forwards page tracker messages (${firefox ? 'Firefox' : 'Chromium'})`, () => {
        const { sent, post } = runContent({ firefox });
        post({ type: 'VEIN_SCROBBLE', payload: { title: 'Song' } });
        assert.equal(JSON.stringify(sent), JSON.stringify([{ type: 'SCROBBLE', data: { title: 'Song' } }]));
    });
}

test('ignores messages from other windows', () => {
    const { sent, post } = runContent({ firefox: true });
    post({ type: 'VEIN_SCROBBLE', payload: { title: 'Song' } }, {});
    assert.equal(sent.length, 0);
});

test('tells the extension when the player page unloads', () => {
    const { sent, unload } = runContent({ firefox: false });
    unload();
    assert.equal(JSON.stringify(sent), JSON.stringify([{ type: 'PLAYER_CLOSED' }]));
});
