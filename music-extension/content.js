/**
 * VEIN Music Extension Content Script
 * -----------------------------------
 * Основной скрипт расширения.
 * Перехватывает данные о текущем треке с поддерживаемых сайтов
 * и отправляет их на бэкенд VEIN для скроблинга.
 */
console.log("[VEIN] 💉 content.js запущен: Внедряем page_world.js в обход защиты Яндекса...");

// Легальный инжект файла, который не блокируется Content-Security-Policy
const script = document.createElement('script');
script.src = chrome.runtime.getURL('page_world.js');
script.onload = function() {
    this.remove(); // Убираем следы из DOM после загрузки
};
(document.head || document.documentElement).appendChild(script);

// Слушаем сообщения от page_world.js и передаем их в ядро расширения
window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'VEIN_SCROBBLE') return;
    
    chrome.runtime.sendMessage({ 
        type: 'SCROBBLE', 
        data: event.data.payload 
    }).catch(() => {});
});