// VEIN Music - device pairing shared by the popup and the background worker.
// The extension asks the server for a short code, the user approves it on
// the website (/link) and the extension receives its own revocable API key.

var VEIN_DEFAULT_API = 'https://music.vein.guru';

function veinApiBase(settings) {
    return (settings && settings.apiUrl) || VEIN_DEFAULT_API;
}

function veinStorageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function veinStorageSet(values) {
    return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function veinStorageRemove(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

function veinClientName() {
    const ua = navigator.userAgent;
    const browser = ua.includes('Firefox') ? 'Firefox'
        : ua.includes('Edg/') ? 'Edge'
        : ua.includes('OPR/') ? 'Opera'
        : ua.includes('YaBrowser') ? 'Яндекс Браузер'
        : 'Chrome';
    return `Расширение VEIN (${browser})`;
}

async function veinStartPairing() {
    const settings = await veinStorageGet(['apiUrl']);
    const res = await fetch(`${veinApiBase(settings)}/api/devices/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: veinClientName() })
    });
    if (!res.ok) {
        throw new Error(`Сервер ответил ${res.status}`);
    }
    const data = await res.json();
    const pairing = {
        device_code: data.device_code,
        user_code: data.user_code,
        url: data.verification_uri_complete,
        interval: data.interval || 5,
        expires_at: Date.now() + (data.expires_in || 600) * 1000
    };
    await veinStorageSet({ pairing });
    return pairing;
}

// Returns 'none' | 'pending' | 'approved' | 'denied' | 'expired' | 'error'
async function veinPollPairing() {
    const { pairing, apiUrl } = await veinStorageGet(['pairing', 'apiUrl']);
    if (!pairing) return 'none';
    if (Date.now() > pairing.expires_at) {
        await veinStorageRemove(['pairing']);
        return 'expired';
    }
    try {
        const res = await fetch(`${veinApiBase({ apiUrl })}/api/devices/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_code: pairing.device_code })
        });
        if (!res.ok) return 'error';
        const data = await res.json();
        if (data.status === 'approved') {
            await veinStorageSet({ apiKey: data.api_key, username: data.username });
            await veinStorageRemove(['pairing']);
            return 'approved';
        }
        if (data.status === 'pending') return 'pending';
        await veinStorageRemove(['pairing']);
        return data.status === 'denied' ? 'denied' : 'expired';
    } catch (e) {
        return 'error';
    }
}
