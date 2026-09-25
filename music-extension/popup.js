document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    let pollTimer = null;

    function showState(data) {
        const connected = Boolean(data.username && data.apiKey);
        $('auth-box').style.display = connected ? 'block' : 'none';
        $('unauth-box').style.display = connected ? 'none' : 'block';
        $('pair-box').style.display = connected ? 'none' : 'block';
        if (connected) {
            $('username-display').innerText = data.username;
        }
    }

    function setPairStatus(text, color) {
        $('pair-status').innerText = text;
        $('pair-status').style.color = color || '#888';
    }

    function showPairing(pairing) {
        $('pair-code-box').style.display = 'block';
        $('pair-code').innerText = pairing.user_code;
        $('pair-open-btn').onclick = () => chrome.tabs.create({ url: pairing.url });
    }

    function pollLoop(intervalSec) {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(async () => {
            const status = await veinPollPairing();
            if (status === 'approved') {
                setPairStatus('Подключено!', '#1DB954');
                chrome.storage.local.get(['username', 'apiKey'], showState);
            } else if (status === 'pending' || status === 'error') {
                pollLoop(intervalSec);
            } else if (status === 'denied') {
                $('pair-code-box').style.display = 'none';
                setPairStatus('Подключение отклонено на сайте.', '#ef4444');
            } else if (status === 'expired') {
                $('pair-code-box').style.display = 'none';
                setPairStatus('Код устарел, попробуйте ещё раз.', '#ef4444');
            }
        }, intervalSec * 1000);
    }

    chrome.storage.local.get(['username', 'apiKey', 'pairing'], (data) => {
        showState(data);
        // Resume a pairing started before the popup was closed
        if (!data.apiKey && data.pairing && Date.now() < data.pairing.expires_at) {
            showPairing(data.pairing);
            pollLoop(data.pairing.interval);
        }
    });

    $('pair-btn')?.addEventListener('click', async () => {
        setPairStatus('Получаем код…');
        try {
            const pairing = await veinStartPairing();
            setPairStatus('');
            showPairing(pairing);
            chrome.tabs.create({ url: pairing.url });
            pollLoop(pairing.interval);
        } catch (e) {
            setPairStatus(`Ошибка: ${e.message}`, '#ef4444');
        }
    });

    $('save-btn')?.addEventListener('click', () => {
        const apiKey = $('api-key-input').value.trim();
        const username = $('username-input').value.trim();
        if (apiKey && username) {
            chrome.storage.local.set({ apiKey, username }, () => {
                location.reload();
            });
        }
    });

    $('logout-btn')?.addEventListener('click', () => {
        chrome.storage.local.remove(['username', 'apiKey', 'pairing'], () => location.reload());
    });

    $('test-btn')?.addEventListener('click', () => {
        const logBox = $('log-box');
        logBox.innerText = "Отправка...";
        chrome.storage.local.get(['apiUrl', 'apiKey'], (settings) => {
            // Same server as the background scrobbler uses
            const API_BASE = veinApiBase(settings);
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
