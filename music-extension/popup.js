document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    let pollTimer;

    function setPairStatus(text, color = '#aaa') {
        $('pair-status').innerText = text;
        $('pair-status').style.color = color;
    }

    function playbackDetail(delivery) {
        if (delivery.position == null) return '';
        const state = delivery.playing ? 'играет' : 'пауза';
        return `${state}, ${Math.round(delivery.position)} с`;
    }

    function deliveryDetails(delivery) {
        const version = chrome.runtime.getManifest().version;
        if (!delivery) return `v${version}`;
        return [
            `v${delivery.version || version}`,
            delivery.title ? `${delivery.artist} — ${delivery.title}` : '',
            playbackDetail(delivery),
            delivery.deliveryMs == null ? '' : `доставка ${delivery.deliveryMs} мс`,
            delivery.processingMs == null ? '' : `сервер ${delivery.processingMs} мс`
        ].filter(Boolean).join(' · ');
    }

    function showState(data) {
        const connected = Boolean(data.apiKey);
        $('tracking-enabled').checked = data.trackingEnabled === true;
        $('pair-btn').disabled = data.trackingEnabled !== true;
        $('save-btn').disabled = data.trackingEnabled !== true;
        $('auth-box').style.display = connected ? 'block' : 'none';
        $('unauth-box').style.display = connected ? 'none' : 'block';
        $('pair-box').style.display = connected ? 'none' : 'block';
        $('username-display').innerText = data.username || '';
        $('tracking-status').innerText = data.trackingEnabled === true ?
            'Передача включена.' : 'Передача прослушиваний приостановлена.';
        $('delivery-status').innerText = data.last_delivery?.message || 'Включите трек в музыкальной вкладке. Здесь появится результат приёма.';
        const delivery = data.last_delivery;
        $('delivery-details').innerText = deliveryDetails(delivery);
    }

    function refreshState() {
        chrome.storage.local.get(['apiKey', 'username', 'trackingEnabled', 'last_delivery'], showState);
    }

    $('tracking-enabled').addEventListener('change', async () => {
        const enabled = $('tracking-enabled').checked;
        try {
            await veinStorageSet({ trackingEnabled: enabled });
            if (!enabled) {
                clearTimeout(pollTimer);
                await veinStorageRemove(['offline_scrobbles', 'pairing']);
                $('pair-code-box').style.display = 'none';
            }
            refreshState();
        } catch {
            setPairStatus('Не удалось сохранить настройку.', '#ef4444');
        }
    });

    function showPairing(pairing) {
        $('pair-code-box').style.display = 'block';
        $('pair-code').innerText = pairing.user_code;
        $('pair-open-btn').onclick = () => chrome.tabs.create({ url: pairing.url });
    }

    function pollLoop(intervalSec) {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(async () => {
            // Keep popup and minute-alarm polling in one background context.
            const status = await chrome.runtime.sendMessage({ type: 'PAIRING_POLL' }).catch(() => 'error');
            if (status === 'approved') {
                setPairStatus('Подключено!', '#1DB954');
                refreshState();
            } else if (status === 'pending' || status === 'error') {
                pollLoop(intervalSec);
            } else {
                $('pair-code-box').style.display = 'none';
                if (status !== 'none') setPairStatus(status === 'denied' ?
                    'Подключение отклонено на сайте.' : 'Код устарел. Попробуйте ещё раз.', '#ef4444');
            }
        }, intervalSec * 1000);
    }

    chrome.storage.local.get(['username', 'apiKey', 'pairing', 'trackingEnabled', 'last_delivery'], (data) => {
        showState(data);
        if (!data.apiKey && data.trackingEnabled === true && data.pairing && Date.now() < data.pairing.expires_at) {
            showPairing(data.pairing);
            pollLoop(data.pairing.interval);
        }
    });
    chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') refreshState(); });

    $('pair-btn').addEventListener('click', async () => {
        if (!$('tracking-enabled').checked) return;
        $('pair-btn').disabled = true;
        setPairStatus('Получаем код…');
        try {
            const pairing = await veinStartPairing();
            setPairStatus('');
            showPairing(pairing);
            chrome.tabs.create({ url: pairing.url });
            pollLoop(pairing.interval);
        } catch (error) {
            setPairStatus(`Ошибка: ${error.message}`, '#ef4444');
        } finally {
            refreshState();
        }
    });

    $('save-btn').addEventListener('click', async () => {
        if (!$('tracking-enabled').checked) return;
        const apiKey = $('api-key-input').value.trim();
        const username = $('username-input').value.trim();
        if (!apiKey || !username) return setPairStatus('Введите ключ и никнейм.', '#ef4444');
        await veinStorageSet({ apiKey, username, offline_scrobbles: [], last_delivery: null });
        $('api-key-input').value = '';
        refreshState();
    });

    $('logout-btn').addEventListener('click', async () => {
        clearTimeout(pollTimer);
        await veinStorageRemove(['username', 'apiKey', 'pairing', 'offline_scrobbles', 'trackingEnabled', 'last_delivery']);
        refreshState();
    });

    $('test-btn').addEventListener('click', async () => {
        const logBox = $('log-box');
        logBox.innerText = 'Проверяем связь…';
        try {
            const settings = await veinStorageGet(['apiUrl', 'apiKey']);
            if (!settings.apiKey) throw new Error('Сначала подключите аккаунт');
            // Read-only endpoint: testing must not create a fictitious play.
            const response = await fetch(`${veinApiBase(settings)}/api/profile/preferences`, {
                headers: { Authorization: `Bearer ${settings.apiKey}` },
                signal: AbortSignal.timeout(15000)
            });
            const hint = response.status === 401 || response.status === 403 ?
                'подключите аккаунт заново.' : 'попробуйте позже.';
            logBox.innerText = response.ok ? 'Связь с VEIN работает.' : `Ошибка ${response.status}: ${hint}`;
        } catch (error) {
            logBox.innerText = `Ошибка: ${error.message}`;
        }
    });
});
