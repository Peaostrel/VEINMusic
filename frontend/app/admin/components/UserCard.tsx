"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Dialog from "@/components/Dialog";
import type { Achievement, UserDetails } from "../types";
import {
  Notice,
  adminRequest,
  buttonClass,
  formatDateTime,
  inputClass,
  labelClass,
  useAdminResource,
  useNotice,
} from "../ui";

const section = "bg-bg border border-line-soft rounded-xl p-4 space-y-2";
const sectionTitle = "text-[11px] font-mono text-fg-2";

const SHOWCASE_LABELS = { artist: "Артист", track: "Трек", album: "Альбом" };

function Showcase({
  items,
  act,
  post,
}: Readonly<{
  items: UserDetails["showcase"];
  act: (
    request: () => Promise<unknown>,
    success: string,
    confirmText?: string,
  ) => Promise<void>;
  post: (suffix: string, json?: unknown) => () => Promise<unknown>;
}>) {
  return (
    <div className={section}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={sectionTitle}>Витрина</div>
        <button
          type="button"
          className={buttonClass.secondary}
          onClick={() =>
            act(post("/showcase/refresh"), "Витрина обновлена по поиску")
          }
          title="Заново найти имена, картинки и ссылки; блокировки не меняются"
        >
          Обновить витрину
        </button>
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.field} className="flex items-center gap-3 text-xs">
            {i.cover ? (
              <img
                src={i.cover}
                alt=""
                className={`h-8 w-8 shrink-0 bg-surface-2 object-cover ${i.field === "artist" ? "rounded-full" : "rounded"}`}
              />
            ) : (
              <div className="h-8 w-8 shrink-0 rounded bg-surface-2" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-fg-3">
                {SHOWCASE_LABELS[i.field]}
              </div>
              <div className="truncate text-fg">{i.value || "—"}</div>
            </div>
            {i.locked_until ? (
              <button
                type="button"
                className={buttonClass.secondary}
                onClick={() =>
                  act(
                    post("/showcase/unlock", { field: i.field }),
                    "Блокировка снята",
                    `Снять блокировку поля «${SHOWCASE_LABELS[i.field]}»? Пользователь сможет сразу выбрать другое значение.`,
                  )
                }
                title={`Заблокировано до ${formatDateTime(i.locked_until)}`}
              >
                Снять блокировку
              </button>
            ) : (
              <span className="text-[10px] text-fg-3">можно менять</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Flag({ on, label }: Readonly<{ on: boolean; label: string }>) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-medium ${on ? "text-ok" : "bg-surface-2 text-fg-2"}`}
    >
      {label}: {on ? "да" : "нет"}
    </span>
  );
}

/** Everything about one account, with the moderation actions. */
export default function UserCard({
  username,
  achievements,
  onClose,
  onChanged,
  onOpenScrobbles,
}: Readonly<{
  username: string;
  achievements: Achievement[];
  onClose: () => void;
  onChanged: () => void;
  onOpenScrobbles?: (username: string) => void;
}>) {
  const path = `/api/admin/users/${encodeURIComponent(username)}`;
  const { data, error, reload } = useAdminResource<UserDetails>(
    `${path}/details`,
  );
  const { notice, run } = useNotice();
  const [level, setLevel] = useState("");
  const [grantId, setGrantId] = useState("");

  const act = async (
    request: () => Promise<unknown>,
    success: string,
    confirmText?: string,
  ) => {
    if (confirmText && !confirm(confirmText)) return;
    if (await run(request, success)) {
      reload();
      onChanged();
    }
  };
  const post = (suffix: string, json?: unknown) => () =>
    adminRequest(`${path}${suffix}`, { method: "POST", json });

  if (!data) {
    return (
      <Dialog label={`Пользователь @${username}`} onClose={onClose}>
        <div className="bg-surface rounded-xl p-8 text-sm text-fg-2">
          {error ? `❌ ${error}` : "Загрузка…"}
        </div>
      </Dialog>
    );
  }

  const { user, integration, stats } = data;
  const earned = new Set(data.achievements.map((a) => a.id));

  return (
    <Dialog label={`Пользователь @${username}`} onClose={onClose}>
      <div className="bg-surface border border-line rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-4 text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img
              src={
                user.avatar_url ||
                `https://api.dicebear.com/9.x/micah/svg?seed=${user.username}&backgroundColor=transparent`
              }
              alt=""
              className="w-14 h-14 rounded-xl object-cover bg-bg"
            />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-fg truncate">
                @{user.username}{" "}
                <span className="text-fg-2 font-normal">
                  {user.display_name}
                </span>
              </h2>
              <div className="flex flex-wrap gap-1.5 mt-1 text-[10px] font-medium">
                <span className="px-2 py-0.5 rounded bg-surface-2 text-fg-2 font-mono">
                  {user.role}
                </span>
                {user.is_banned && (
                  <span className="px-2 py-0.5 rounded text-danger">
                    ЗАБЛОКИРОВАН
                  </span>
                )}
                {user.is_flagged && (
                  <span className="px-2 py-0.5 rounded text-accent">
                    АНТИФРОД
                  </span>
                )}
                {integration.is_verified && (
                  <span className="px-2 py-0.5 rounded text-fg-2">
                    ВЕРИФИЦИРОВАН
                  </span>
                )}
                {user.is_private && (
                  <span className="px-2 py-0.5 rounded bg-surface-2 text-fg-2">
                    ПРИВАТНЫЙ
                  </span>
                )}
              </div>
              <p className="text-[11px] text-fg-2 mt-1">
                ID {user.id} · регистрация: {formatDateTime(user.created_at)}
                {user.location && ` · ${user.location}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="p-2 text-fg-2 hover:text-fg"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {user.antifraud_reason && (
          <p className="text-xs text-accent rounded-lg p-2">
            {user.antifraud_reason}
          </p>
        )}
        <Notice text={notice} />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[
            ["Скробблов", stats.scrobbles],
            ["Засчитано", stats.counted],
            ["XP за треки", stats.xp],
            ["Бонус XP", integration.bonus_xp],
            ["Подписчики", stats.followers],
            ["Подписки", stats.following],
            ["Комментарии", stats.comments],
            ["Серия дней", integration.current_streak],
          ].map(([label, value]) => (
            <div key={label} className="bg-bg rounded-xl p-2">
              <div className="text-base font-semibold text-fg">{value}</div>
              <div className="text-[10px] text-fg-2">{label}</div>
            </div>
          ))}
        </div>

        <div className={section}>
          <div className={sectionTitle}>Действия</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={
                user.is_banned ? buttonClass.secondary : buttonClass.danger
              }
              onClick={() =>
                act(
                  post("/ban", { is_banned: !user.is_banned }),
                  user.is_banned ? "Разблокирован" : "Заблокирован",
                )
              }
            >
              {user.is_banned ? "Разблокировать" : "Заблокировать"}
            </button>
            <button
              type="button"
              className={buttonClass.secondary}
              onClick={() =>
                act(
                  post("/verify", { is_verified: !integration.is_verified }),
                  "Верификация изменена",
                )
              }
            >
              {integration.is_verified ? "Снять верификацию" : "Верифицировать"}
            </button>
            <label className="flex items-center gap-1">
              <span className="sr-only">Роль</span>
              <select
                value={user.role}
                onChange={(e) =>
                  act(post("/role", { role: e.target.value }), "Роль изменена")
                }
                className={`${inputClass} w-auto`}
              >
                <option value="user">user</option>
                <option value="moderator">moderator</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <button
              type="button"
              className={buttonClass.secondary}
              onClick={() =>
                act(
                  post("/sessions/revoke"),
                  "Все сессии завершены",
                  "Выйти из аккаунта на всех устройствах?",
                )
              }
            >
              Завершить все сессии
            </button>
            <button
              type="button"
              className={buttonClass.secondary}
              onClick={() =>
                act(
                  post("/reset-profile"),
                  "Профиль очищен",
                  `Очистить аватар, обложку и описание @${user.username}?`,
                )
              }
            >
              Сбросить профиль
            </button>
            <button
              type="button"
              className={buttonClass.danger}
              onClick={() =>
                act(
                  () => adminRequest(`${path}/scrobbles`, { method: "DELETE" }),
                  "История удалена",
                  `Удалить ВСЮ историю прослушиваний @${user.username}?`,
                )
              }
            >
              Удалить историю
            </button>
            <button
              type="button"
              className={buttonClass.danger}
              onClick={() =>
                act(
                  () => adminRequest(path, { method: "DELETE" }).then(onClose),
                  "Аккаунт удалён",
                  `Навсегда удалить аккаунт @${user.username}?`,
                )
              }
            >
              Удалить аккаунт
            </button>
          </div>
          <form
            className="flex items-end gap-2 pt-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await act(
                post("/level", { new_level: Number(level) }),
                `Уровень ${level} установлен`,
              );
            }}
          >
            <label className="w-32">
              <span className={labelClass}>Уровень</span>
              <input
                type="number"
                min={1}
                max={10000}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className={inputClass}
                required
              />
            </label>
            <button type="submit" className={buttonClass.secondary}>
              Установить уровень
            </button>
          </form>
        </div>

        <Showcase items={data.showcase} act={act} post={post} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className={section}>
            <div className={sectionTitle}>Интеграции и экспорт</div>
            <div className="flex flex-wrap gap-1.5">
              <Flag on={integration.spotify_linked} label="Spotify" />
              <Flag on={integration.yandex_linked} label="Яндекс" />
              <Flag on={integration.soundcloud_linked} label="SoundCloud" />
              <Flag on={data.export.lastfm} label="→ Last.fm" />
              <Flag on={data.export.listenbrainz} label="→ ListenBrainz" />
              <Flag on={data.export.librefm} label="→ Libre.fm" />
            </div>
            <p className="text-[11px] text-fg-2">
              Last.fm: {integration.lastfm_username || "—"} · синхронизация:{" "}
              {formatDateTime(integration.last_sync)} · push-подписок:{" "}
              {data.push_subscriptions}
            </p>
            {data.webhooks.map((w) => (
              <p key={w.id} className="text-[11px] text-fg-2 break-all">
                {w.url} {!w.is_active && "(выключен)"}
              </p>
            ))}
            {data.imports.map((j) => (
              <p key={j.id} className="text-[11px] text-fg-2">
                Импорт #{j.id} ({j.lastfm_username}): {j.status},{" "}
                {j.imported_tracks}/{j.total_tracks}
                {j.error && <span className="text-danger"> — {j.error}</span>}
              </p>
            ))}
          </div>

          <div className={section}>
            <div className={sectionTitle}>API-ключи и устройства</div>
            {data.api_keys.length === 0 && (
              <p className="text-xs text-fg-2">Ключей нет</p>
            )}
            {data.api_keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div
                    className={`font-medium truncate ${k.is_active ? "text-fg" : "text-fg-3 line-through"}`}
                  >
                    {k.name}{" "}
                    <span className="font-mono text-fg-2">{k.prefix}…</span>
                  </div>
                  <div className="text-[10px] text-fg-2">
                    использован: {formatDateTime(k.last_used_at)}
                  </div>
                </div>
                {k.is_active && (
                  <button
                    type="button"
                    className={buttonClass.danger}
                    onClick={() =>
                      act(
                        post(`/api-keys/${k.id}/revoke`),
                        "Ключ отозван",
                        `Отозвать ключ «${k.name}»?`,
                      )
                    }
                  >
                    Отозвать
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={section}>
          <div className={sectionTitle}>
            Достижения ({data.achievements.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.achievements.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 bg-surface-2 rounded-lg px-2 py-1 text-xs text-fg"
              >
                {a.icon} {a.name}
                <button
                  type="button"
                  aria-label={`Снять достижение ${a.name}`}
                  className="text-fg-2 hover:text-danger"
                  onClick={() =>
                    act(
                      () =>
                        adminRequest(`${path}/achievements/${a.id}`, {
                          method: "DELETE",
                        }),
                      "Достижение снято",
                      `Снять «${a.name}»?`,
                    )
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await act(
                post("/achievements", { achievement_id: Number(grantId) }),
                "Достижение выдано",
              );
            }}
          >
            <label className="flex-1">
              <span className={labelClass}>Выдать достижение</span>
              <select
                value={grantId}
                onChange={(e) => setGrantId(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Выберите…</option>
                {achievements
                  .filter((a) => !earned.has(a.id))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.icon} {a.name} (+{a.reward_xp} XP)
                    </option>
                  ))}
              </select>
            </label>
            <button type="submit" className={buttonClass.secondary}>
              Выдать
            </button>
          </form>
        </div>

        <div className={section}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className={sectionTitle}>Последние прослушивания</div>
            {onOpenScrobbles && (
              <button
                type="button"
                className={buttonClass.secondary}
                onClick={() => onOpenScrobbles(username)}
              >
                Все прослушивания →
              </button>
            )}
          </div>
          <table className="w-full text-left text-xs text-fg-2">
            <tbody className="divide-y divide-white/5">
              {data.recent_scrobbles.map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5 pr-3 font-mono text-fg-2 whitespace-nowrap">
                    {formatDateTime(s.played_at)}
                  </td>
                  <td className="py-1.5 pr-3">
                    {s.artist} — {s.title}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-fg-2">
                    {s.source}
                  </td>
                  <td className="py-1.5 font-mono text-right whitespace-nowrap">
                    {s.listened_sec}/{s.duration || "?"} с · {s.xp} XP
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.recent_scrobbles.length === 0 && (
            <p className="text-xs text-fg-2">Прослушиваний нет</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
