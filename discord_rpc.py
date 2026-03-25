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

USERNAME = "peaostrel" 
CLIENT_ID = '1483530998435156146' # НЕ ЗАБУДЬ ВСТАВИТЬ СВОЙ ID!

RPC = Presence(CLIENT_ID)
RPC.connect()
print("Discord RPC Подключен!")

last_track = None

proxies = {
  "http": None,
  "https": None,
}

while True:
    try:
        res = requests.get(f"http://127.0.0.1:8000/api/current-track/{USERNAME}", proxies=proxies).json()
        
        if res.get("playing"):
            current = f"{res['title']} - {res['artist']}"
            if current != last_track:
                cover = res.get("cover_url")
                if not cover:
                    cover = "logo"
                
                # Добавили вывод уровня и ранга!    
                lvl_text = f"LVL {res.get('level', 1)} | {res.get('rank', 'Турист')}"
                    
                RPC.update(
                    state=res['artist'],
                    details=res['title'],
                    large_image=cover,
                    large_text=lvl_text,
                    small_image="logo",
                    small_text="VEIN Music",
                    buttons=[{"label": "Мой профиль", "url": f"http://localhost:3000/user/{USERNAME}"}]
                )
                last_track = current
                print(f"🎵 Транслирую: {current} [{lvl_text}]")
        else:
            if last_track is not None:
                RPC.clear()
                last_track = None
                print("⏸ Музыка на паузе, скрываю статус.")
    except Exception:
        pass
        
    time.sleep(5)