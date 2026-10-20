"use client";
import { useEffect, useState } from "react";
import { apiJson } from "@/app/lib/api";
import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";
import { btn, input, label } from "@/components/ui";
type History = {
  configured: boolean;
  items: {
    id: string;
    username: string;
    kind: string;
    status: string;
    attempts: number;
    created_at: string;
    error_code: string | null;
  }[];
};
const statuses: Record<string, string> = {
  pending: msg("В очереди"),
  sent: msg("Передано Resend"),
  failed: msg("Ошибка"),
  cancelled: msg("Отменено"),
  expired: msg("Истекло"),
};
export default function EmailManager() {
  const t = useT();
  const [history, setHistory] = useState<History | null>(null);
  const [username, setUsername] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    setHistory(await apiJson<History>("/api/admin/email"));
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  async function send() {
    setBusy(true);
    try {
      const result = await apiJson<{ message: string }>("/api/admin/email", {
        method: "POST",
        json: { username, subject, text },
      });
      setMessage(t(result.message));
      setPreview(false);
      setText("");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("Ошибка сети"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <h3 className="font-semibold">{t("Письма пользователям")}</h3>
      <p className="text-sm text-fg-2">
        {history?.configured
          ? t(
              "Resend подключён. Письма доступны пользователям с подтверждённой почтой и включённым согласием.",
            )
          : t(
              "Resend пока не подключён: настройте отправителя и ключ сервиса.",
            )}
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPreview(true);
        }}
      >
        <label className={label}>
          <span>{t("Никнейм")}</span>
          <input
            className={`${input} mt-1`}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setPreview(false);
            }}
            required
            minLength={3}
            maxLength={64}
          />
        </label>
        <label className={label}>
          <span>{t("Тема")}</span>
          <input
            className={`${input} mt-1`}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setPreview(false);
            }}
            required
            maxLength={150}
          />
        </label>
        <label className={label}>
          <span>{t("Текст")}</span>
          <textarea
            className={`${input} mt-1 min-h-28`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(false);
            }}
            required
            maxLength={5000}
          />
        </label>
        <button type="submit" className={`${btn.secondary} ${btn.md}`}>
          {t("Предпросмотр")}
        </button>
      </form>
      {preview && (
        <div className="space-y-3 rounded-lg border border-line p-4">
          <p className="text-sm">{t("Получатель: {username}", { username })}</p>
          <h4 className="font-semibold">{subject}</h4>
          <p className="whitespace-pre-wrap text-sm">{text}</p>
          <p className="text-xs text-fg-2">
            {t("Внизу письма будет ссылка на настройки отключения писем.")}
          </p>
          <button
            type="button"
            className={`${btn.primary} ${btn.md}`}
            disabled={busy || !history?.configured}
            onClick={() => void send()}
          >
            {t("Отправить письмо")}
          </button>
        </div>
      )}
      {message && <output className="text-sm">{message}</output>}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{t("Последние отправки")}</h4>
        <button
          type="button"
          className={`${btn.secondary} ${btn.sm}`}
          onClick={() => void load().catch((e) => setMessage(e.message))}
        >
          {t("Обновить")}
        </button>
      </div>
      <ul className="space-y-2">
        {history?.items.map((row) => (
          <li key={row.id} className="text-sm">
            {row.username} ·{" "}
            {statuses[row.status] ? t(statuses[row.status]) : row.status} ·{" "}
            {new Date(row.created_at).toLocaleString(t.locale)}
            {row.error_code ? ` · ${row.error_code}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
