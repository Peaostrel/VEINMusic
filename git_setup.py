import os
import subprocess
import stat
import shutil

REPO_DIR = r"c:\Users\zavet\Desktop\VEIN\VEINMusic"
os.chdir(REPO_DIR)

def remove_readonly(func, path, excinfo):
    os.chmod(path, stat.S_IWRITE)
    func(path)

git_dir = os.path.join(REPO_DIR, ".git")
if os.path.exists(git_dir):
    shutil.rmtree(git_dir, onerror=remove_readonly)

subprocess.run(["git", "init"])
subprocess.run(["git", "config", "user.email", "peaostrel@example.com"])
subprocess.run(["git", "config", "user.name", "Peaostrel"])

descriptions = {
    ".gitignore": "Конфигурация исключений для Git и GitHub",
    "main.py": "Ядро бэкенда (FastAPI): API, база данных, логика скроблинга",
    "discord_rpc.py": "Discord RPC: Трансляция текущего трека и уровня в статус",
    "start.bat": "Главный лончер: Автоматический запуск бэкенда и фронтенда",
    "check_links.py": "Вспомогательная утилита для проверки ссылок",
    "copy_vk_logo.py": "Скрипт для копирования логотипов",
    "copy_vk_logo_listdir.py": "Скрипт для массового обновления логотипов VK",
    "db_count.py": "Утилита подсчета статистики базы данных",
    "direct_screenshot.bat": "Скрипт снятия скриншотов",
    "scan_colors.js": "Скрипт для сканирования и анализа цветов обложек",
    "screenshot.js": "Скрипт для генерации скриншотов",
    "search_main.py": "Утилита поисковой системы",
    "start_server.py": "Альтернативный скрипт запуска сервера бэкенда",
    "test_encode.bat": "Тестовый скрипт кодировки",
    "test_read.bat": "Тестовый скрипт чтения",
    "test_scrobble.py": "Инструмент для тестирования скроблинга",
    "test_single.py": "Тест одиночных запросов",
    "test_track_counting.py": "Тестирование алгоритма подсчета треков",
    "test_write_node.js": "Тест записи через Node.js",

    "music-extension/manifest.json": "Манифест браузерного расширения VEIN",
    "music-extension/background.js": "Фоновый скрипт: управление состоянием и API",
    "music-extension/content.js": "Контент-скрипт: интеграция на страницы стримингов",
    "music-extension/page_world.js": "Скрипт обхода защиты аудио (работает в контексте страницы)",
    "music-extension/popup.html": "Интерфейс всплывающего окна расширения",
    "music-extension/popup.js": "Логика всплывающего окна расширения",
    "music-extension/sync-key.js": "Скрипт синхронизации и управления токенами",
    "music-extension/yandex_catcher.js": "Перехватчик событий аудио (Яндекс Музыка)",
    
    "frontend/package.json": "Зависимости и скрипты фронтенда",
    "frontend/package-lock.json": "Фиксация версий зависимостей фронтенда",
    "frontend/README.md": "Общая документация фронтенда",
    "frontend/next.config.ts": "Конфигурация Next.js",
    "frontend/tsconfig.json": "Конфигурация TypeScript",
    "frontend/eslint.config.mjs": "Линтер: Конфигурация ESLint",
    "frontend/postcss.config.mjs": "Настройки PostCSS (Tailwind)",
    
    "frontend/app/layout.tsx": "Глобальный каркас (Navbar, Footer, шрифты)",
    "frontend/app/page.tsx": "Главная стартовая страница VEIN Music",
    "frontend/app/globals.css": "Глобальные стили (Tailwind CSS)",
    "frontend/app/favicon.ico": "Иконка веб-сайта",
    "frontend/app/Navbar.tsx": "Навигационная панель (шапка)",
    "frontend/app/Footer.tsx": "Подвал сайта",
    
    "frontend/app/about/page.tsx": "Страница: О проекте VEIN Music",
    "frontend/app/admin/page.tsx": "Страница: Панель администратора",
    "frontend/app/auth/page.tsx": "Страница: Авторизация и регистрация",
    "frontend/app/developers/page.tsx": "Страница: API для разработчиков",
    "frontend/app/leaderboard/page.tsx": "Страница: Глобальная таблица лидеров",
    "frontend/app/privacy/page.tsx": "Страница: Политика конфиденциальности",
    "frontend/app/settings/page.tsx": "Страница: Настройки профиля, локации и интеграций",
    "frontend/app/settings/utils.ts": "Утилиты: Вспомогательные функции для настроек",
    "frontend/app/terms/page.tsx": "Страница: Пользовательское соглашение",
    
    "frontend/app/user/[username]/page.tsx": "Страница: Профиль пользователя (статистика, жанры)",
    "frontend/app/user/[username]/achievements/page.tsx": "Страница: Все достижения пользователя",
}

def get_description(filepath):
    rel_path = os.path.relpath(filepath, REPO_DIR).replace("\\\\", "/")
    
    if rel_path in descriptions:
        return descriptions[rel_path]
    
    if rel_path.startswith("music-extension/icons/"):
        return f"Иконка расширения ({os.path.basename(rel_path)})"
    if rel_path.startswith("frontend/public/"):
        return f"Статический ресурс ({os.path.basename(rel_path)})"
    
    filename = os.path.basename(rel_path)
    if filename.endswith(".tsx") or filename.endswith(".ts"):
        return f"Фронтенд компонент ({filename})"
    if filename.endswith(".css"):
        return f"Стилевой файл ({filename})"
    if filename.endswith(".json"):
        return f"Конфигурация ({filename})"
    if filename.endswith(".py"):
        return f"Python-скрипт ({filename})"
    if filename.endswith(".js"):
        return f"JavaScript скрипт ({filename})"
    
    return f"Файл проекта ({filename})"

subprocess.run(["git", "add", "."], stdout=subprocess.DEVNULL)
result = subprocess.run(["git", "ls-files"], capture_output=True, text=True)
files = result.stdout.strip().split("\\n")
subprocess.run(["git", "reset"], stdout=subprocess.DEVNULL)

for file in files:
    if not file: continue
    desc = get_description(file)
    subprocess.run(["git", "add", file], stdout=subprocess.DEVNULL)
    subprocess.run(["git", "commit", "-m", desc], stdout=subprocess.DEVNULL)

subprocess.run(["git", "branch", "-M", "main"])
subprocess.run(["git", "remote", "add", "origin", "https://github.com/Peaostrel/VEINMusic.git"])
print("READY_TO_PUSH")
