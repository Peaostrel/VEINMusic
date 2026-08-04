chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 3. Отправляем трек на сервер
    if (request.type === 'SCROBBLE') {
        chrome.storage.local.get(['apiUrl', 'apiKey'], (settings) => {
            const API_BASE = settings.apiUrl || 'http://127.0.0.1:8000';
            const apiKey = settings.apiKey;
            
            if (!apiKey) {
                console.log('[VEIN] Отмена: нет ключа в storage.');
                return;
            }
            
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
    }
});