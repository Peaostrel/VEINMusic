<div align="center">
  <h1>V E I N &nbsp; M U S I C &nbsp;</h1>
  
  [![Python](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
  [![Next.js](https://img.shields.io/badge/Frontend-Next.js-000000?style=flat&logo=next.js)](https://nextjs.org/)
  [![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
  [![Extension](https://img.shields.io/badge/Extension-Chrome-4285F4?style=flat&logo=google-chrome)]()
</div>

<br>

![VEIN Music Preview](preview.jpg)

Система сбора музыкальной статистики и скробблинга. Проект перехватывает воспроизведение треков в браузере и агрегирует их в едином пользовательском веб-профиле.

## ⚡ Реализованные функции

* **Универсальный скробблинг**: 
  - **Extension**: Браузерное расширение, поддерживающее перехват прослушиваний с **Яндекс Музыки**, **Spotify**, **VK Музыки**, **YouTube Music**, **Apple Music** и **SoundCloud**.
  - **Cloud Scrobbling**: Прямая интеграция с официальными API музыкальных платформ для фонового скробблинга (привязка аккаунтов).
* **Импорт истории**: Полная синхронизация истории прослушиваний из **Last.fm**.
* **Статистика и Уровни**:
  - Успешным прослушиванием (скробблом) считается прослушивание трека более чем на 85%.
  - За каждый скроббл начисляется 1 XP. Автоматическое повышение уровней и рангов (от Новичка до Легенды).
* **Достижения**: Автоматические и кастомные (ручные) ачивки за достижение определенных целей (например: прослушивание ночью, любимые жанры, количество скробблов).
* **Социальные функции**: Глобальный Leaderboard (рейтинг пользователей), система подписок, возможность ставить лайки и оставлять комментарии к скробблам друзей.
* **Профиль пользователя**: 
  - Динамический UI (Color Thief), подстраивающийся под цветовую палитру любимого трека/альбома.
  - Настройки приватности, кастомизация любимых треков и артистов.

## 🛠 Технологический стек

- **Backend**: FastAPI (Python), SQLAlchemy, PostgreSQL (через Docker), Pydantic v2, bcrypt
- **Frontend**: Next.js 14+ (React Server Components), Tailwind CSS, Framer Motion, Lucide React
- **Расширение**: Chrome Manifest V3 (нативный JavaScript)

## 📁 Структура проекта

- `frontend/` — Веб-интерфейс на Next.js.
- `music-extension/` — Исходный код браузерного расширения для скробблинга.
- `app/` — Исходный код бэкенда (маршрутизаторы, модели, бизнес-логика).
- `main.py` — Точка входа для запуска FastAPI сервера и фоновых Cloud-воркеров.
- `docker-compose.yml` — Конфигурация для быстрого запуска базы данных PostgreSQL.

## 🚀 Как запустить

1. **Клонирование репозитория:**
   ```bash
   git clone https://github.com/Peaostrel/VEINMusic.git
   cd VEINMusic
   ```

2. **Запуск базы данных (PostgreSQL):**
   Убедитесь, что у вас установлен Docker, и запустите БД:
   ```bash
   docker-compose up -d
   ```

3. **Запуск бэкенда (FastAPI):**
   Установите зависимости (если используете виртуальное окружение, активируйте его) и запустите сервер:
   ```bash
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```

4. **Запуск фронтенда (Next.js):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. **Установка расширения-скробблера:**
   - Откройте браузер на базе Chromium (Chrome, Edge, Яндекс Браузер, Brave и др.).
   - Перейдите в управление расширениями (`chrome://extensions/` или `edge://extensions/`).
   - Включите **Режим разработчика** (Developer mode).
   - Нажмите "Загрузить распакованное расширение" (Load unpacked) и выберите папку `music-extension`.
   
6. **Привязка расширения к профилю:**
   - Зарегистрируйтесь и авторизуйтесь на сайте VEIN Music (`http://localhost:3000`).
   - Расширение **автоматически** обнаружит вашу сессию через безопасные cookie-файлы (HttpOnly). Никаких ручных настроек не требуется — скробблинг начнется моментально при прослушивании музыки!
