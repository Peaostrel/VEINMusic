// Installed-extension smoke test, not a mock of the chrome API.
// Run in CI with: xvfb-run -a node music-extension/tests/browser-smoke.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');

(async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vein-extension-'));
    const extension = path.resolve('dist/extension-smoke/chromium');
    const calls = [];
    let scrobbleStatus = 'ok';
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            calls.push({url: req.url, method: req.method, authorization: req.headers.authorization, body: body ? JSON.parse(body) : null});
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({status: req.url === '/api/scrobble' ? scrobbleStatus : 'ok'}));
        });
    });
    await new Promise(resolve => server.listen(8000, '127.0.0.1', resolve));
    let context;
    try {
        context = await chromium.launchPersistentContext(profile, {
            channel: 'chromium', headless: process.env.VEIN_SMOKE_HEADLESS === '1',
            args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
        });
        let worker = context.serviceWorkers()[0];
        worker ||= await context.waitForEvent('serviceworker');
        const id = new URL(worker.url()).host;
        const popup = await context.newPage();
        await popup.goto(`chrome-extension://${id}/popup.html`);
        assert.equal(await popup.locator('#tracking-enabled').isChecked(), false);
        await popup.evaluate(() => chrome.storage.local.set({apiUrl: 'http://127.0.0.1:8000', apiKey: 'fixture-key', username: 'fixture'}));
        await popup.locator('#tracking-enabled').check();
        await popup.waitForFunction(() => document.querySelector('#auth-box').style.display === 'block');
        await popup.locator('#test-btn').click();
        await popup.waitForFunction(() => document.querySelector('#log-box').innerText === 'Связь с VEIN работает.');
        assert.equal(calls[0].method, 'GET');
        assert.equal(calls[0].url, '/api/profile/preferences');
        assert.equal(calls.filter(x => x.url === '/api/scrobble').length, 0);

        await context.route('https://music.youtube.com/**', route => route.fulfill({
            status: 200, contentType: 'text/html',
            headers: {'Content-Security-Policy': "default-src 'none'; script-src 'none'"},
            body: '<html><body><ytmusic-player-bar><span class="title">Fixture Song</span><span class="byline"><a>Fixture Artist</a></span></ytmusic-player-bar><video></video></body></html>'
        }));
        const music = await context.newPage();
        await music.goto('https://music.youtube.com/watch?v=fixture&private=secret');
        await music.evaluate(() => {
            const video = document.querySelector('video');
            Object.defineProperties(video, {paused: {get: () => globalThis.fixturePaused ?? false}, duration: {get: () => 180}, currentTime: {get: () => globalThis.fixturePosition ?? 32}});
        });
        await music.waitForFunction(() => globalThis.__VEIN_LOADED === true);
        await new Promise((resolve, reject) => {
            const timer = setInterval(() => {
                if (calls.some(x => x.url === '/api/scrobble')) {
                    clearInterval(timer); clearTimeout(timeout); resolve();
                }
            }, 100);
            const timeout = setTimeout(() => {
                clearInterval(timer); reject(new Error('Playback was not received within 15 seconds'));
            }, 15_000);
        });
        const play = calls.find(x => x.url === '/api/scrobble');
        assert.ok(play, 'Installed extension must send playback from MAIN despite strict CSP');
        assert.equal(play.authorization, 'Bearer fixture-key');
        assert.equal(play.body.title, 'Fixture Song');
        assert.equal(play.body.artist, 'Fixture Artist');
        assert.equal(play.body.progress_sec, 32);
        assert.equal(play.body.track_url, 'https://music.youtube.com/watch?v=fixture');
        await popup.waitForFunction(() => document.querySelector('#delivery-status').innerText.includes('Событие принято'));
        assert.equal(play.body.player_position, true);
        async function playbackEvent(name, paused, position) {
            const before = calls.filter(x => x.url === '/api/scrobble').length;
            const started = Date.now();
            await music.evaluate(({name, paused, position}) => {
                globalThis.fixturePaused = paused;
                globalThis.fixturePosition = position;
                document.querySelector('video').dispatchEvent(new Event(name));
            }, {name, paused, position});
            await popup.waitForFunction(() => chrome.storage.local.get('last_delivery').then(x => x.last_delivery?.at >= 0));
            while (calls.filter(x => x.url === '/api/scrobble').length === before) {
                assert.ok(Date.now() - started < 2000, `${name} must arrive within 2s in the local fixture`);
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            const latest = calls.filter(x => x.url === '/api/scrobble').at(-1).body;
            assert.equal(latest.is_playing, !paused);
            assert.equal(latest.progress_sec, position);
            console.log(`${name} delivered in ${Date.now() - started}ms`);
        }
        await playbackEvent('pause', true, 32);
        await playbackEvent('playing', false, 32);
        await playbackEvent('seeked', false, 120);

        // A successful HTTP transport is not a successful listening event.
        scrobbleStatus = 'integration_paused';
        await music.evaluate(() => { document.querySelector('.title').innerText = 'Filtered fixture'; });
        await popup.waitForFunction(() => document.querySelector('#delivery-status').innerText.includes('выключен'));
        scrobbleStatus = 'ok';
        await music.evaluate(() => { document.querySelector('.title').innerText = 'Resumed fixture'; });
        await popup.waitForFunction(() => document.querySelector('#delivery-status').innerText.includes('Событие принято'));
        await popup.locator('#logout-btn').click();
        await popup.waitForFunction(() => !document.querySelector('#tracking-enabled').checked);
        const count = calls.length;
        await music.evaluate(() => { document.querySelector('.title').innerText = 'After disconnect'; });
        await new Promise(r => setTimeout(r, 1600));
        assert.equal(calls.length, count, 'Disconnect must stop further transmission');
        console.log('Installed Chromium extension: popup, read-only connection test, strict-CSP tracking and disconnect passed.');
    } finally {
        await context?.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(profile, {recursive: true, force: true});
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
