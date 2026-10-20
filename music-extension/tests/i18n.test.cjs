const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { i18nMock, loadCatalog } = require('./i18n-mock.cjs');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const en = loadCatalog('en');
const ru = loadCatalog('ru');

function sharedContext(locale, extra = {}) {
    const context = vm.createContext({ chrome: locale ? { i18n: i18nMock(locale) } : undefined, URL, ...extra });
    vm.runInContext(read('pairing.js'), context);
    return context;
}

test('English is the default locale and the manifest text comes from the catalogs', () => {
    const manifest = JSON.parse(read('manifest.json'));
    assert.equal(manifest.default_locale, 'en');
    for (const field of ['name', 'description']) {
        const key = manifest[field].match(/^__MSG_(\w+)__$/)?.[1];
        assert.ok(key, `${field} must be localized`);
        assert.ok(en[key] && ru[key], `${key} must exist in both catalogs`);
    }
    assert.ok(en.extDescription.message.length <= 132, 'Chrome limits descriptions to 132 characters');
    assert.ok(ru.extDescription.message.length <= 132, 'Chrome limits descriptions to 132 characters');
});

test('English and Russian catalogs have the same keys and placeholders', () => {
    assert.deepEqual(Object.keys(ru).sort(), Object.keys(en).sort());
    for (const key of Object.keys(en)) {
        assert.ok(en[key].message && ru[key].message, `${key} must not be empty`);
        assert.deepEqual(Object.keys(ru[key].placeholders || {}).sort(), Object.keys(en[key].placeholders || {}).sort(), key);
    }
    assert.equal(en.locale.message, 'en');
    assert.equal(ru.locale.message, 'ru');
});

test('every message referenced by the extension exists', () => {
    const html = read('popup.html');
    const used = new Set([...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]));
    for (const file of ['popup.js', 'pairing.js', 'background.js']) {
        for (const m of read(file).matchAll(/veinT\('([A-Za-z0-9_]+)'/g)) used.add(m[1]);
        for (const m of read(file).matchAll(/'(popup_\w+|playback_\w+|detail_\w+)'/g)) used.add(m[1]);
    }
    const statuses = read('background.js').match(/DELIVERY_STATUSES = new Set\(\[([\s\S]*?)\]\)/)[1];
    for (const m of statuses.matchAll(/'(\w+)'/g)) used.add(`delivery_${m[1]}`);
    for (const category of ['one', 'few', 'many', 'other']) used.add(`playback_seconds_${category}`);
    used.delete('playback_seconds'); // plural base passed to veinPlural, resolved per category above
    for (const key of used) assert.ok(Object.hasOwn(en, key), `missing message ${key}`);
    assert.ok(used.has('delivery_auth_required') && used.has('popup_pairButton'));
});

test('popup.html ships English text so it is readable without the extension APIs', () => {
    const html = read('popup.html');
    assert.match(html, /<html lang="en">/);
    const body = html.slice(html.indexOf('<body>'));
    assert.doesNotMatch(body, /[А-Яа-яЁё]/);
    for (const m of body.matchAll(/data-i18n="(\w+)">([^<]*)</g)) assert.equal(m[2], en[m[1]].message, m[1]);
});

test('Russian plurals use one/few/many, English uses one/other', () => {
    const context = sharedContext('ru');
    const ruCases = { 0: 'many', 1: 'one', 2: 'few', 4: 'few', 5: 'many', 11: 'many', 12: 'many', 14: 'many', 21: 'one', 22: 'few', 25: 'many', 101: 'one', 111: 'many' };
    for (const [n, category] of Object.entries(ruCases)) {
        assert.equal(context.veinPluralCategory(Number(n), 'ru'), category, `ru ${n}`);
    }
    assert.equal(context.veinPluralCategory(1, 'en'), 'one');
    assert.equal(context.veinPluralCategory(2, 'en'), 'other');
    assert.equal(context.veinPlural('playback_seconds', 1), '1 секунда');
    assert.equal(context.veinPlural('playback_seconds', 3), '3 секунды');
    assert.equal(context.veinPlural('playback_seconds', 5), '5 секунд');
    assert.equal(context.veinPlural('playback_seconds', 21), '21 секунда');
    const english = sharedContext('en');
    assert.equal(english.veinPlural('playback_seconds', 1), '1 second');
    assert.equal(english.veinPlural('playback_seconds', 32), '32 seconds');
});

