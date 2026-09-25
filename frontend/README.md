# VEIN Music Frontend

Веб-интерфейс системы музыкальной статистики VEIN Music.

## 🛠 Технологии

- **Next.js 16** (App Router)
- **React 19**, **TypeScript 6**
- **Tailwind CSS 4**
- **Framer Motion** (анимации)
- **Lucide React** (иконки)
- **Recharts** (графики статистики)
- **Playwright** (E2E-тесты)

## 🚀 Запуск

Для запуска отдельно от бэкенда:

```bash
npm install
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

Адрес API задаётся переменными окружения (по умолчанию `http://127.0.0.1:8000`):

- `NEXT_PUBLIC_API_URL` — адрес бэкенда, например `https://api.example.com`;
- `NEXT_PUBLIC_WS_URL` — хост для WebSocket, если он отличается от API.

## ✅ Проверки

```bash
npm run lint           # ESLint
npm run type-check     # TypeScript
npm run format:check   # Prettier
npm run build          # production-сборка
npm run test:e2e       # Playwright (нужен запущенный бэкенд)
```

## 📁 Структура

- `app/` — страницы и роутинг (App Router).
- `app/lib/` — общий API-клиент, типы ответов API, push-уведомления.
- `components/` — общие компоненты (графики, баннер объявлений, регистрация PWA).
- `utils/` — форматирование чисел и дат.
- `public/` — иконка, манифест PWA и Service Worker (`sw.js`).
- `e2e/` — сценарии Playwright.
