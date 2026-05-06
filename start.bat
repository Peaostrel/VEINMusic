@echo off
title VEIN Music - Startup Script
echo Starting VEIN Music Ecosystem...

:: Start Backend
start "VEIN Backend" cmd /k "title VEIN Backend && uvicorn main:app --reload --port 8000"

:: Start Frontend
start "VEIN Frontend" cmd /k "title VEIN Frontend && cd frontend && npm run dev"

echo.
echo Servers are starting in separate windows.
echo Backend: http://127.0.0.1:8000
echo Frontend: http://localhost:3000
echo.
pause
