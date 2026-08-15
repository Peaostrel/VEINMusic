// VEIN Music Extension - Background Service Worker with Offline Buffering

const ALARM_NAME = 'FLUSH_OFFLINE_SCROBBLES';

// Setup periodic alarm to flush offline queue
if (chrome.alarms) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === ALARM_NAME) {
            flushOfflineQueue();
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

        const API_BASE = res.apiUrl || 'https://music.vein.guru';
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Security: Verify sender domain to prevent API key theft from malicious sites
    const senderUrl = sender.tab ? new URL(sender.tab.url) : null;
    const isTrusted = senderUrl && (
        senderUrl.hostname === "music.vein.guru" || 
        senderUrl.hostname === "localhost" || 
        senderUrl.hostname === "127.0.0.1"
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

    // 3. Отправляем трек на сервер или сохраняем в оффлайн-очередь
    if (request.type === 'SCROBBLE') {
        chrome.storage.local.get(['apiUrl', 'apiKey'], (settings) => {
            const API_BASE = settings.apiUrl || 'https://music.vein.guru';
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