test('the plural fallback without Intl matches Intl.PluralRules', () => {
    const context = sharedContext('ru');
    const intl = Object.fromEntries(Array.from({ length: 250 }, (_, n) => [n, context.veinPluralCategory(n, 'ru')]));
    const enIntl = Array.from({ length: 5 }, (_, n) => context.veinPluralCategory(n, 'en'));
    vm.runInContext('globalThis.Intl = undefined', context);
    for (let n = 0; n < 250; n += 1) assert.equal(context.veinPluralCategory(n, 'ru'), intl[n], `ru ${n}`);
    assert.deepEqual(Array.from({ length: 5 }, (_, n) => context.veinPluralCategory(n, 'en')), enIntl);
});

test('helpers degrade to empty text without chrome.i18n', () => {
    const context = sharedContext(null);
    assert.equal(context.veinT('popup_testOk'), '');
    assert.equal(context.veinLocale(), 'en');
    assert.equal(context.veinClientName(), 'VEIN extension');
});

test('pairing errors and the device name follow the browser language', () => {
    assert.equal(sharedContext('ru').veinClientName(), 'Расширение VEIN');
    assert.equal(sharedContext('en').veinClientName(), 'VEIN extension');
    assert.throws(() => sharedContext('en').veinApiBase({ apiUrl: 'https://evil.example' }), /Invalid API address/);
    assert.throws(() => sharedContext('ru').veinApiBase({ apiUrl: 'https://evil.example' }), /Недопустимый адрес API/);
});

function fakeElement(attributes, text) {
    const attrs = { ...attributes };
    return {
        textContent: text,
        get dataset() {
            return Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-'))
                .map(([k, v]) => [k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));
        },
        getAttribute: (name) => attrs[name] ?? null,
        setAttribute: (name, value) => { attrs[name] = value; },
        matches: (selector) => Object.hasOwn(attrs, selector.slice(1, -1))
    };
}

function localizedPopup(locale) {
    const elements = [
        fakeElement({ 'data-i18n': 'popup_pairButton' }, 'Connect via website'),
        fakeElement({ 'data-i18n-placeholder': 'popup_apiKeyPlaceholder', 'data-i18n-aria-label': 'popup_apiKeyLabel',
            placeholder: 'API key from VEIN settings', 'aria-label': 'API key' }, ''),
        fakeElement({ 'data-i18n': 'no_such_message' }, 'Built-in text')
    ];
    const document = {
        documentElement: { lang: 'en' },
        addEventListener() {},
        querySelectorAll: (selector) => elements.filter((el) => el.matches(selector))
    };
    const context = sharedContext(locale, { document });
    vm.runInContext(read('popup.js'), context);
    context.localizePage();
    return { document, elements, context };
}

test('popup static text is filled from the catalog at load', () => {
    const { document, elements, context } = localizedPopup('ru');
    assert.equal(document.documentElement.lang, 'ru');
    assert.equal(elements[0].textContent, 'Подключить через сайт');
    assert.equal(elements[1].getAttribute('placeholder'), 'API-ключ из настроек VEIN');
    assert.equal(elements[1].getAttribute('aria-label'), 'API-ключ');
    assert.equal(elements[2].textContent, 'Built-in text');
    assert.equal(context.deliveryDetails({ source: 'yandex', position: 32.4, playing: false, deliveryMs: 120, processingMs: 15 }),
        'Яндекс Музыка · пауза, 32 секунды · доставка 120 мс · сервер 15 мс');
    // The popup shows the status in the current language, not the language it was stored in.
    assert.equal(context.deliveryStatusText({ status: 'auth_required', message: 'stored text' }), ru.delivery_auth_required.message);
    assert.equal(context.deliveryStatusText({ status: 'future_status', message: 'stored text' }), 'stored text');

    const english = localizedPopup('en');
    assert.equal(english.document.documentElement.lang, 'en');
    assert.equal(english.elements[0].textContent, 'Connect via website');
    assert.equal(english.context.deliveryDetails({ source: 'spotify', position: 1, playing: true }), 'Spotify · playing, 1 second');
});
