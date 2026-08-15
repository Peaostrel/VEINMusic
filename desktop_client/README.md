# 🎵 VEINMusic Desktop Client & System Media Listener

Фоновый нативный клиент для отслеживания воспроизведения музыки в системе и автоматического скробблинга на платформу [VEINMusic](https://music.vein.guru).

---

## ⚡ Особенности

- **Поддержка любых нативных плееров:**
  - **Windows:** Windows SMTC (System Media Transport Controls) + Сканер окон (Spotify Desktop, AIMP, foobar2000, VLC, VK, Яндекс Музыка).
  - **Linux:** MPRIS2 (`playerctl` / `dbus`).
- **Discord Rich Presence:**
  - Трансляция текущего трека, обложки, таймкодов и кнопки перехода в ваш профиль VEINMusic в статус Discord.
- **Оффлайн-буферизация:**
  - При отсутствии интернета скробблы сохраняются в локальную очередь (`~/.veinmusic/queue.json`) и автоматически отправляются при восстановлении связи.
- **Умное определение скроббла:**
  - Скробблит после прослушивания 50% трека (или максимум 4 минут), исключая скипы и короткие джинглы (<20 сек).

---

## 🚀 Установка и запуск

1. Установите зависимости:
   ```bash
   pip install -r desktop_client/requirements.txt
   ```

2. Запустите клиент:
   ```bash
   python -m desktop_client.main
   ```

3. При первом запуске введите ваш API Key со страницы [Настройки VEINMusic](https://music.vein.guru/settings). Настройки сохранятся в `~/.veinmusic/config.json`.
