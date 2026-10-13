// VEIN Music Extension - Background Service Worker with Offline Buffering

// Chrome loads this file as a service worker; Firefox loads pairing.js via
// the "scripts" list in the manifest.
if (typeof veinPollPairing === 'undefined' && typeof importScripts === 'function') {
    importScripts('pairing.js');
}

const ALARM_NAME = 'FLUSH_OFFLINE_SCROBBLES';

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

function addToOfflineQueue(scrobbleData, accountKey) {
    return mutateOfflineQueue((queue, settings) => {
        if (!accountKey || settings.apiKey !== accountKey || settings.trackingEnabled !== true) return queue;
        if (queue.length >= 500) return queue;
        return [...queue, { id: crypto.randomUUID(), accountKey, payload: scrobbleData, queuedAt: Date.now() }];
    });
}

function bufferScrobble(scrobbleData, accountKey) {
    addToOfflineQueue(scrobbleData, accountKey).catch((error) => {
        console.warn('[VEIN] Прослушивание не удалось сохранить для повторной отправки:', error);
    });
}

// Serialize cleanup behind any queue write already in progress, including
// writes that began before the popup removed credentials or paused tracking.
chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || (!changes.apiKey && !changes.trackingEnabled)) return;
    void mutateOfflineQueue((queue, settings) => queue.filter((item) =>
        settings.trackingEnabled === true && item.accountKey === settings.apiKey));
});

async function flushOfflineQueue() {
    if (flushInProgress) return;
    flushInProgress = true;
    try {
        await queueMutation;
        await mutateOfflineQueue((queue, settings) => queue.filter((item) =>
            settings.trackingEnabled === true && item.accountKey === settings.apiKey &&
            Date.now() - item.queuedAt < 7 * 24 * 60 * 60 * 1000));
        const res = await storageGet(['apiUrl', 'apiKey', 'offline_scrobbles', 'trackingEnabled']);
        const queue = Array.isArray(res.offline_scrobbles) ? res.offline_scrobbles : [];
        if (queue.length === 0 || !res.apiKey || res.trackingEnabled !== true) return;

        const API_BASE = veinApiBase(res);
        const sent = new Set();
        for (const item of queue) {
            try {
                const current = await storageGet(['apiKey', 'trackingEnabled']);
                if (current.apiKey !== res.apiKey || current.trackingEnabled !== true) break;
                const response = await fetch(`${API_BASE}/api/scrobble`, {
                    method: 'POST',
                    signal: AbortSignal.timeout(15000),
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${res.apiKey}`
                    },
                    body: JSON.stringify(item.payload)
                });
                if (!response.ok) {
                    console.warn(`[VEIN] Оффлайн-очередь остановлена: сервер ответил ${response.status}.`);
                    break;
                }
                sent.add(item.id);
            } catch (error) {
                console.warn('[VEIN] Оффлайн-очередь остановлена из-за ошибки сети:', error);
                break;
            }
        }

        if (sent.size > 0) {
            // Only remove the sent prefix. New items appended while the network
            // requests were in flight remain in the queue.
            await mutateOfflineQueue((current) => current.filter((item) => !sent.has(item.id)));
            console.log(`[VEIN] Успешно синхронизировано ${sent.size} оффлайн-скробблов.`);
        }
    } catch (error) {
        console.warn('[VEIN] Не удалось синхронизировать оффлайн-очередь:', error);
    } finally {
        flushInProgress = false;
    }
}

const SCROBBLE_MIN_INTERVAL_MS = 5000;
let lastScrobbleSent = { key: '', playing: false, at: 0 };

function shouldSendScrobble(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const key = `${payload.source}|${payload.artist}|${payload.title}`;
    const playing = Boolean(payload.is_playing);
    const now = Date.now();
    const changed = key !== lastScrobbleSent.key || playing !== lastScrobbleSent.playing;
    if (!changed && now - lastScrobbleSent.at < SCROBBLE_MIN_INTERVAL_MS) return false;
    lastScrobbleSent = { key, playing, at: now };
    return true;
}

async function sendScrobble(payload) {
    let accountKey;
    try {
        const settings = await storageGet(['apiUrl', 'apiKey', 'trackingEnabled']);
        if (!settings.apiKey || settings.trackingEnabled !== true || !shouldSendScrobble(payload)) return;
        accountKey = settings.apiKey;
        const response = await fetch(`${veinApiBase(settings)}/api/scrobble`, {
            method: 'POST',
            signal: AbortSignal.timeout(15000),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            console.warn(`[VEIN] Сервер ответил ${response.status}, сохраняем в оффлайн-очередь.`);
            bufferScrobble(payload, accountKey);
            return;
        }
        console.log('[VEIN] Состояние воспроизведения отправлено.');
        await flushOfflineQueue();
    } catch (error) {
        console.warn('[VEIN] Не удалось отправить прослушивание, сохраняем в оффлайн-очередь:', error);
        bufferScrobble(payload, accountKey);
    }
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
        chrome.storage.local.remove(['username', 'apiKey', 'pairing', 'offline_scrobbles', 'trackingEnabled'], () => {
            const error = chrome.runtime.lastError;
            if (error) console.warn('[VEIN] Не удалось удалить ключи:', error.message);
            else console.log('[VEIN] Ключи стерты по запросу с сайта.');
        });
    }

    // 3. Отправляем трек на сервер или сохраняем в оффлайн-очередь.
    // Вкладка присылает состояние каждые 800 мс; серверу достаточно сигнала
    // раз в несколько секунд (он учитывает паузы между сигналами до 35 с),
    // поэтому одинаковые сигналы чаще раза в 5 секунд не отправляем.
    if (request.type === 'SCROBBLE') {
        const source = platformForUrl(senderUrl);
        const payload = source && safeTrackPayload(request.data, source);
        if (payload) void sendScrobble(payload);
    }
});
