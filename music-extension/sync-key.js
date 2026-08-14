// Проверяем, что мы реально на сайте VEIN, а не где-то еще
const allowedHosts = ['localhost', '127.0.0.1', 'music.vein.guru'];
if (allowedHosts.includes(window.location.hostname)) {
    console.log("🔥 [VEIN] Скрипт синхронизации расширения УСПЕШНО ВНЕДРЕН на: " + window.location.href);

    // Сразу ставим клеймо, не дожидаясь интервала
    document.documentElement.dataset.veinExtension = 'installed';

    setInterval(() => {
        try {
            // Подтверждаем клеймо каждую секунду, чтобы Next.js его не стер при рендере
            document.documentElement.dataset.veinExtension = 'installed';
            
            const username = window.localStorage.getItem('username');
            const apiKey = window.localStorage.getItem('apiKey');
            
            if (username && apiKey) {
                chrome.runtime.sendMessage({ 
                    type: "SYNC_KEYS", 
                    data: { username, apiKey } 
                }).catch(() => {});
            } else {
                chrome.runtime.sendMessage({ type: "LOGOUT" }).catch(() => {});
            }
        } catch (e) {
            console.error("[VEIN] Ошибка синхронизации:", e);
        }
    }, 1000);
}
