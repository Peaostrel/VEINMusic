"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import {
  Notice,
  PanelTitle,
  adminRequest,
  buttonClass,
  inputClass,
  labelClass,
  panelClass,
  useNotice,
} from "../ui";

interface BroadcastResult {
  recipients: number;
  inapp: number;
  push_queued: boolean;
}

/** In-app and/or Web Push announcement to everyone or to listed users. */
export default function BroadcastPanel() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("/");
  const [inapp, setInapp] = useState(true);
  const [push, setPush] = useState(false);
  const [usernames, setUsernames] = useState("");
  const { notice, setNotice, run } = useNotice();

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const channels = [inapp && "inapp", push && "push"].filter(Boolean);
    if (channels.length === 0)
      return setNotice("❌ Выберите хотя бы один канал");
    const names = usernames
      .split(/[\s,]+/)
      .map((n) => n.replace(/^@/, "").trim())
      .filter(Boolean);
    const audience =
      names.length > 0 ? `${names.length} пользователям` : "ВСЕМ пользователям";
    if (!confirm(`Отправить сообщение ${audience}?`)) return;
    let result: BroadcastResult | null = null;
    await run(async () => {
      result = await adminRequest<BroadcastResult>("/api/admin/broadcast", {
        method: "POST",
        json: {
          title,
          message,
          url,
          channels,
          usernames: names.length > 0 ? names : null,
        },
      });
    }, "Отправлено");
    if (result) {
      const r: BroadcastResult = result;
      let text = `✅ Получателей: ${r.recipients}; в уведомлениях: ${r.inapp}`;
      if (push) {
        const pushState = r.push_queued
          ? "поставлен в очередь"
          : "не отправлен";
        text += `; push ${pushState}`;
      }
      setNotice(text);
      setMessage("");
    }
  };

  return (
    <form
      onSubmit={send}
      className={panelClass}
      aria-labelledby="broadcast-heading"
    >
      <PanelTitle
        icon={<Send className="w-4 h-4 text-red-500" aria-hidden="true" />}
      >
        <span id="broadcast-heading">Рассылка уведомлений</span>
      </PanelTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label>
          <span className={labelClass}>Заголовок</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className={inputClass}
          />
        </label>
        <label>
          <span className={labelClass}>Ссылка на сайте (для push)</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            pattern="/.*"
            title="Путь на сайте, начинается с /"
            maxLength={200}
            className={inputClass}
          />
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>Текст ({message.length}/200)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={200}
            required
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>
            Кому (ники через запятую; пусто — всем)
          </span>
          <input
            value={usernames}
            onChange={(e) => setUsernames(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-4 text-xs text-gray-200">
        <legend className="sr-only">Каналы</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={inapp}
            onChange={(e) => setInapp(e.target.checked)}
          />
          <span>В колокольчике на сайте</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={push}
            onChange={(e) => setPush(e.target.checked)}
          />
          <span>Web Push</span>
        </label>
      </fieldset>
      <Notice text={notice} />
      <button type="submit" className={buttonClass.primary}>
        Отправить
      </button>
    </form>
  );
}
