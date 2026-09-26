"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL, ApiError, apiJson } from "@/app/lib/api";
import type {
  CreatedWebhook,
  ExportConfig,
  WebhookInfo,
} from "@/app/lib/types";

const card =
  "bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-4";
const buttonBase =
  "px-4 py-2.5 rounded-lg font-bold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed";
const input =
  "flex-grow bg-black/50 border border-white/10 p-2.5 rounded-lg text-sm text-white outline-none focus:border-[var(--accent)]";

const WEBHOOK_EVENTS = [
  { id: "scrobble.created", label: "Новое прослушивание" },
  { id: "achievement.unlocked", label: "Новое достижение" },
];

const EMPTY_CONFIG: ExportConfig = {
  is_lastfm_enabled: false,
  is_listenbrainz_enabled: false,
  is_librefm_enabled: false,
  has_lastfm_session: false,
  has_listenbrainz_token: false,
  has_librefm_session: false,
};

function errorText(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message;
  return "Ошибка сети";
}

interface ServiceRowProps {
  title: string;
  description: string;
  connected: boolean;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onDisconnect: () => void;
  children?: React.ReactNode;
}

function ServiceRow({
  title,
  description,
  connected,
  enabled,
  onToggle,
  onDisconnect,
  children,
}: Readonly<ServiceRowProps>) {
  const toggleId = `export-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="bg-black/30 border border-white/5 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">{title}</p>
          <p className="text-xs text-gray-400">{description}</p>
        </div>
        <span
          className={`text-xs font-bold shrink-0 ${connected ? "text-green-400" : "text-gray-400"}`}
        >
          {connected ? "Подключено" : "Не подключено"}
        </span>
      </div>
      {connected ? (
        <div className="flex flex-wrap items-center gap-4">
          <label
            htmlFor={toggleId}
            className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer"
          >
            <input
              id={toggleId}
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            Отправлять прослушивания
          </label>
          <button
            type="button"
            onClick={onDisconnect}
            className={`${buttonBase} bg-red-900/20 text-red-400 border border-red-900/30`}
          >
            Отключить
          </button>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/** Scrobble export to Last.fm / ListenBrainz / Libre.fm and outgoing webhooks. */
export default function ExportTab({
  initialStatus = "",
}: Readonly<{ initialStatus?: string }>) {
  const [message, setMessage] = useState(initialStatus);
  const [config, setConfig] = useState<ExportConfig>(EMPTY_CONFIG);
  const [listenbrainzToken, setListenbrainzToken] = useState("");
  const [librefmKey, setLibrefmKey] = useState("");
  const [webhooks, setWebhooks] = useState<WebhookInfo[]>([]);
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<string[]>(
    WEBHOOK_EVENTS.map((e) => e.id),
  );
  const [newSecret, setNewSecret] = useState<CreatedWebhook | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cfg, hooks] = await Promise.all([
        apiJson<ExportConfig>("/api/developer/export/config"),
        apiJson<WebhookInfo[]>("/api/developer/webhooks"),
      ]);
      setConfig(cfg);
      setWebhooks(hooks);
    } catch (e) {
      setMessage(`❌ ${errorText(e)}`);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const saveConfig = async (patch: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      await apiJson("/api/developer/export/config", {
        method: "POST",
        json: patch,
      });
      setMessage(`✅ ${ok}`);
      await load();
    } catch (e) {
      setMessage(`❌ ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const createWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hookUrl.trim() || hookEvents.length === 0) return;
    setBusy(true);
    try {
      const created = await apiJson<CreatedWebhook>("/api/developer/webhooks", {
        method: "POST",
        json: { url: hookUrl.trim(), events: hookEvents.join(",") },
      });
      setNewSecret(created);
      setHookUrl("");
      setMessage("✅ Вебхук создан");
      await load();
    } catch (err) {
      setMessage(`❌ ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const testWebhook = async (id: number) => {
    try {
      const res = await apiJson<{ message: string }>(
        `/api/developer/webhooks/${id}/test`,
        { method: "POST" },
      );
      setMessage(`✅ ${res.message}`);
    } catch (e) {
      setMessage(`❌ ${errorText(e)}`);
    }
  };

  const deleteWebhook = async (id: number) => {
    if (!confirm("Удалить вебхук?")) return;
    try {
      await apiJson(`/api/developer/webhooks/${id}`, { method: "DELETE" });
      setMessage("✅ Вебхук удалён");
      await load();
    } catch (e) {
      setMessage(`❌ ${errorText(e)}`);
    }
  };

  const toggleEvent = (id: string, checked: boolean) =>
    setHookEvents((prev) =>
      checked ? [...prev, id] : prev.filter((ev) => ev !== id),
    );

  return (
    <div className="p-6 md:p-8 space-y-6">
      <h2 className="text-xl font-bold text-[var(--accent-text)]">
        Экспорт и вебхуки
      </h2>
      {message && (
        <p
          className="text-sm font-bold text-[var(--accent-text)]"
          role="status"
        >
          {message}
        </p>
      )}

      <section className={card} aria-labelledby="export-heading">
        <div>
          <h3 id="export-heading" className="font-bold text-white">
            Экспорт прослушиваний
          </h3>
          <p className="text-xs text-gray-400">
            Каждое засчитанное прослушивание будет дополнительно отправляться в
            выбранные сервисы.
          </p>
        </div>

        <ServiceRow
          title="Last.fm"
          description="Вход через сайт Last.fm, пароль не передаётся VEIN."
          connected={config.has_lastfm_session}
          enabled={config.is_lastfm_enabled}
          onToggle={(v) =>
            saveConfig({ is_lastfm_enabled: v }, "Настройки Last.fm сохранены")
          }
          onDisconnect={() =>
            saveConfig(
              { lastfm_session_key: "", is_lastfm_enabled: false },
              "Last.fm отключён",
            )
          }
        >
          <a
            href={`${API_URL}/api/integrations/lastfm/connect`}
            className={`${buttonBase} self-start bg-[#D51007] text-white hover:opacity-90`}
          >
            Подключить Last.fm
          </a>
        </ServiceRow>

        <ServiceRow
          title="ListenBrainz"
          description="Нужен токен со страницы listenbrainz.org/settings."
          connected={config.has_listenbrainz_token}
          enabled={config.is_listenbrainz_enabled}
          onToggle={(v) =>
            saveConfig(
              { is_listenbrainz_enabled: v },
              "Настройки ListenBrainz сохранены",
            )
          }
          onDisconnect={() =>
            saveConfig(
              { listenbrainz_token: "", is_listenbrainz_enabled: false },
              "ListenBrainz отключён",
            )
          }
        >
          <form
            className="flex flex-col sm:flex-row gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!listenbrainzToken.trim()) return;
              saveConfig(
                {
                  listenbrainz_token: listenbrainzToken.trim(),
                  is_listenbrainz_enabled: true,
                },
                "ListenBrainz подключён",
              );
              setListenbrainzToken("");
            }}
          >
            <input
              type="password"
              value={listenbrainzToken}
              onChange={(e) => setListenbrainzToken(e.target.value)}
              placeholder="Токен ListenBrainz"
              aria-label="Токен ListenBrainz"
              autoComplete="off"
              className={input}
            />
            <button
              type="submit"
              disabled={busy || !listenbrainzToken.trim()}
              aria-label="Подключить ListenBrainz"
              className={`${buttonBase} bg-[var(--accent)] text-[var(--text-on-accent)]`}
            >
              Подключить
            </button>
          </form>
        </ServiceRow>

        <ServiceRow
          title="Libre.fm"
          description="Для опытных пользователей: ключ сессии Libre.fm (GNU FM)."
          connected={config.has_librefm_session}
          enabled={config.is_librefm_enabled}
          onToggle={(v) =>
            saveConfig(
              { is_librefm_enabled: v },
              "Настройки Libre.fm сохранены",
            )
          }
          onDisconnect={() =>
            saveConfig(
              { librefm_session_key: "", is_librefm_enabled: false },
              "Libre.fm отключён",
            )
          }
        >
          <form
            className="flex flex-col sm:flex-row gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!librefmKey.trim()) return;
              saveConfig(
                {
                  librefm_session_key: librefmKey.trim(),
                  is_librefm_enabled: true,
                },
                "Libre.fm подключён",
              );
              setLibrefmKey("");
            }}
          >
            <input
              type="password"
              value={librefmKey}
              onChange={(e) => setLibrefmKey(e.target.value)}
              placeholder="Ключ сессии Libre.fm"
              aria-label="Ключ сессии Libre.fm"
              autoComplete="off"
              className={input}
            />
            <button
              type="submit"
              disabled={busy || !librefmKey.trim()}
              aria-label="Подключить Libre.fm"
              className={`${buttonBase} bg-[var(--accent)] text-[var(--text-on-accent)]`}
            >
              Подключить
            </button>
          </form>
        </ServiceRow>
      </section>

      <section className={card} aria-labelledby="webhooks-heading">
        <div>
          <h3 id="webhooks-heading" className="font-bold text-white">
            Вебхуки
          </h3>
          <p className="text-xs text-gray-400">
            VEIN отправит POST-запрос на ваш адрес при каждом событии. Запросы
            подписаны заголовком <code>X-VEIN-Signature</code> (HMAC-SHA256
            секретом вебхука). До 10 вебхуков.
          </p>
        </div>

        {newSecret && (
          <div
            className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-xs text-yellow-200 break-all"
            role="alert"
          >
            Секрет для проверки подписи (показывается один раз):{" "}
            <code className="font-bold">{newSecret.secret}</code>
          </div>
        )}

        {webhooks.length === 0 ? (
          <p className="text-xs text-gray-400">Вебхуков пока нет.</p>
        ) : (
          <ul className="space-y-2">
            {webhooks.map((w) => (
              <li
                key={w.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/30 border border-white/5 rounded-lg p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white font-bold truncate">
                    {w.url}
                  </p>
                  <p className="text-xs text-gray-400">
                    {w.events.filter(Boolean).join(", ") || "все события"}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => testWebhook(w.id)}
                    className={`${buttonBase} bg-white/5 border border-white/10 text-white hover:bg-white/10`}
                  >
                    Проверить
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteWebhook(w.id)}
                    className={`${buttonBase} bg-red-900/20 text-red-400 border border-red-900/30`}
                  >
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={createWebhook} className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              value={hookUrl}
              onChange={(e) => setHookUrl(e.target.value)}
              placeholder="https://example.com/vein-webhook"
              aria-label="Адрес вебхука"
              className={input}
            />
            <button
              type="submit"
              disabled={busy || !hookUrl.trim() || hookEvents.length === 0}
              className={`${buttonBase} bg-[var(--accent)] text-[var(--text-on-accent)]`}
            >
              Добавить вебхук
            </button>
          </div>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">События вебхука</legend>
            {WEBHOOK_EVENTS.map((ev) => (
              <label
                key={ev.id}
                className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={hookEvents.includes(ev.id)}
                  onChange={(e) => toggleEvent(ev.id, e.target.checked)}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
                {ev.label}
              </label>
            ))}
          </fieldset>
        </form>
      </section>
    </div>
  );
}
