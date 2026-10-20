const DELIVERY_TONES = {
    ok: 'ok', confirmed_duplicate: 'ok',
    rate_limited: 'warn', ignored_spam_protection: 'warn', network_error: 'warn',
    server_error: 'warn', invalid_response: 'warn', ignored_inactive: 'warn',
    auth_required: 'danger', invalid_payload: 'danger', flagged: 'danger', blacklisted: 'danger'
};

// Brand names stay as is; services with a localized name have a source_<id> message.
const SOURCE_LABELS = {
    yandex: 'Yandex Music', spotify: 'Spotify', youtube_music: 'YouTube Music',
    vk: 'VK', soundcloud: 'SoundCloud', apple_music: 'Apple Music', zvuk: 'Zvuk'
};

function sourceLabel(source) {
    return veinT(`source_${source}`) || SOURCE_LABELS[source] || source;
}

function playbackDetail(delivery) {
    if (delivery.position == null) return '';
    const state = veinT(delivery.playing ? 'playback_playing' : 'playback_paused');
    return [state, veinPlural('playback_seconds', Math.round(delivery.position))].filter(Boolean).join(', ');
}

function deliveryDetails(delivery) {
    if (!delivery) return '';
    return [
        sourceLabel(delivery.source),
        playbackDetail(delivery),
        delivery.deliveryMs == null ? '' : veinT('detail_deliveryMs', [String(delivery.deliveryMs)]),
        delivery.processingMs == null ? '' : veinT('detail_serverMs', [String(delivery.processingMs)])
    ].filter(Boolean).join(' · ');
}

// Status text in the current browser language; the stored message is a
// fallback for statuses this version does not know.
function deliveryStatusText(delivery) {
    if (!delivery) return veinT('popup_deliveryEmpty');
    return (delivery.status && veinT(`delivery_${delivery.status}`)) || delivery.message || '';
}

// popup.html ships English text; replace it with the browser language at load.
// Elements keep their built-in text when a message is missing.
function localizePage(root = document) {
    const lang = veinLocale();
    document.documentElement.lang = lang;
    for (const el of root.querySelectorAll('[data-i18n]')) {
        const text = veinT(el.dataset.i18n);
        if (text) el.textContent = text;
    }
    for (const attr of ['placeholder', 'aria-label', 'title']) {
        for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) {
            const text = veinT(el.getAttribute(`data-i18n-${attr}`));
            if (text) el.setAttribute(attr, text);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    let pollTimer;
    localizePage();

    function errorText(error) {
        return veinT('popup_errorDetail', [error.message]) || error.message;
    }

    function setPairStatus(text, tone = '') {
        $('pair-status').innerText = text;
        $('pair-status').dataset.tone = tone;
    }

    $('version').innerText = `v${chrome.runtime.getManifest().version}`;

    function showState(data) {
        const connected = Boolean(data.apiKey);
        $('tracking-enabled').checked = data.trackingEnabled === true;
        $('pair-btn').disabled = data.trackingEnabled !== true;
        $('save-btn').disabled = data.trackingEnabled !== true;
        $('pair-hint').hidden = data.trackingEnabled === true;
        $('auth-box').style.display = connected ? 'block' : 'none';
        $('unauth-box').style.display = connected ? 'none' : 'block';
        $('pair-box').style.display = connected ? 'none' : 'block';
        $('username-display').innerText = data.username || '';
        $('avatar').innerText = (data.username || '?').slice(0, 1);
        $('tracking-dot').toggleAttribute('data-off', data.trackingEnabled !== true);
        $('tracking-status').innerText = veinT(data.trackingEnabled === true ? 'popup_trackingOn' : 'popup_trackingOff');
        const delivery = data.last_delivery;
        $('delivery-track').innerText = delivery?.title ? `${delivery.artist} — ${delivery.title}` : '';
        $('delivery-status').innerText = deliveryStatusText(delivery);
        $('delivery-status').dataset.tone = DELIVERY_TONES[delivery?.status] || '';
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
            setPairStatus(veinT('popup_settingSaveFailed'), 'danger');
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
                setPairStatus(veinT('popup_pairApproved'), 'ok');
                refreshState();
            } else if (status === 'pending' || status === 'error') {
                pollLoop(intervalSec);
            } else {
                $('pair-code-box').style.display = 'none';
                if (status !== 'none') setPairStatus(veinT(status === 'denied' ?
                    'popup_pairDenied' : 'popup_pairExpired'), 'danger');
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
        setPairStatus(veinT('popup_pairRequesting'));
        try {
            const pairing = await veinStartPairing();
            setPairStatus('');
            showPairing(pairing);
            chrome.tabs.create({ url: pairing.url });
            pollLoop(pairing.interval);
        } catch (error) {
            setPairStatus(errorText(error), 'danger');
        } finally {
            refreshState();
        }
    });

    $('save-btn').addEventListener('click', async () => {
        if (!$('tracking-enabled').checked) return;
        const apiKey = $('api-key-input').value.trim();
        const username = $('username-input').value.trim();
        if (!apiKey || !username) return setPairStatus(veinT('popup_credentialsRequired'), 'danger');
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
        logBox.innerText = veinT('popup_testRunning');
        logBox.dataset.tone = '';
        try {
            const settings = await veinStorageGet(['apiUrl', 'apiKey']);
            if (!settings.apiKey) throw new Error(veinT('popup_testNeedAccount'));
            // Read-only endpoint: testing must not create a fictitious play.
            const response = await fetch(`${veinApiBase(settings)}/api/profile/preferences`, {
                headers: { Authorization: `Bearer ${settings.apiKey}` },
                signal: AbortSignal.timeout(15000)
            });
            const hint = veinT(response.status === 401 || response.status === 403 ?
                'popup_hintReconnect' : 'popup_hintLater');
            logBox.innerText = response.ok ? veinT('popup_testOk') :
                veinT('popup_testHttpError', [String(response.status), hint]);
            logBox.dataset.tone = response.ok ? 'ok' : 'danger';
        } catch (error) {
            logBox.innerText = errorText(error);
            logBox.dataset.tone = 'danger';
        }
    });
});
