"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { qualityRequest } from "@/app/lib/qualityApi";
import { btn, inputOnCard } from "@/components/ui";
import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";

interface Check {
  received: boolean;
  counted: boolean;
  message: string;
  last_event_at: string | null;
  track: { title: string; artist: string } | null;
}
const sources = [
  ["spotify", "Spotify"],
  ["yandex", msg("Яндекс Музыка")],
  ["youtube", "YouTube Music"],
  ["soundcloud", "SoundCloud"],
  ["plat", "Plat Music"],
  ["extension", msg("Другое через расширение")],
];

export default function ConnectionCheck({
  defaultSource = "spotify",
}: Readonly<{ defaultSource?: string }>) {
  const t = useT();
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
              ? t(cause.message)
              : t("Не удалось проверить подключение"),
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
  }, [source, started, t]);
  let progressMessage = t("Проверка ещё не запущена.");
  if (started)
    progressMessage = check?.message ? t(check.message) : t("Ожидаем музыку…");
  if (check?.received)
    progressMessage = t("Событие получено: {artist} — {title}", {
      artist: check.track?.artist ?? "",
      title: check.track?.title ?? "",
    });
  if (check?.counted) progressMessage = t("Готово! Прослушивание засчитано.");
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <h3 className="text-base font-semibold">
        {t("Проверим первое прослушивание")}
      </h3>
      <ol className="space-y-2 text-sm text-fg-2">
        <li>{t("1. Выберите источник и подключите его ниже.")}</li>
        <li>{t("2. Нажмите «Начать проверку» и включите трек.")}</li>
        <li>
          {t(
            "3. Дождитесь события в VEIN. Для зачёта нужно прослушать 85% трека.",
          )}
        </li>
      </ol>
      <div className="flex flex-wrap gap-3">
        <select
          aria-label={t("Источник для проверки")}
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
              {t(name)}
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
          {t("Начать проверку")}
        </button>
        {started && (
          <button
            type="button"
            className={`${btn.secondary} ${btn.sm}`}
            onClick={() => setStarted(null)}
          >
            {t("Остановить")}
          </button>
        )}
      </div>
      <output aria-live="polite" className="block text-sm">
        {error || progressMessage}
      </output>
      {check && !check.counted && (
        <p className="text-xs text-fg-3">{t(check.message)}</p>
      )}
      {check?.last_event_at && (
        <p className="text-xs text-fg-3">
          {t("Последнее событие: {time}", {
            time: new Date(check.last_event_at).toLocaleString(t.locale),
          })}
        </p>
      )}
      {check?.counted && (
        <Link className={`${btn.primary} ${btn.md}`} href="/library/search">
          {t("Посмотреть свою историю")}
        </Link>
      )}
      <p className="text-xs text-fg-3">
        {t(
          "Импорт Last.fm не подтверждает живое подключение. Для расширения проверьте разрешение на доступ к музыкальному сайту.",
        )}
      </p>
    </section>
  );
}
