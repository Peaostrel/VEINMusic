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
    }

    // 2. Стираем ключи, если вышли
    if (request.type === 'LOGOUT' && isTrusted) {
        chrome.storage.local.remove(['username', 'apiKey']);
    }

    // 3. Отправляем трек на сервер
    if (request.type === 'SCROBBLE') {
        chrome.storage.local.get(['apiKey', 'username'], (data) => {
            if (!data.apiKey || !data.username) {
                console.log('[VEIN] Отмена: нет ключей, ожидание авторизации.');
                return;
            }

            const payload = {
                ...request.data,
                username: data.username,
                api_key: data.apiKey
            };

            chrome.storage.local.get(['apiUrl'], (settings) => {
                const API_BASE = settings.apiUrl || 'https://api.music.vein.guru';
                fetch(`${API_BASE}/api/scrobble`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
                .then(res => res.json())
                .then(out => console.log('[VEIN] Трек успешно отправлен на сервер:', out))
                .catch(err => console.error('[VEIN] Ошибка связи с сервером:', err));
            });
        });
    }
});