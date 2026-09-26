// VEIN Music Extension - Background Service Worker with Offline Buffering

// Chrome loads this file as a service worker; Firefox loads pairing.js via
// the "scripts" list in the manifest.
if (typeof veinPollPairing === 'undefined' && typeof importScripts === 'function') {
    importScripts('pairing.js');
}

const ALARM_NAME = 'FLUSH_OFFLINE_SCROBBLES';

// Setup periodic alarm to flush offline queue (and finish device pairing
// if the popup was closed before the user approved the code)
if (chrome.alarms) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === ALARM_NAME) {
            flushOfflineQueue();
            veinPollPairing().then((status) => {
                if (status === 'approved') flushOfflineQueue();
            });
        }
    });
}

function addToOfflineQueue(scrobbleData) {
    chrome.storage.local.get(['offline_scrobbles'], (res) => {
        const queue = Array.isArray(res.offline_scrobbles) ? res.offline_scrobbles : [];
        // Max 500 queued items to prevent storage explosion
        if (queue.length < 500) {
            queue.push({
                payload: scrobbleData,
                queuedAt: Date.now()
            });
            chrome.storage.local.set({ offline_scrobbles: queue }, () => {
                console.log(`[VEIN] Скроббл добавлен в оффлайн-очередь (всего: ${queue.length})`);
            });
        }
    });
}

function flushOfflineQueue() {
    chrome.storage.local.get(['apiUrl', 'apiKey', 'offline_scrobbles'], async (res) => {
        const queue = Array.isArray(res.offline_scrobbles) ? res.offline_scrobbles : [];
        if (queue.length === 0 || !res.apiKey) return;

        const API_BASE = veinApiBase(res);
        const apiKey = res.apiKey;
        const remaining = [];
        let flushedCount = 0;

        for (const item of queue) {
            try {
                const response = await fetch(`${API_BASE}/api/scrobble`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(item.payload)
                });

                if (response.ok) {
                    flushedCount++;
                } else if (response.status >= 500 || response.status === 429) {
                    // Server error / rate limit: retain in queue and stop this cycle
                    remaining.push(item);
                    break;
                }
            } catch (err) {
                // Network still offline: log and keep remaining items in queue
                console.warn('[VEIN] Offline queue sync paused due to network error:', err);
                remaining.push(item);
                break;
            }
        }

        chrome.storage.local.set({ offline_scrobbles: remaining }, () => {
            if (flushedCount > 0) {
                console.log(`[VEIN] Успешно синхронизировано ${flushedCount} оффлайн-скробблов.`);
            }
        });
    });
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Security: only the VEIN site may change the stored key (see sync-key.js)
    const senderUrl = sender.tab?.url ? new URL(sender.tab.url) : null;
    const isTrusted = Boolean(senderUrl) && (
        (senderUrl.hostname === "music.vein.guru" && senderUrl.protocol === "https:") ||
        ((senderUrl.hostname === "localhost" || senderUrl.hostname === "127.0.0.1") && senderUrl.port === "3000")
    );

    // 1. Принимаем ключи с сайта
    if (request.type === 'SYNC_KEYS' && isTrusted) {
        chrome.storage.local.set({
            username: request.data.username,
            apiKey: request.data.apiKey
        });
        console.log('[VEIN] Ключи синхронизированы с сайтом.');
        // Trigger queue flush on successful login/sync
        flushOfflineQueue();
    }

    // 2. Стираем ключи, если вышли
    if (request.type === 'LOGOUT' && isTrusted) {
        chrome.storage.local.remove(['username', 'apiKey']);
        console.log('[VEIN] Ключи стерты по запросу с сайта.');
    }

    // 3. Отправляем трек на сервер или сохраняем в оффлайн-очередь.
    // Вкладка присылает состояние каждые 800 мс; серверу достаточно сигнала
    // раз в несколько секунд (он учитывает паузы между сигналами до 35 с),
    // поэтому одинаковые сигналы чаще раза в 5 секунд не отправляем.
    if (request.type === 'SCROBBLE' && shouldSendScrobble(request.data)) {
        chrome.storage.local.get(['apiUrl', 'apiKey'], (settings) => {
            const API_BASE = veinApiBase(settings);
            const apiKey = settings.apiKey;
            const payload = request.data;
            
            if (!apiKey) {
                console.log('[VEIN] Отмена: нет ключа в storage. Сохраняем в оффлайн-буфер.');
                addToOfflineQueue(payload);
                return;
            }
            
            fetch(`${API_BASE}/api/scrobble`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload)
            })
            .then(res => {
                if (res.ok) {
                    return res.json().then(out => {
                        console.log('[VEIN] Трек успешно отправлен на сервер:', out);
                        // Also try to flush any previously stored offline scrobbles
                        flushOfflineQueue();
                    });
                } else if (res.status >= 500) {
                    console.warn(`[VEIN] Серверная ошибка (${res.status}), сохраняем в оффлайн-очередь.`);
                    addToOfflineQueue(payload);
                }
            })
            .catch(err => {
                console.warn('[VEIN] Сеть недоступна, сохраняем в оффлайн-очередь:', err);
                addToOfflineQueue(payload);
            });
        });
    }
});