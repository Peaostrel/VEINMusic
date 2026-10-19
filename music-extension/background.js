// VEIN Music Extension - Background Service Worker with Offline Buffering

// Chrome loads this file as a service worker; Firefox loads pairing.js via
// the "scripts" list in the manifest.
if (typeof veinPollPairing === 'undefined' && typeof importScripts === 'function') {
    importScripts('pairing.js');
}

const ALARM_NAME = 'FLUSH_OFFLINE_SCROBBLES';
const extensionVersion = (() => {
    try { return chrome.runtime.getManifest().version; }
    catch { return 'unknown'; }
})();

// These are classic Chrome/Firefox scripts, so await belongs inside functions.
async function createFlushAlarm() {
    try {
        await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    } catch (error) {
        console.warn('[VEIN] Не удалось включить фоновую синхронизацию:', error);
    }
}

// Setup periodic alarm to flush offline queue (and finish device pairing
// if the popup was closed before the user approved the code)
if (chrome.alarms) {
    void createFlushAlarm(); // NOSONAR S7785: manifest loads a classic script, not an ES module.
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === ALARM_NAME) {
            void flushOfflineQueue();
            veinPollPairing().then((status) => {
                if (status === 'approved') return flushOfflineQueue();
            }).catch((error) => {
                console.warn('[VEIN] Не удалось проверить подключение устройства:', error);
            });
        }
    });
}

const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const storageSet = (values) => new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
    });
});

// Chrome storage has no atomic read-modify-write. Serialize queue writes so
// scrobbles arriving during a flush are not overwritten by its final write.
let queueMutation = Promise.resolve();
let flushInProgress = false;

function mutateOfflineQueue(update) {
    const operation = queueMutation.then(async () => {
        const res = await storageGet(['offline_scrobbles', 'apiKey', 'trackingEnabled']);
        const queue = Array.isArray(res.offline_scrobbles) ? res.offline_scrobbles : [];
        await storageSet({ offline_scrobbles: update(queue, res) });
    });
    queueMutation = operation.catch((error) => {
        console.warn('[VEIN] Не удалось сохранить оффлайн-очередь:', error);
    });
    return operation;
}

// The endpoint accepts live state, not historical imports. Replaying a days-old
// heartbeat as "now playing" both revives the wrong track and credits no play.
const LIVE_SNAPSHOT_TTL_MS = 35_000;
const ACCEPTED_STATUSES = new Set(['ok', 'confirmed_duplicate']);
const SKIPPED_STATUSES = new Set([
    'integration_paused', 'source_ignored', 'artist_ignored', 'track_ignored',
    'short_track_ignored', 'private_session', 'blacklisted', 'link_ignored', 'ignored_inactive'
]);
const DELIVERY_MESSAGES = {
    ok: 'Событие принято. Зачёт прослушивания зависит от реально прослушанного времени.',
    confirmed_duplicate: 'Событие принято: этот трек уже отслеживается другим подключением.',
    integration_paused: 'Приём этого сервиса выключен в настройках VEIN.',
    source_ignored: 'Этот сервис исключён из записи в настройках VEIN.',
    artist_ignored: 'Исполнитель исключён из записи в настройках VEIN.',
    track_ignored: 'Трек исключён из записи в настройках VEIN.',
    short_track_ignored: 'Короткие треки исключены в настройках VEIN.',
    private_session: 'В VEIN включена приватная сессия: запись приостановлена.',
    blacklisted: 'Событие отклонено правилами VEIN.',
    link_ignored: 'В названии или исполнителе обнаружена ссылка.',
    rate_limited: 'Сервер просит подождать. Передача повторится автоматически.',
    ignored_spam_protection: 'Смена трека отложена сервером. Передача повторится автоматически.',
    flagged: 'Сервер ограничил приём. Проверьте диагностику интеграции в VEIN.',
    ignored_inactive: 'Остановленная вкладка пропущена: в другом плеере сейчас играет музыка.',
    auth_required: 'Ключ недействителен или не имеет доступа. Подключите расширение заново.',
    invalid_payload: 'Сервис передал неполные данные трека. Обновите расширение и страницу плеера.',
    network_error: 'Нет связи с VEIN. Текущее состояние будет отправлено повторно.',
    server_error: 'VEIN временно недоступен. Передача повторится автоматически.',
    invalid_response: 'Сервер не подтвердил приём события. Передача повторится автоматически.'
};

