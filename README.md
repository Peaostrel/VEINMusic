<div align="center">
  <h1>🎵 V E I N &nbsp; M U S I C</h1>
  <p><strong>Универсальная кроссплатформенная экосистема скробблинга, музыкальной аналитики, геймификации и синхронного прослушивания.</strong></p>
  
  [![FastAPI](https://img.shields.io/badge/Backend-FastAPI_0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
  [![Next.js](https://img.shields.io/badge/Frontend-Next.js_16_(React_19)-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
  [![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_16-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
  [![Redis](https://img.shields.io/badge/Cache-Redis_&_ARQ-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
  [![Extension](https://img.shields.io/badge/Extension-Chrome_MV3-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)]()
  [![Tests](https://img.shields.io/badge/Tests-48%20Passed-success?style=for-the-badge&logo=pytest&logoColor=white)]()
</div>

<br>

![VEIN Music Preview](preview.jpg)

---

## 🌟 О проекте

**VEIN Music** — это современная, независимая платформа нового поколения для любителей музыки, совмещающая точный сбор прослушиваний из любых источников, продвинутую интерактивную аналитику, социальные взаимодействия, элементы RPG-геймификации, нативный десктопный клиент с Discord RPC и открытую платформу для разработчиков.

---

## ⚡ Ключевые возможности

### 🎧 1. Мультиплатформенный скробблинг и оффлайн-надежность
* **Браузерное расширение (Chrome Manifest V3)**:
  * Прямой перехват метаданных и прогресса воспроизведения на вкладках: **Яндекс Музыка**, **Spotify**, **VK Музыка**, **YouTube Music**, **Apple Music**, **SoundCloud**.
  * **Оффлайн-буферизация**: при потере интернет-соединения прослушивания сохраняются в локальное хранилище и автоматически отправляются на сервер через `chrome.alarms` и событие `navigator.onLine`.
* **Нативный десктопный клиент (`desktop_client/`)**:
  * Автономное приложение для **Windows** (через Windows SMTC API) и **Linux** (через MPRIS и сканирование заголовков окон).
  * Поддержка нативных плееров: **Spotify Desktop**, **AIMP**, **foobar2000**, **VLC**, **VK Desktop**, **Яндекс Музыка Desktop**.
  * **Discord Rich Presence (RPC)** в реальном времени с отображением обложки альбома, названия трека, артиста и синхронизированного таймера.
  * Локальная отказоустойчивая очередь `~/.veinmusic/queue.json` с авто-досылом при восстановлении сети.
* **Облачный скробблинг (Cloud Scrobbling)**:
  * Фоновый автоматический опрос статусов воспроизведения через официальные API **Spotify** и **Яндекс Музыка** без необходимости держать открытыми вкладки или плееры.
* **Двусторонняя синхронизация (Two-Way External Sync)**:
  * Автоматический параллельный экспорт каждого зафиксированного скроббла в **Last.fm**, **ListenBrainz** и **Libre.fm**.
* **Импорт истории**:
  * Пакетный импорт архива прослушиваний из **Last.fm** с отслеживанием прогресса и возможностью перезапуска сбойных задач.

---

### 🛡️ 2. Интеллектуальный процессинг и Антифрод (Antifraud Engine)
* **Нормализация метаданных**: интеллектуальная очистка названий треков и альбомов от мусорных суффиксов (`[Remastered]`, `(feat. ...)`, `[Official Audio]`, `Live at...`).
* **Защита от накруток**:
  * Фильтрация спам-скробблинга и мгновенных скипов (учет только прослушиваний более 85% длительности или от 4 минут).
  * Ограничение темпа скробблинга (Rate Limiting) и защита от одновременных дублей из разных источников.
* **Черный список (Blacklist Engine)**:
  * Гибкая блокировка нежелательных треков, артистов или подкастов по ключевым словам, точным именам и регулярным выражениям (Regex).

---

### 📊 3. Аналитика, Статистика и Умные рекомендации
* **Интерактивные графики**:
  * Распределение активности по часам суток и дням недели, динамика за периоды (неделя, месяц, год, все время) на базе **Recharts**.
  * Сводки по топ-артистам, альбомам, трекам и любимым жанрам.
* **Умный рекомендательный движок (Smart Recommendations Engine)**:
  * Гибридная система на основе анализа жанровых векторов пользователя, вкусовых предпочтений похожих слушателей («Taste Neighbors») и глобальных трендов сообщества.
  * Персонализированные рекомендации треков и неизведанных артистов (`/api/recommendations/me`).
* **Музыкальные итоги (Recap / Wrapped)**:
  * Генерация персональных итогов за неделю и месяц.

---

### 🏆 4. Геймификация, Профиль и Социальная экосистема
* **Система уровней и рангов**:
  * Начисление XP за каждое подтвержденное прослушивание (+ бонус за любимые треки).
  * Градация уровней и престижных рангов (от *Туриста* до *Божества*).
* **Анимированные аватарные рамки**:
  * Эксклюзивные визуальные границы профиля (Neon Glow, Cyberpunk, Hologram, Retro Wave, Void и др.), открывающиеся по мере роста уровня.
* **Достижения (Achievements)**:
  * Награды за особые музыкальные паттерны («Ночной слушатель», «Марафонец», «Мультижанровый фанат» и др.).
* **Витрина музыки (Music Showcase)**:
  * Размещение избранных релизов в профиле с пользовательскими рецензиями и оценками.
* **Живой фид и социальные функции**:
  * Глобальная и персональная лента активности друзей (`/feed`) с фильтрацией по источникам (Яндекс, Spotify, Desktop, Расширение), лайками и безопасными комментариями.
  * Лидерборд лучших слушателей сообщества.
* **Слушать вместе (Listen Together)**:
  * Комнаты совместного прослушивания реального времени на WebSockets: один пользователь становится DJ, а остальные синхронно слушают его поток с интерактивным чатом.

---

### 🛠️ 5. Виджеты, PWA и Платформа разработчиков
* **Динамические SVG-виджеты для GitHub README / сайтов**:
  * `Now Playing`: актуальный статус прослушивания с анимированным эквалайзером (`/api/widgets/now-playing/{username}.svg`).
  * `Top Artists`: топ-5 исполнителей пользователя (`/api/widgets/top-artists/{username}.svg`).
* **Social Share OpenGraph карточки (1200x630 SVG)**:
  * Эстетичные карточки итогов недели/месяца (`/api/widgets/og/recap/{username}.svg`) и разблокированных достижений (`/api/widgets/og/achievement/{username}/{id}.svg`).
* **PWA и Web Push**:
  * Поддержка установки веб-приложения на смартфоны и ПК через Service Worker (`sw.js`) и `manifest.json`.
  * Фоновые Web Push уведомления о лайках, комментариях и новых комнатах совместного прослушивания.
* **Developer API & Webhooks**:
  * Персональные токены разработчика (`vm_...`) с безопасным хранением **PBKDF2-HMAC-SHA256**.
  * Подписка на вебхуки (`scrobble.created`, `achievement.unlocked` и др.) с криптографической подписью `X-VEIN-Signature` (HMAC-SHA256).
  * Веб-портал управления ключами и вебхуками (`/developers`).

---

### 🛡️ 6. Admin Nexus 2.0 (Панель администратора)
* Полнофункциональный интерфейс `/admin`:
  * Мониторинг системных метрик, активных комнат совместного прослушивания и пользователей.
  * Управление правилами блэклиста и антифрода.
  * Отслеживание и перезапуск фоновых задач импорта Last.fm.
  * Модерация музыкального каталога и слияние дубликатов треков.

---

## 🏗️ Архитектура и Технологический стек

```
               ┌────────────────────────────────────────────────────────┐
               │                    КЛИЕНТСКИЙ СЛОЙ                     │
               │  Next.js 16 (PWA) │ Chrome MV3 │ Desktop App (Py/RPC)  │
               └───────────────────────────┬────────────────────────────┘
                                           │ HTTPS / WebSockets
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │                     FASTAPI SERVER                     │
               │  Auth / API / WebSockets / Antifraud / Recommendations  │
               └───────────────┬────────────────────────┬───────────────┘
                               │                        │
                PostgreSQL 16  │                        │  Redis 7 / ARQ
        ┌──────────────────────▼───────┐        ┌───────▼────────────────────────┐
        │  Time-Series Partitioning    │        │  Async Workers & Schedulers    │
        │  Scrobbles, Users, Webhooks  │        │  External Sync, Last.fm Import │
        └──────────────────────────────┘        └────────────────────────────────┘
```

* **Backend**: Python 3.12+, **FastAPI**, SQLAlchemy 2.0, Alembic, PostgreSQL 16, Redis 7, ARQ Worker, Pytest, Pydantic v2.
* **Frontend**: **Next.js 16** (App Router, Turbopack, React 19), Tailwind CSS 4, Framer Motion, Recharts, Lucide Icons.
* **Desktop**: Python 3, `winrt` (Windows SMTC), `dbus`/MPRIS (Linux), Discord IPC RPC.
* **Extension**: JavaScript (ES2022), Chrome Extensions API (Manifest V3).
* **CI/CD & Безопасность**: GitHub Actions, ESLint 9, Prettier, CodeQL, SonarQube Cloud, Playwright E2E.

---

## 📁 Структура репозитория

```
VEINMusic/
├── app/                          # Бэкенд-сервер (FastAPI)
│   ├── core/                     # Ядро: безопасность (PBKDF2), Redis, WebSockets, партиционирование
│   ├── models.py                 # Модели базы данных SQLAlchemy
│   ├── schemas.py                # Схемы валидации Pydantic
│   ├── routers/                  # Роутеры (auth, scrobbling, profile, admin, developer, widgets, etc.)
│   ├── services/                 # Бизнес-логика (antifraud, recommendations, external_sync, webhooks, og)
│   ├── worker.py                 # Асинхронный фоновый воркер ARQ
│   └── main.py                   # Точка входа приложения
├── desktop_client/               # Нативный клиент для Windows и Linux (SMTC/MPRIS/Discord RPC)
├── frontend/                     # Веб-приложение Next.js 16 (React 19)
│   ├── app/                      # Страницы и маршруты (about, admin, auth, developers, feed, together, user)
│   ├── components/               # UI-компоненты (PWARegistration, StatsCharts, GlobalAnnouncementBanner)
│   └── public/                   # Статика, манифест PWA и Service Worker (sw.js)
├── music-extension/              # Расширение для Chromium-браузеров (Manifest V3)
├── alembic/                      # Миграции структуры базы данных PostgreSQL
├── tests/                        # Комплексный набор тестов (48 шт., pytest)
└── docker-compose.yml            # Сервисы PostgreSQL и Redis
```

---

## 🚀 Быстрый старт

### 1. Клонирование репозитория
```bash
git clone https://github.com/Peaostrel/VEINMusic.git
cd VEINMusic
```

### 2. Запуск баз данных (PostgreSQL & Redis)
```bash
docker-compose up -d
```

### 3. Настройка и запуск бэкенда
```bash
# Установка зависимостей
pip install -r requirements.txt

# Применение миграций БД
alembic upgrade head

# Запуск сервера разработки
uvicorn app.main:app --reload --port 8000
```

### 4. Настройка и запуск фронтенда
```bash
cd frontend
npm install
npm run dev
```
Фронтенд будет доступен по адресу: `http://localhost:3000`.

### 5. Запуск нативного десктопного клиента (Опционально)
```bash
cd desktop_client
pip install -r requirements.txt
python -m desktop_client.main
```

### 6. Установка браузерного расширения
1. Откройте любой Chromium-браузер (Chrome, Edge, Яндекс Браузер, Brave).
2. Перейдите в `chrome://extensions/` и включите **«Режим разработчика»** (Developer Mode).
3. Нажмите **«Загрузить распакованное расширение»** (Load unpacked) и укажите папку `music-extension`.
4. Авторизуйтесь на сайте `http://localhost:3000` — расширение автоматически синхронизирует сессию!

---

## 🧪 Тестирование и проверка качества

```bash
# Запуск полного набора юнит- и интеграционных тестов бэкенда (48 тестов)
pytest

# Проверка типизации и линтинга бэкенда
flake8 app tests desktop_client
mypy app/

# Проверка линтера и форматирования фронтенда
cd frontend
npm run lint
npm run format:check
npm run build
```

---

## 📄 Лицензия

Проект распространяется под условиями собственной лицензии. Подробнее см. в файле [LICENSE](LICENSE).
