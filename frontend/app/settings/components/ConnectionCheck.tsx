"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { qualityRequest } from "@/app/lib/qualityApi";
import { btn, inputOnCard } from "@/components/ui";

interface Check {
  received: boolean;
  counted: boolean;
  message: string;
  last_event_at: string | null;
  track: { title: string; artist: string } | null;
}
const sources = [
  ["spotify", "Spotify"],
  ["yandex", "Яндекс Музыка"],
  ["youtube", "YouTube Music"],
  ["soundcloud", "SoundCloud"],
  ["plat", "Plat Music"],
  ["extension", "Другое через расширение"],
];

export default function ConnectionCheck({
  defaultSource = "spotify",
}: Readonly<{ defaultSource?: string }>) {
  const [source, setSource] = useState(defaultSource);
  const [started, setStarted] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState("");
  const finished = useRef(false);
  useEffect(() => {
    if (!started) return;
    let active = true;
    let busy = false;
    const poll = async () => {
      if (busy || finished.current || document.hidden) return;
      busy = true;
      try {
        const result = await qualityRequest<Check>(
          `/api/me/connection-check?source=${source}&since=${encodeURIComponent(started)}`,
        );
        if (active) {
          setCheck(result);
          setError("");
          finished.current = result.counted;
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Не удалось проверить подключение",
          );
      } finally {
        busy = false;
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [source, started]);
  let progressMessage = "Проверка ещё не запущена.";
  if (started) progressMessage = check?.message || "Ожидаем музыку…";
  if (check?.received)
    progressMessage = `Событие получено: ${check.track?.artist} — ${check.track?.title}`;
  if (check?.counted) progressMessage = "Готово! Прослушивание засчитано.";
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <h3 className="text-base font-semibold">Проверим первое прослушивание</h3>
      <ol className="space-y-2 text-sm text-fg-2">
        <li>1. Выберите источник и подключите его ниже.</li>
        <li>2. Нажмите «Начать проверку» и включите трек.</li>
        <li>
          3. Дождитесь события в VEIN. Для зачёта нужно прослушать 85% трека.
        </li>
      </ol>
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Источник для проверки"
          className={inputOnCard}
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            setStarted(null);
            setCheck(null);
            finished.current = false;
          }}
        >
          {sources.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${btn.primary} ${btn.sm}`}
          onClick={() => {
            setCheck(null);
            finished.current = false;
            setStarted(new Date().toISOString());
          }}
        >
          Начать проверку
        </button>
        {started && (
          <button
            type="button"
            className={`${btn.secondary} ${btn.sm}`}
            onClick={() => setStarted(null)}
          >
            Остановить
          </button>
        )}
      </div>
      <output aria-live="polite" className="block text-sm">
        {error || progressMessage}
      </output>
      {check && !check.counted && (
        <p className="text-xs text-fg-3">{check.message}</p>
      )}
      {check?.last_event_at && (
        <p className="text-xs text-fg-3">
          Последнее событие:{" "}
          {new Date(check.last_event_at).toLocaleString("ru-RU")}
        </p>
      )}
      {check?.counted && (
        <Link className={`${btn.primary} ${btn.md}`} href="/library/search">
          Посмотреть свою историю
        </Link>
      )}
      <p className="text-xs text-fg-3">
        Импорт Last.fm не подтверждает живое подключение. Для расширения
        проверьте разрешение на доступ к музыкальному сайту.
      </p>
    </section>
  );
}
