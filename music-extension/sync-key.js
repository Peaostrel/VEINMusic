// Проверяем, что мы реально на сайте VEIN, а не где-то еще. Локально
// доверяем только фронтенду на порту 3000: любая другая локальная страница
// могла бы подсунуть расширению чужой ключ.
function isVeinSite(loc) {
    if (loc.hostname === 'music.vein.guru') return loc.protocol === 'https:';
    return (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') && loc.port === '3000';
}
async function sendToBackground(message) {
    try {
        await chrome.runtime.sendMessage(message);
    } catch {
        // Extension updates can invalidate a content-script context. Reloading
        // the page reconnects it; never log a message containing an API key.
        console.warn('[VEIN] Расширение недоступно. Обновите страницу для синхронизации.');
    }
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
            void sendToBackground({
                type: "SYNC_KEYS",
                data: { username: msg.username, apiKey: msg.apiKey }
            });
        } else if (msg.type === 'VEIN_EXTENSION_LOGOUT') {
            void sendToBackground({ type: "LOGOUT" });
        }
    });

    // Миграция со старых версий сайта: перенести ключ в расширение и
    // удалить его из localStorage.
    try {
        const legacyKey = window.localStorage.getItem('apiKey');
        const legacyUser = window.localStorage.getItem('username');
        if (legacyKey) {
            if (legacyUser) {
                void sendToBackground({ // NOSONAR S7785: content scripts cannot use top-level await.
                    type: "SYNC_KEYS",
                    data: { username: legacyUser, apiKey: legacyKey }
                });
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
