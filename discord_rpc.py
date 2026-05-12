"""
VEIN Music Discord RPC
----------------------
Скрипт для интеграции текущего прослушивания в статус профиля Discord.
"""
from pypresence import Presence
import time
import requests
import os
from dotenv import load_dotenv

load_dotenv()

USERNAME = os.getenv("VEIN_USERNAME", "peaostrel")
CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", '1483530998435156146')
API_BASE = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")
FRONTEND_BASE = os.getenv("FRONTEND_URL", "http://localhost:3000")

RPC = Presence(CLIENT_ID)
connected = False

def connect_rpc():
    global connected
    try:
        RPC.connect()
        connected = True
        print(f"✅ Discord RPC Подключен! Отслеживаю: {USERNAME}")
    except Exception as e:
        connected = False
        print(f"❌ Не удалось подключиться к Discord (он запущен?): {e}")

connect_rpc()
last_track = None

while True:
    if not connected:
        time.sleep(10)
        connect_rpc()
        continue

    try:
        response = requests.get(f"{API_BASE}/api/current-track/{USERNAME}", timeout=10)
        if response.status_code != 200:
            print(f"⚠️ Ошибка API: {response.status_code}")
            time.sleep(10)
            continue
            
        res = response.json()
        
        if res.get("playing"):
            current = f"{res['title']} - {res['artist']}"
            if current != last_track:
                cover = res.get("cover_url") or "logo"
                lvl_text = f"LVL {res.get('level', 1)} | {res.get('rank', 'Турист')}"
                
                track_url = res.get("track_url") or f"{FRONTEND_BASE}/user/{USERNAME}"
                    
                RPC.update(
                    state=res['artist'],
                    details=res['title'],
                    large_image=cover,
                    large_text=lvl_text,
                    small_image="logo",
                    small_text="VEIN Music",
                    buttons=[
                        {"label": "Listen on VEIN", "url": track_url},
                        {"label": "View Profile", "url": f"{FRONTEND_BASE}/user/{USERNAME}"}
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
        print(f"⚠️ Ошибка RPC (вероятно, Discord закрыт): {e}")
        connected = False
        
    time.sleep(5)
