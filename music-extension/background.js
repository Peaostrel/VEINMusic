chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 3. Отправляем трек на сервер
    if (request.type === 'SCROBBLE') {
        chrome.storage.local.get(['apiUrl'], (settings) => {
            const API_BASE = settings.apiUrl || 'https://api.music.vein.guru';
            
            // Read api_key from cookie directly
            chrome.cookies.get({ url: API_BASE, name: "api_key" }, (cookie) => {
                if (!cookie?.value) {
                    console.log('[VEIN] Отмена: нет ключей, ожидание авторизации.');
                    return;
                }
                
                const apiKey = cookie.value;
                const payload = request.data;
                
                fetch(`${API_BASE}/api/scrobble`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(payload)
                })
                .then(res => res.json())
                .then(out => console.log('[VEIN] Трек успешно отправлен на сервер:', out))
                .catch(err => console.error('[VEIN] Ошибка связи с сервером:', err));
            });
        });
    }
});