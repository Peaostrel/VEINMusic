import secrets
import hashlib
from desktop_client.config import load_config, save_config

SECRET_KEY = "super-secret-vein-key-change-it-in-production"
plain_key = secrets.token_hex(32)
dk = hashlib.pbkdf2_hmac('sha256', plain_key.encode('utf-8'), SECRET_KEY.encode(), 100000)
hashed_key = dk.hex()

print("Plain API Key:", plain_key)
print("Hashed API Key:", hashed_key)

# Configure desktop_client
cfg = load_config()
cfg["api_url"] = "http://localhost:8000"
cfg["api_key"] = plain_key
cfg["username"] = "peaostrel"
cfg["discord_rpc_enabled"] = True
save_config(cfg)
print("Config saved to ~/.veinmusic/config.json!")

import urllib.request
import json
# Update database in postgres
import subprocess
subprocess.run([
    "docker", "compose", "exec", "-T", "db", "psql", "-U", "postgres", "-d", "veinmusic",
    "-c", f"UPDATE users SET api_key = '{hashed_key}' WHERE username = 'peaostrel';"
])
print("Updated database for peaostrel!")
