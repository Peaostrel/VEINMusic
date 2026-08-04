document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['username', 'apiKey'], (data) => {
        if (data.username && data.apiKey) {
            document.getElementById('unauth-box').style.display = 'none';
            document.getElementById('auth-box').style.display = 'block';
            document.getElementById('username-display').innerText = data.username;
        } else {
            document.getElementById('unauth-box').style.display = 'block';
            document.getElementById('auth-box').style.display = 'none';
        }
    });

    document.getElementById('save-btn')?.addEventListener('click', () => {
        const apiKey = document.getElementById('api-key-input').value.trim();
        const username = document.getElementById('username-input').value.trim();
        if (apiKey && username) {
            chrome.storage.local.set({ apiKey, username }, () => {
                location.reload();
            });
        }
    });

    document.getElementById('test-btn')?.addEventListener('click', () => {
        const logBox = document.getElementById('log-box');
        logBox.innerText = "Отправка...";
        chrome.storage.local.get(['apiUrl', 'apiKey'], (settings) => {
            const API_BASE = settings.apiUrl || 'http://127.0.0.1:8000';
            const apiKey = settings.apiKey;
            
            fetch(`${API_BASE}/api/scrobble`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    title: "Test Track from Extension",
                    artist: "VEIN Test",
                    album: "",
                    cover_url: "",
                    track_url: "",
                    source: "yandex",
                    progress_sec: 1,
                    is_playing: true,
                    duration: 60
                })
            })
            .then(res => res.json().then(data => ({status: res.status, data})))
            .then(out => {
                logBox.innerText = `Успех: ${out.status} - ${JSON.stringify(out.data)}`;
            })
            .catch(err => {
                logBox.innerText = `Ошибка: ${err.message}`;
            });
        });
    });
});