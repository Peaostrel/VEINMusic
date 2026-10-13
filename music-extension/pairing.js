// VEIN Music - device pairing shared by the popup and the background worker.
// The extension asks the server for a short code, the user approves it on
// the website (/link) and the extension receives its own revocable API key.

const VEIN_DEFAULT_API = 'https://api.music.vein.guru';

function veinApiBase(settings) {
    const candidate = settings?.apiUrl || VEIN_DEFAULT_API;
    const url = new URL(candidate);
    const local = (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:';
    if (url.origin !== VEIN_DEFAULT_API && !local) throw new Error('Недопустимый адрес API');
    return url.origin;
}

function veinStorageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function veinStorageSet(values) {
    return new Promise((resolve, reject) => chrome.storage.local.set(values, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
    }));
}

function veinStorageRemove(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

function veinClientName() {
    return 'Расширение VEIN';
}

async function veinStartPairing() {
    await veinStorageRemove(['pairing']);
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
    const verificationUrl = new URL(data.verification_uri_complete);
    if (verificationUrl.origin !== 'https://music.vein.guru' &&
        !((verificationUrl.hostname === 'localhost' || verificationUrl.hostname === '127.0.0.1') && verificationUrl.protocol === 'http:')) {
        throw new Error('Сервер вернул недопустимую страницу подтверждения');
    }
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
let veinPairingPoll = null;
function veinPollPairing() {
    if (!veinPairingPoll) {
        veinPairingPoll = veinPollPairingOnce().finally(() => { veinPairingPoll = null; });
    }
    return veinPairingPoll;
}

async function veinPollPairingOnce() {
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
            if (typeof data.api_key !== 'string' || !data.api_key || typeof data.username !== 'string') return 'error';
            const current = await veinStorageGet(['pairing', 'trackingEnabled']);
            // A response to an old poll must not reconnect a disconnected device.
            if (current.pairing?.device_code !== pairing.device_code || current.trackingEnabled !== true) return 'none';
            await veinStorageSet({ apiKey: data.api_key, username: data.username, offline_scrobbles: [] });
            await veinStorageRemove(['pairing']);
            return 'approved';
        }
        if (data.status === 'pending') return 'pending';
        const current = await veinStorageGet(['pairing']);
        if (current.pairing?.device_code === pairing.device_code) await veinStorageRemove(['pairing']);
        return data.status === 'denied' ? 'denied' : 'expired';
    } catch {
        // Keep the pending authorization for retry; never log its code or keys.
        console.warn('[VEIN] Не удалось проверить подключение устройства. Повторим проверку позже.');
        return 'error';
    }
}
