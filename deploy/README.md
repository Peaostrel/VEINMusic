# Деплой на VPS

Продакшен-стек для небольшого сервера (от 1 ГБ памяти): готовые образы из
GitHub Container Registry, Caddy с автоматическим HTTPS, наружу открыты
только порты 80 и 443.

| Файл | Что делает |
|---|---|
| `docker-compose.yml` | Caddy, Postgres, ежедневные бэкапы, Redis, API, воркер, фронтенд |
| `Caddyfile` | HTTPS-сертификаты и проксирование сайта и API (вместе с WebSocket) |
| `.env.example` | Настройки; `deploy.sh` создаёт из него `.env` и генерирует секреты |
| `setup-server.sh` | Разовая подготовка Ubuntu: обновления, swap, Docker, фаервол, fail2ban |
| `deploy.sh` | Первый запуск и обновления |
| `install-auto-update.sh` | Таймер автодеплоя: `auto-update.sh` раз в 5 минут |

Образы собирает workflow `.github/workflows/images.yml` при каждом пуше в
`VEIN`: `ghcr.io/peaostrel/veinmusic-backend` и
`ghcr.io/peaostrel/veinmusic-frontend` с тегами `latest` и SHA коммита.
Собирать фронтенд на самом сервере не нужно: `next build` не помещается в
1 ГБ памяти.

## Перед первым запуском

1. **DNS.** A-записи сайта и API (по умолчанию `music.vein.guru` и
   `api.music.vein.guru`) указывают на IP сервера. Caddy получит сертификаты,
   только когда записи уже работают.
2. **Адрес API в образе фронтенда.** Он вшивается при сборке. Для других
   доменов задайте переменные репозитория `PUBLIC_API_URL`
   (`https://api.example.com`) и `PUBLIC_WS_HOST` (`api.example.com`) в
   Settings → Secrets and variables → Actions → Variables и перезапустите
   workflow «Docker images».
3. **Доступ к образам.** После первой сборки откройте оба пакета в разделе
   Packages профиля и сделайте их публичными (Package settings → Change
   visibility → Public). Иначе на сервере нужен `docker login ghcr.io`
   с токеном, у которого есть право `read:packages`.

## Установка

Под root на сервере:

```sh
curl --proto "=https" -fsSL https://raw.githubusercontent.com/Peaostrel/VEINMusic/VEIN/deploy/setup-server.sh | bash

SITE_DOMAIN=music.vein.guru API_DOMAIN=api.music.vein.guru \
ACME_EMAIL=you@example.com /opt/veinmusic/deploy/deploy.sh
```

`setup-server.sh` можно запускать повторно. С `DISABLE_SSH_PASSWORD=1` он
отключает вход по паролю, но только если в `/root/.ssh/authorized_keys` уже
есть ключ.

Первый `deploy.sh` создаёт `deploy/.env` (права 600) с паролями базы и Redis,
`SECRET_KEY`, ключом шифрования токенов и ключами Web Push. Ключи Last.fm и
Spotify впишите в `.env` сами и запустите `deploy.sh` ещё раз.

Сделать себя администратором:

```sh
cd /opt/veinmusic/deploy
docker compose exec backend python -m app.cli set-role <логин> admin
```

## Автоматический деплой

Один раз на сервере:

```sh
/opt/veinmusic/deploy/install-auto-update.sh
```

Таймер systemd раз в 5 минут запускает `auto-update.sh`. Если в `VEIN`
появился новый коммит и GitHub Actions уже опубликовал его образы, скрипт
обновляет код, выкатывает именно эти образы (тег = SHA коммита) и удаляет
старые. Пока образы собираются, скрипт просто ждёт следующего запуска.
Упавший деплой повторяется до трёх раз, затем пропускается до следующего
коммита. Миграции базы API применяет сам при старте.

```sh
systemctl list-timers veinmusic-update.timer   # когда следующая проверка
journalctl -u veinmusic-update -n 50           # что было выкачено
systemctl disable --now veinmusic-update.timer # выключить
```

## Обновление вручную и откат

```sh
cd /opt/veinmusic && git pull && ./deploy/deploy.sh
```

Откатиться на рабочую версию: выключите таймер (иначе он вернёт свежую) и
запустите `IMAGE_TAG=<sha рабочего коммита> ./deploy/deploy.sh`.

## Бэкапы

`db-backup` раз в сутки делает дамп базы в том `db_backups` и хранит
`BACKUP_KEEP_DAYS` дней. Том лежит на том же диске, поэтому время от времени
копируйте дампы с сервера:

```sh
docker compose cp db-backup:/backups ./backups
```

Восстановление:

```sh
docker compose exec -T db-backup pg_restore --clean --if-exists \
  -d veinmusic /backups/<файл>.dump
```

## Переезд с другого сервера

1. На старом сервере: `pg_dump --format=custom -f veinmusic.dump <база>`,
   плюс каталог загрузок (`uploads`).
2. На новом: `deploy.sh`, затем
   `docker compose cp veinmusic.dump db-backup:/backups/` и `pg_restore`, как
   выше; загрузки — `docker compose cp uploads/. backend:/app/uploads/`.
3. Если на старом сервере был свой `SECRET_KEY` или `TOKEN_ENCRYPTION_KEY`,
   перенесите их в `.env`: иначе сохранённые токены Spotify и Last.fm не
   расшифруются и все сессии сбросятся.
4. Переключите DNS на новый IP.

## Память

В покое стек занимает около 250 МБ. У каждого контейнера есть лимит
(`mem_limit`), Postgres и Redis настроены под маленький сервер, логи
ограничены тремя файлами по 10 МБ. `setup-server.sh` добавляет 2 ГБ swap.
