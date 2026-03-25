:: VEIN Music Launcher
:: -------------------
:: Автоматический запуск полной инфраструктуры проекта:
:: 1. Backend (Uvicorn/FastAPI) в отдельном окне.
:: 2. Frontend (Next.js) в отдельном окне.
:: 3. Ожидание загрузки и открытие браузера на localhost:3000.

@echo off
chcp 65001 >nul
:: Жестко переходим в папку, где лежит сам start.bat
cd /d "%~dp0"
title VEIN Music Launcher

echo [1/3] Запускаем ядро (Python)...
start "VEIN Backend" cmd /k "python -m uvicorn main:app --reload"

echo [2/3] Запускаем фронтенд (Next.js)...
if exist "frontend" (
    start "VEIN Frontend" cmd /k "cd frontend && npm run dev"
) else (
    echo [ОШИБКА] Папка frontend не найдена рядом с start.bat!
    pause
    exit
)

echo [3/3] Прогреваем движки (5 сек)...
timeout /t 5 /nobreak >nul

echo Открываем браузер...
start "" "http://localhost:3000"

echo Запуск завершен. 
exit