function freshSnapshot(item, settings) {
    return settings.trackingEnabled === true && item.accountKey === settings.apiKey &&
        Number.isFinite(item.queuedAt) && Date.now() - item.queuedAt < LIVE_SNAPSHOT_TTL_MS;
}

function addToOfflineQueue(scrobbleData, accountKey, observedAt = Date.now()) {
    return mutateOfflineQueue((queue, settings) => {
        if (!accountKey || settings.apiKey !== accountKey || settings.trackingEnabled !== true) return queue;
        const current = queue.filter((item) => freshSnapshot(item, settings) &&
            (!scrobbleData.source || item.payload?.source !== scrobbleData.source));
        if (current.length >= 500 || Date.now() - observedAt >= LIVE_SNAPSHOT_TTL_MS) return current;
        return [...current, { id: crypto.randomUUID(), accountKey, payload: scrobbleData, queuedAt: observedAt }];
    });
}

function bufferScrobble(scrobbleData, accountKey, observedAt) {
    return addToOfflineQueue(scrobbleData, accountKey, observedAt).catch((error) => {
        console.warn('[VEIN] Прослушивание не удалось сохранить для повторной отправки:', error);
    });
}

// Serialize cleanup behind any queue write already in progress.
chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || (!changes.apiKey && !changes.trackingEnabled)) return;
    void mutateOfflineQueue((queue, settings) => queue.filter((item) => freshSnapshot(item, settings)));
});

// Live requests and retries share one lane: an older retry cannot finish
// after a newer live update and switch the server back to the previous song.
let deliveryChain = Promise.resolve();
let retryTimer = null;
function scheduleRetry() {
    if (retryTimer !== null) return;
    retryTimer = setTimeout(() => {
        retryTimer = null;
        void flushOfflineQueue();
    }, 3000);
    retryTimer?.unref?.(); // Node test timers must not keep the process alive.
}

function deliverExclusive(action) {
    const operation = deliveryChain.then(action);
    deliveryChain = operation.catch((error) => console.warn('[VEIN] Ошибка передачи:', error));
    return operation;
}

function httpOutcome(status) {
    if (status === 401 || status === 403) return {kind: 'auth', status: 'auth_required'};
    if (status === 400 || status === 422) return {kind: 'discard', status: 'invalid_payload'};
    return {kind: 'retry', status: status === 429 ? 'rate_limited' : 'server_error'};
}

