// chrome.i18n stub backed by the real _locales catalogs. It follows the
// documented getMessage rules: named $PLACEHOLDER$ entries resolve to their
// "content", where $1..$9 are the substitutions; unknown keys return ''.
const fs = require('node:fs');
const path = require('node:path');

function loadCatalog(locale) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales', locale, 'messages.json'), 'utf8'));
}

function i18nMock(locale = 'ru') {
    const catalog = loadCatalog(locale);
    const fallback = loadCatalog('en');
    return {
        getUILanguage: () => locale,
        getMessage(key, substitutions) {
            const entry = catalog[key] || fallback[key];
            if (!entry) return '';
            const subs = substitutions == null ? [] : [].concat(substitutions).map(String);
            const placeholders = Object.fromEntries(Object.entries(entry.placeholders || {})
                .map(([name, value]) => [name.toLowerCase(), value.content]));
            const fill = (text) => text.replace(/\$(\d)/g, (_, n) => subs[n - 1] ?? '');
            return entry.message.replace(/\$([A-Za-z0-9_@]+)\$/g, (match, name) =>
                Object.hasOwn(placeholders, name.toLowerCase()) ? fill(placeholders[name.toLowerCase()]) : match);
        }
    };
}

module.exports = { i18nMock, loadCatalog };
