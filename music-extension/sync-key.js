// Проверяем, что мы реально на сайте VEIN, а не где-то еще. Локально
// доверяем только фронтенду на порту 3000: любая другая локальная страница
// могла бы подсунуть расширению чужой ключ.
function isVeinSite(loc) {
    if (loc.hostname === 'music.vein.guru') return loc.protocol === 'https:';
    return (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') && loc.port === '3000';
}
if (isVeinSite(window.location)) {
    console.log("🔥 [VEIN] Скрипт синхронизации расширения внедрен на: " + window.location.href);

    // Сразу ставим клеймо, чтобы сайт знал, что расширение установлено
    document.documentElement.dataset.veinExtension = 'installed';

    // Сайт больше не хранит API ключ в localStorage (его могла бы прочитать
    // любая XSS). Вместо этого он один раз передает ключ через postMessage
    // сразу после регистрации / генерации нового ключа.
    window.addEventListener('message', (event) => {
        if (event.source !== window || event.origin !== window.location.origin) return;
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'VEIN_EXTENSION_SYNC_KEYS'
            && typeof msg.apiKey === 'string' && msg.apiKey
            && typeof msg.username === 'string') {
            chrome.runtime.sendMessage({
                type: "SYNC_KEYS",
                data: { username: msg.username, apiKey: msg.apiKey }
            }).catch(() => {});
        } else if (msg.type === 'VEIN_EXTENSION_LOGOUT') {
            chrome.runtime.sendMessage({ type: "LOGOUT" }).catch(() => {});
        }
    });

    // Миграция со старых версий сайта: перенести ключ в расширение и
    // удалить его из localStorage.
    try {
        const legacyKey = window.localStorage.getItem('apiKey');
        const legacyUser = window.localStorage.getItem('username');
        if (legacyKey) {
            if (legacyUser) {
                chrome.runtime.sendMessage({
                    type: "SYNC_KEYS",
                    data: { username: legacyUser, apiKey: legacyKey }
                }).catch(() => {});
            }
            window.localStorage.removeItem('apiKey');
        }
    } catch (e) {
        console.error("[VEIN] Ошибка синхронизации:", e);
    }

    // Клеймо может стереть Next.js при гидратации — восстанавливаем его
    setInterval(() => {
        document.documentElement.dataset.veinExtension = 'installed';
    }, 1000);
}