async function submitScrobble(apiBase, apiKey, payload) {
    let response;
    try {
        response = await fetch(`${apiBase}/api/scrobble`, {
            method: 'POST', signal: AbortSignal.timeout(15000),
            headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`},
            body: JSON.stringify(payload)
        });
    } catch {
        return {kind: 'retry', status: 'network_error'};
    }
    if (!response.ok) return {...httpOutcome(response.status), httpStatus: response.status};
    let data;
    try { data = await response.json(); }
    catch { return {kind: 'retry', status: 'invalid_response', httpStatus: response.status}; }
    const status = data?.status;
    if (ACCEPTED_STATUSES.has(status)) return {kind: 'accepted', status, httpStatus: response.status, diagnostics: data?.diagnostics};
    if (SKIPPED_STATUSES.has(status)) return {kind: 'skipped', status, httpStatus: response.status, diagnostics: data?.diagnostics};
    return {kind: 'retry', status: Object.hasOwn(DELIVERY_MESSAGES, status) ? status : 'invalid_response', httpStatus: response.status};
}

async function rememberDelivery(outcome, payload, accountKey) {
    const settings = await storageGet(['apiKey', 'trackingEnabled']);
    if (settings.apiKey !== accountKey || settings.trackingEnabled !== true) return;
    await storageSet({last_delivery: {
        status: outcome.status, message: DELIVERY_MESSAGES[outcome.status],
        httpStatus: outcome.httpStatus ?? null, source: payload?.source || '', at: Date.now(),
        title: payload?.title || '', artist: payload?.artist || '',
        position: payload?.progress_sec ?? null, playing: Boolean(payload?.is_playing),
        eventId: payload?.client_event_id || null, version: extensionVersion,
        deliveryMs: outcome.diagnostics?.delivery_ms ?? null,
        processingMs: outcome.diagnostics?.processing_ms ?? null
    }});
}

async function flushQueuedSnapshots() {
    await mutateOfflineQueue((queue, settings) => queue.filter((item) => freshSnapshot(item, settings)));
    const settings = await storageGet(['apiUrl', 'apiKey', 'offline_scrobbles', 'trackingEnabled']);
    const queue = settings.offline_scrobbles || [];
    if (!settings.apiKey || settings.trackingEnabled !== true) return;
    const sent = new Set();
    for (const item of queue) {
        const current = await storageGet(['apiKey', 'trackingEnabled']);
        if (!freshSnapshot(item, current)) continue;
        const outcome = await submitScrobble(veinApiBase(settings), settings.apiKey, item.payload);
        await rememberDelivery(outcome, item.payload, settings.apiKey);
        if (outcome.kind === 'retry') {
            scheduleRetry();
            break;
        }
        if (outcome.kind === 'auth') break;
        sent.add(item.id);
    }
    if (sent.size) await mutateOfflineQueue((current) => current.filter((item) => !sent.has(item.id)));
}

async function flushOfflineQueue() {
    if (flushInProgress) return;
    flushInProgress = true;
    try { await deliverExclusive(flushQueuedSnapshots); }
    catch (error) { console.warn('[VEIN] Не удалось синхронизировать очередь:', error); }
    finally { flushInProgress = false; }
}

const SCROBBLE_MIN_INTERVAL_MS = 5000;
let lastScrobbleSent = { key: '', playing: false, at: 0, position: 0 };

function shouldSendScrobble(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const key = `${payload.source}|${payload.artist}|${payload.title}`;
    const playing = Boolean(payload.is_playing);
    const now = Date.now();
    const expectedPosition = lastScrobbleSent.position +
        (lastScrobbleSent.playing ? (now - lastScrobbleSent.at) / 1000 : 0);
    const sought = Math.abs(payload.progress_sec - expectedPosition) > 2;
    const changed = key !== lastScrobbleSent.key || playing !== lastScrobbleSent.playing || sought;
    if (!changed && now - lastScrobbleSent.at < SCROBBLE_MIN_INTERVAL_MS) return false;
    lastScrobbleSent = { key, playing, at: now, position: payload.progress_sec };
    return true;
}

async function deliverLiveSnapshot(event) {
    const settings = await storageGet(['apiKey', 'trackingEnabled']);
    if (!freshSnapshot({accountKey: event.accountKey, queuedAt: event.observedAt}, settings)) return;
    const outcome = await submitScrobble(event.apiBase, event.accountKey, event.payload);
    await rememberDelivery(outcome, event.payload, event.accountKey);
    if (outcome.kind === 'retry') {
        await bufferScrobble(event.payload, event.accountKey, event.observedAt);
        scheduleRetry();
    } else if (outcome.kind === 'accepted' || outcome.kind === 'skipped') {
        await mutateOfflineQueue((queue) => queue.filter((item) =>
            item.accountKey !== event.accountKey || item.queuedAt > event.observedAt ||
            (outcome.kind === 'skipped' && item.payload?.source !== event.payload.source)));
    }
}

let pendingLive = null;
let sendingLive = false;
async function sendScrobble(payload) {
    const settings = await storageGet(['apiUrl', 'apiKey', 'trackingEnabled']);
    if (!settings.apiKey || settings.trackingEnabled !== true || !shouldSendScrobble(payload)) return;
    const observedAt = Date.now();
    payload = {...payload, client_event_id: crypto.randomUUID(),
        client_observed_at_ms: observedAt, client_version: extensionVersion};
    pendingLive = {payload, accountKey: settings.apiKey, apiBase: veinApiBase(settings), observedAt};
    if (sendingLive) return;
    sendingLive = true;
    try {
        while (pendingLive) {
            const event = pendingLive;
            pendingLive = null;
            await deliverExclusive(() => deliverLiveSnapshot(event)); // NOSONAR: deliberate ordering; parallel requests can restore an obsolete track.
        }
    } catch (error) { console.warn('[VEIN] Ошибка отправки состояния:', error); }
    finally { sendingLive = false; }
}

function messageSenderUrl(sender) {
    try { return new URL(sender.url || sender.tab?.url); }
    catch { return null; }
}

function platformForUrl(url) {
    if (url?.protocol !== 'https:') return null;
    return {
        'music.yandex.ru': 'yandex', 'music.yandex.com': 'yandex',
        'open.spotify.com': 'spotify', 'music.youtube.com': 'youtube_music',
        'vk.com': 'vk', 'vk.ru': 'vk', 'soundcloud.com': 'soundcloud',
        'music.apple.com': 'apple_music'
    }[url.hostname] || null;
}

function safeTrackPayload(data, source) {
    if (!data || data.source !== source || typeof data.title !== 'string' || !data.title.trim() ||
        typeof data.artist !== 'string' || data.title.length > 500 || data.artist.length > 500 ||
        !Number.isFinite(data.progress_sec) || data.progress_sec < 0 ||
        !Number.isFinite(data.duration) || data.duration < 0) return null;
    let trackUrl = '';
    try {
        const url = new URL(data.track_url);
        if (platformForUrl(url) === source) {
            const videoId = source === 'youtube_music' ? url.searchParams.get('v') : null;
            url.username = ''; url.password = ''; url.search = ''; url.hash = '';
            if (videoId) url.searchParams.set('v', videoId);
            trackUrl = url.href;
        }
    } catch { /* A track URL is optional. */ }
    let coverUrl = '';
    try {
        const url = new URL(data.cover_url);
        if (url.protocol === 'https:' && !url.username && !url.password) coverUrl = url.href.slice(0, 2000);
    } catch { /* Artwork is optional. */ }
    return {
        title: data.title.trim(), artist: data.artist.trim(),
        album: typeof data.album === 'string' ? data.album.slice(0, 500) : '',
        source, track_url: trackUrl, cover_url: coverUrl,
        progress_sec: Math.floor(data.progress_sec), duration: Math.floor(data.duration),
        player_position: data.player_position === true,
        is_playing: data.is_playing === true
    };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || typeof request !== 'object') return;
    // Security: only the VEIN site may change the stored key (see sync-key.js)
    const senderUrl = messageSenderUrl(sender);
    if (request.type === 'PAIRING_POLL' && sender?.id === chrome.runtime.id &&
        senderUrl?.href === chrome.runtime.getURL('popup.html')) {
        veinPollPairing().then(sendResponse).catch(() => sendResponse('error'));
        return true;
    }
    const isTrusted = Boolean(senderUrl) && (
        (senderUrl.hostname === "music.vein.guru" && senderUrl.protocol === "https:") ||
        ((senderUrl.hostname === "localhost" || senderUrl.hostname === "127.0.0.1") && senderUrl.port === "3000")
    );

    // 1. Принимаем ключи с сайта
    if (request.type === 'SYNC_KEYS' && isTrusted && typeof request.data?.apiKey === 'string' &&
        request.data.apiKey && typeof request.data.username === 'string') {
        storageSet({
            username: request.data.username,
            apiKey: request.data.apiKey
        }).then(() => {
            console.log('[VEIN] Ключи синхронизированы с сайтом.');
            // Flush only after the new credentials have actually been saved.
            return flushOfflineQueue();
        }).catch((error) => {
            console.warn('[VEIN] Не удалось синхронизировать ключи с сайтом:', error);
        });
    }

    // 2. Стираем ключи, если вышли
    if (request.type === 'LOGOUT' && isTrusted) {
        chrome.storage.local.remove(['username', 'apiKey', 'pairing', 'offline_scrobbles', 'trackingEnabled', 'last_delivery'], () => {
            const error = chrome.runtime.lastError;
            if (error) console.warn('[VEIN] Не удалось удалить ключи:', error.message);
            else console.log('[VEIN] Ключи стерты по запросу с сайта.');
        });
    }

    // 3. Отправляем трек на сервер или сохраняем в оффлайн-очередь.
    // Вкладка присылает события плеера сразу; серверу достаточно сигнала
    // раз в несколько секунд (он учитывает паузы между сигналами до 35 с),
    // поэтому одинаковые сигналы чаще раза в 5 секунд не отправляем.
    if (request.type === 'SCROBBLE') {
        const source = platformForUrl(senderUrl);
        const payload = source && safeTrackPayload(request.data, source);
        if (payload) void sendScrobble(payload).catch((error) => console.warn('[VEIN] Ошибка приёма состояния:', error));
    }
});
