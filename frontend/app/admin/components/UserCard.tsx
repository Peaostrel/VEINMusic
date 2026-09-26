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

const section = "bg-black/30 border border-white/5 rounded-xl p-4 space-y-2";
const sectionTitle = "text-[11px] font-mono text-gray-400 uppercase";

function Flag({ on, label }: Readonly<{ on: boolean; label: string }>) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-bold ${on ? "bg-emerald-950/60 text-emerald-300" : "bg-white/5 text-gray-400"}`}
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
}: Readonly<{
  username: string;
  achievements: Achievement[];
  onClose: () => void;
  onChanged: () => void;
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
        <div className="bg-[#141418] rounded-2xl p-8 text-sm text-gray-300">
          {error ? `❌ ${error}` : "Загрузка…"}
        </div>
      </Dialog>
    );
  }

  const { user, integration, stats } = data;
  const earned = new Set(data.achievements.map((a) => a.id));

  return (
    <Dialog label={`Пользователь @${username}`} onClose={onClose}>
      <div className="bg-[#141418] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-4 text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img
              src={
                user.avatar_url ||
                `https://api.dicebear.com/9.x/micah/svg?seed=${user.username}&backgroundColor=transparent`
              }
              alt=""
              className="w-14 h-14 rounded-xl object-cover bg-black"
            />
            <div className="min-w-0">
              <h2 className="text-lg font-black text-white truncate">
                @{user.username}{" "}
                <span className="text-gray-400 font-normal">
                  {user.display_name}
                </span>
              </h2>
              <div className="flex flex-wrap gap-1.5 mt-1 text-[10px] font-bold">
                <span className="px-2 py-0.5 rounded bg-white/5 text-gray-300 font-mono">
                  {user.role}
                </span>
                {user.is_banned && (
                  <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-400">
                    ЗАБЛОКИРОВАН
                  </span>
                )}
                {user.is_flagged && (
                  <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-400">
                    АНТИФРОД
                  </span>
                )}
                {integration.is_verified && (
                  <span className="px-2 py-0.5 rounded bg-blue-950/80 text-blue-300">
                    ВЕРИФИЦИРОВАН
                  </span>
                )}
                {user.is_private && (
                  <span className="px-2 py-0.5 rounded bg-white/5 text-gray-300">
                    ПРИВАТНЫЙ
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                ID {user.id} · регистрация: {formatDateTime(user.created_at)}
                {user.location && ` · ${user.location}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="p-2 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {user.antifraud_reason && (
          <p className="text-xs text-amber-300 bg-amber-950/30 rounded-lg p-2">
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
            <div key={label} className="bg-black/30 rounded-xl p-2">
              <div className="text-base font-black text-white">{value}</div>
              <div className="text-[10px] text-gray-400 uppercase">{label}</div>
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
            onSubmit={(e) => {
              e.preventDefault();
              act(
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className={section}>
            <div className={sectionTitle}>Интеграции и экспорт</div>
            <div className="flex flex-wrap gap-1.5">
              <Flag on={integration.spotify_linked} label="Spotify" />
              <Flag on={integration.yandex_linked} label="Яндекс" />
              <Flag on={data.export.lastfm} label="→ Last.fm" />
              <Flag on={data.export.listenbrainz} label="→ ListenBrainz" />
              <Flag on={data.export.librefm} label="→ Libre.fm" />
            </div>
            <p className="text-[11px] text-gray-400">
              Last.fm: {integration.lastfm_username || "—"} · синхронизация:{" "}
              {formatDateTime(integration.last_sync)} · push-подписок:{" "}
              {data.push_subscriptions}
            </p>
            {data.webhooks.map((w) => (
              <p key={w.id} className="text-[11px] text-gray-300 break-all">
                🔗 {w.url} {!w.is_active && "(выключен)"}
              </p>
            ))}
            {data.imports.map((j) => (
              <p key={j.id} className="text-[11px] text-gray-300">
                Импорт #{j.id} ({j.lastfm_username}): {j.status},{" "}
                {j.imported_tracks}/{j.total_tracks}
                {j.error && <span className="text-red-300"> — {j.error}</span>}
              </p>
            ))}
          </div>

          <div className={section}>
            <div className={sectionTitle}>API-ключи и устройства</div>
            {data.api_keys.length === 0 && (
              <p className="text-xs text-gray-400">Ключей нет</p>
            )}
            {data.api_keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div
                    className={`font-bold truncate ${k.is_active ? "text-white" : "text-gray-500 line-through"}`}
                  >
                    {k.name}{" "}
                    <span className="font-mono text-gray-400">{k.prefix}…</span>
                  </div>
                  <div className="text-[10px] text-gray-400">
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
                className="inline-flex items-center gap-1 bg-white/5 rounded-lg px-2 py-1 text-xs text-gray-200"
              >
                {a.icon} {a.name}
                <button
                  type="button"
                  aria-label={`Снять достижение ${a.name}`}
                  className="text-gray-400 hover:text-red-400"
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
            onSubmit={(e) => {
              e.preventDefault();
              act(
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
          <div className={sectionTitle}>Последние прослушивания</div>
          <table className="w-full text-left text-xs text-gray-300">
            <tbody className="divide-y divide-white/5">
              {data.recent_scrobbles.map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5 pr-3 font-mono text-gray-400 whitespace-nowrap">
                    {formatDateTime(s.played_at)}
                  </td>
                  <td className="py-1.5 pr-3">
                    {s.artist} — {s.title}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-gray-400">
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
            <p className="text-xs text-gray-400">Прослушиваний нет</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
