// VEIN Music - device pairing shared by the popup and the background worker.
// The extension asks the server for a short code, the user approves it on
// the website (/link) and the extension receives its own revocable API key.
// It also holds the small i18n helpers, since pairing.js is the one script
// loaded by both the popup and the background in Chrome and Firefox.

// Localized text from _locales/<lang>/messages.json (English by default).
// Returns '' when the i18n API is unavailable, so callers can fall back.
function veinT(key, substitutions) {
    try {
        return globalThis.chrome?.i18n?.getMessage(key, substitutions) || '';
    } catch {
        return '';
    }
}

// The language of the catalog the browser actually chose, so plural rules
// match the text (a Ukrainian browser gets English text and English plurals).
function veinLocale() {
    return veinT('locale') || 'en';
}

// Plural category for a count: one/few/many/other in Russian, one/other in
// English. Intl.PluralRules is built into every supported browser; the
// explicit rules are a fallback for environments without it.
function veinPluralCategory(count, locale = veinLocale()) {
    try {
        return new Intl.PluralRules(locale).select(count);
    } catch {
        if (!Number.isInteger(count)) return 'other';
        const n = Math.abs(count);
        if (!locale.startsWith('ru')) return n === 1 ? 'one' : 'other';
        if (n % 10 === 1 && n % 100 !== 11) return 'one';
        if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return 'few';
        return 'many';
    }
}

// Message `${key}_${category}` with the count as $1, e.g. playback_seconds_few.
function veinPlural(key, count) {
    const value = String(count);
    return veinT(`${key}_${veinPluralCategory(count)}`, [value]) || veinT(`${key}_other`, [value]);
}

const VEIN_DEFAULT_API = 'https://api.music.vein.guru';

function veinApiBase(settings) {
    const candidate = settings?.apiUrl || VEIN_DEFAULT_API;
    const url = new URL(candidate);
    const local = (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:';
    if (url.origin !== VEIN_DEFAULT_API && !local) throw new Error(veinT('error_invalidApiUrl') || 'Invalid API address');
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
    return veinT('clientName') || 'VEIN extension';
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
        throw new Error(veinT('error_serverStatus', [String(res.status)]) || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const verificationUrl = new URL(data.verification_uri_complete);
    if (verificationUrl.origin !== 'https://music.vein.guru' &&
        !((verificationUrl.hostname === 'localhost' || verificationUrl.hostname === '127.0.0.1') && verificationUrl.protocol === 'http:')) {
        throw new Error(veinT('error_invalidVerificationPage') || 'Invalid confirmation page');
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
