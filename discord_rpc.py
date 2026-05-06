"""
VEIN Music Discord RPC
----------------------
Скрипт для интеграции текущего прослушивания в статус профиля Discord.
1. Получает данные о текущем треке через API бэкенда.
2. Обновляет "Rich Presence" статус (название, артист, обложка, уровень).
3. Добавляет кнопку перехода в профиль пользователя.
"""
from pypresence import Presence
import time
import requests

import os
from dotenv import load_dotenv

load_dotenv()

USERNAME = os.getenv("VEIN_USERNAME", "peaostrel") # Change this in .env or set environment variable
CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", '1483530998435156146')
API_BASE = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")
FRONTEND_BASE = os.getenv("FRONTEND_URL", "http://localhost:3000")

RPC = Presence(CLIENT_ID)
RPC.connect()
print(f"Discord RPC Подключен! Отслеживаю: {USERNAME}")

last_track = None

# Use system proxies by default unless overridden
proxies = None

while True:
    try:
        res = requests.get(f"{API_BASE}/api/current-track/{USERNAME}", proxies=proxies).json()
        
        if res.get("playing"):
            current = f"{res['title']} - {res['artist']}"
            if current != last_track:
                cover = res.get("cover_url")
                if not cover:
                    cover = "logo"
                
                lvl_text = f"LVL {res.get('level', 1)} | {res.get('rank', 'Турист')}"
                    
                RPC.update(
                    state=res['artist'],
                    details=res['title'],
                    large_image=cover,
                    large_text=lvl_text,
                    small_image="logo",
                    small_text="VEIN Music",
                    buttons=[
                        {"label": "View Profile", "url": f"{FRONTEND_BASE}/user/{USERNAME}"},
                        {"label": "Listen on VEIN", "url": f"{FRONTEND_BASE}/user/{USERNAME}"}
                    ]
                )
                last_track = current
                print(f"🎵 Транслирую: {current} [{lvl_text}]")
        else:
            if last_track is not None:
                RPC.clear()
                last_track = None
                print("⏸ Музыка на паузе, скрываю статус.")
    except requests.exceptions.RequestException as e:
        print(f"⚠️ Ошибка связи с API: {e}")
    except Exception as e:
        print(f"⚠️ Ошибка RPC: {e}")
        
    time.sleep(5)