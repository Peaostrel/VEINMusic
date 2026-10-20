"use client";

import Link from "next/link";
import { useState } from "react";
import { API_URL, apiJson } from "@/app/lib/api";
import {
  historyBatches,
  MAX_TRANSFER_BATCHES,
  readHistoryFiles,
  sequentialMap,
} from "@/app/lib/historyTransfer";
import { btn, input, PageHeader } from "@/components/ui";
import { useT } from "@/app/lib/i18n/client";

interface Preview {
  new: number;
  duplicates: number;
  sample: { artist: string; title: string; played_at: string }[];
  preview_token: string;
}
interface Batch {
  rows: Record<string, unknown>[];
  preview: Preview;
}

export default function TransferPage() {
  const t = useT();
  const [files, setFiles] = useState<File[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const exportQuery = new URLSearchParams({
    ...(exportFrom ? { date_from: exportFrom } : {}),
    ...(exportTo ? { date_to: exportTo } : {}),
  }).toString();
  const preview = async () => {
    if (!files.length) return;
    setBusy(true);
    setBatches([]);
    setMessage(t("Читаем файлы…"));
    try {
      const rows = await readHistoryFiles(files, t);
      const chunks = historyBatches(rows);
      if (chunks.length > MAX_TRANSFER_BATCHES)
        throw new Error(
          t(
            "За один перенос помещается {max} частей, а здесь {count}. Выберите меньше файлов и перенесите остальное следующим заходом.",
            { max: MAX_TRANSFER_BATCHES, count: chunks.length },
          ),
        );
      let checked = 0;
      const results = await sequentialMap(
        chunks,
        async (chunk): Promise<Batch> => {
          const preview = await apiJson<Preview>(
            "/api/account/history/preview",
            { method: "POST", json: { scrobbles: chunk } },
          );
          checked += chunk.length;
          setMessage(
            t("Проверено {checked} из {total}", {
              checked,
              total: rows.length,
            }),
          );
          return { rows: chunk, preview };
        },
      );
      setBatches(results);
      setMessage(
        t(
          "Проверьте образец и подтвердите импорт. Предпросмотр действует 15 минут.",
        ),
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("Не удалось прочитать файл"),
      );
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    setBusy(true);
    let imported = 0;
    let duplicates = 0;
    let done = 0;
    try {
      await sequentialMap(batches, async (batch) => {
        const result = await apiJson<{ imported: number; duplicates: number }>(
          "/api/account/history/import",
          {
            method: "POST",
            json: {
              scrobbles: batch.rows,
              preview_token: batch.preview.preview_token,
            },
          },
        );
        imported += result.imported;
        duplicates += result.duplicates;
        done += 1;
        setMessage(
          t("Перенесено {imported}, пропущено дублей {duplicates}…", {
            imported,
            duplicates,
          }),
        );
      });
      setBatches([]);
      setMessage(
        t(
          "Импорт завершён: {imported} новых прослушиваний, {duplicates} дублей пропущено.",
          { imported, duplicates },
        ),
      );
    } catch (cause) {
      // Keep what is left, so a retry does not resend finished parts
      setBatches(batches.slice(done));
      setMessage(
        t(
          "Уже перенесено: {imported}. {error} Нажмите «Подтвердить импорт» ещё раз, чтобы продолжить, или проверьте файлы заново: уже добавленные записи будут пропущены.",
          {
            imported,
            error: cause instanceof Error ? cause.message : t("Ошибка импорта"),
          },
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-[800px] space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        title={t("Перенос истории")}
        subtitle={t(
          "Выгрузка и восстановление собственной музыкальной истории",
        )}
      />
      <Link href="/library" className="text-sm text-accent">
        {t("← Библиотека")}
      </Link>
      <section className="space-y-3 rounded-xl border border-line p-4">
        <h2 className="font-semibold">{t("Скачать данные")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span>{t("CSV с даты")}</span>
            <input
              className={input}
              type="date"
              value={exportFrom}
              onChange={(event) => setExportFrom(event.target.value)}
            />
          </label>
          <label>
            <span>{t("CSV по дату")}</span>
            <input
              className={input}
              type="date"
              value={exportTo}
              onChange={(event) => setExportTo(event.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            className={`${btn.secondary} ${btn.md}`}
            href={`${API_URL}/api/account/export`}
          >
            {t("Все данные JSON")}
          </a>
          <a
            className={`${btn.secondary} ${btn.md}`}
            href={`${API_URL}/api/account/history.csv?${exportQuery}`}
          >
            {t("История CSV")}
          </a>
        </div>
        <p className="text-xs text-fg-3">
          {t(
            "История передаётся потоком. Исключённые записи сохраняются с отметкой; удалённые записи не выгружаются. Для большой истории скачивайте CSV по месяцам или годам; JSON содержит весь аккаунт.",
          )}
        </p>
      </section>
      <section className="space-y-4 rounded-xl border border-line p-4">
        <h2 className="font-semibold">{t("Импортировать историю")}</h2>
        <p className="text-sm text-fg-2">
          {t(
            "Подходят выгрузка VEIN (JSON или CSV), архив Spotify и экспорт ListenBrainz. Можно выбрать сразу несколько файлов или ZIP целиком, до 100 000 прослушиваний за один перенос. Повторы пропускаются, XP и награды за импорт не начисляются.",
          )}
        </p>
        <details className="text-sm text-fg-2">
          <summary className="cursor-pointer text-fg">
            {t("Где взять историю Spotify и ListenBrainz")}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              {t("Spotify: в")}{" "}
              <a
                className="text-accent"
                href="https://www.spotify.com/account/privacy/"
                target="_blank"
                rel="noreferrer"
              >
                {t("настройках приватности")}
              </a>{" "}
              {t(
                "запросите «Extended streaming history». Архив придёт на почту через несколько дней; загрузите его сюда без распаковки. Прослушивания короче 30 секунд, подкасты и видео не переносятся.",
              )}
            </li>
            <li>
              {t("ListenBrainz: на")}{" "}
              <a
                className="text-accent"
                href="https://listenbrainz.org/settings/export/"
                target="_blank"
                rel="noreferrer"
              >
                {t("странице экспорта")}
              </a>{" "}
              {t("скачайте архив прослушиваний и загрузите его сюда.")}
            </li>
            <li>
              {t(
                "Last.fm переносится отдельно, через подключение в настройках.",
              )}
            </li>
          </ul>
        </details>
        <label className="block">
          <span>{t("Файлы истории")}</span>
          <input
            type="file"
            multiple
            accept=".json,.jsonl,.csv,.zip,application/json,text/csv,application/zip"
            disabled={busy}
            className={`${input} mt-2 h-auto py-3`}
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []));
              setBatches([]);
              setMessage("");
            }}
          />
        </label>
        <button
          disabled={!files.length || busy}
          className={`${btn.secondary} ${btn.md}`}
          onClick={() => {
            void preview();
          }}
        >
          {t("Проверить файлы")}
        </button>
        {!!batches.length && (
          <div className="space-y-3">
            <p>
              {t("Новых: {n}. Дублей: {d}.", {
                n: batches.reduce((sum, batch) => sum + batch.preview.new, 0),
                d: batches.reduce(
                  (sum, batch) => sum + batch.preview.duplicates,
                  0,
                ),
              })}
            </p>
            <ul className="space-y-2 text-sm">
              {batches[0].preview.sample.map((row, index) => (
                <li className="break-words" key={`${row.played_at}-${index}`}>
                  {row.artist} — {row.title} ·{" "}
                  {new Date(row.played_at).toLocaleString(t.locale)}
                </li>
              ))}
            </ul>
            <button
              disabled={busy}
              className={`${btn.primary} ${btn.md}`}
              onClick={() => {
                void apply();
              }}
            >
              {t("Подтвердить импорт")}
            </button>
          </div>
        )}
      </section>
      <output className="block text-sm" aria-live="polite">
        {message}
      </output>
    </main>
  );
}
