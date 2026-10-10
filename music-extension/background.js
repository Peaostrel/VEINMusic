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
        const res = await storageGet(['offline_scrobbles']);
        const queue = Array.isArray(res.offline_scrobbles) ? res.offline_scrobbles : [];
        await storageSet({ offline_scrobbles: update(queue) });
    });
    queueMutation = operation.catch((error) => {
        console.warn('[VEIN] Не удалось сохранить оффлайн-очередь:', error);
    });
    return operation;
}

function addToOfflineQueue(scrobbleData) {
    return mutateOfflineQueue((queue) => {
        if (queue.length >= 500) return queue;
        return [...queue, { payload: scrobbleData, queuedAt: Date.now() }];
    });
}

function bufferScrobble(scrobbleData) {
    addToOfflineQueue(scrobbleData).catch((error) => {
        console.warn('[VEIN] Прослушивание не удалось сохранить для повторной отправки:', error);
    });
}

async function flushOfflineQueue() {
    if (flushInProgress) return;
    flushInProgress = true;
    try {
        await queueMutation;
        const res = await storageGet(['apiUrl', 'apiKey', 'offline_scrobbles']);
        const queue = Array.isArray(res.offline_scrobbles) ? res.offline_scrobbles : [];
        if (queue.length === 0 || !res.apiKey) return;

        const API_BASE = veinApiBase(res);
        let sent = 0;
        for (const item of queue) {
            try {
                const response = await fetch(`${API_BASE}/api/scrobble`, {
                    method: 'POST',
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
                sent++;
            } catch (error) {
                console.warn('[VEIN] Оффлайн-очередь остановлена из-за ошибки сети:', error);
                break;
            }
        }

        if (sent > 0) {
            // Only remove the sent prefix. New items appended while the network
            // requests were in flight remain in the queue.
            await mutateOfflineQueue((current) => current.slice(sent));
            console.log(`[VEIN] Успешно синхронизировано ${sent} оффлайн-скробблов.`);
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
    try {
        const settings = await storageGet(['apiUrl', 'apiKey']);
        if (!settings.apiKey) {
            bufferScrobble(payload);
            return;
        }
        const response = await fetch(`${veinApiBase(settings)}/api/scrobble`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            console.warn(`[VEIN] Сервер ответил ${response.status}, сохраняем в оффлайн-очередь.`);
            bufferScrobble(payload);
            return;
        }
        console.log('[VEIN] Трек успешно отправлен на сервер:', await response.json());
        await flushOfflineQueue();
    } catch (error) {
        console.warn('[VEIN] Не удалось отправить прослушивание, сохраняем в оффлайн-очередь:', error);
        bufferScrobble(payload);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Security: only the VEIN site may change the stored key (see sync-key.js)
    const senderUrl = sender.tab?.url ? new URL(sender.tab.url) : null;
    const isTrusted = Boolean(senderUrl) && (
        (senderUrl.hostname === "music.vein.guru" && senderUrl.protocol === "https:") ||
        ((senderUrl.hostname === "localhost" || senderUrl.hostname === "127.0.0.1") && senderUrl.port === "3000")
    );

    // 1. Принимаем ключи с сайта
    if (request.type === 'SYNC_KEYS' && isTrusted) {
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
        chrome.storage.local.remove(['username', 'apiKey'], () => {
            const error = chrome.runtime.lastError;
            if (error) console.warn('[VEIN] Не удалось удалить ключи:', error.message);
            else console.log('[VEIN] Ключи стерты по запросу с сайта.');
        });
    }

    // 3. Отправляем трек на сервер или сохраняем в оффлайн-очередь.
    // Вкладка присылает состояние каждые 800 мс; серверу достаточно сигнала
    // раз в несколько секунд (он учитывает паузы между сигналами до 35 с),
    // поэтому одинаковые сигналы чаще раза в 5 секунд не отправляем.
    if (request.type === 'SCROBBLE' && shouldSendScrobble(request.data)) {
        void sendScrobble(request.data);
    }
});
