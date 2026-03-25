// Проверяем, что мы реально на сайте VEIN, а не где-то еще
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log("🔥 [VEIN] Скрипт синхронизации расширения УСПЕШНО ВНЕДРЕН на: " + window.location.href);

    // Сразу ставим клеймо, не дожидаясь интервала
    document.documentElement.setAttribute('data-vein-extension', 'installed');

    setInterval(() => {
        try {
            // Подтверждаем клеймо каждую секунду, чтобы Next.js его не стер при рендере
            document.documentElement.setAttribute('data-vein-extension', 'installed');
            
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