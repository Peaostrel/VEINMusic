"use client";

import Link from "next/link";
import { useState } from "react";
import { API_URL, apiJson } from "@/app/lib/api";
import {
  historyBatches,
  readHistoryFiles,
  sequentialMap,
} from "@/app/lib/historyTransfer";
import { btn, input, PageHeader } from "@/components/ui";

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
    setMessage("Читаем файлы…");
    try {
      const rows = await readHistoryFiles(files);
      const chunks = historyBatches(rows);
      let checked = 0;
      const results = await sequentialMap(
        chunks,
        async (chunk): Promise<Batch> => {
          const preview = await apiJson<Preview>(
            "/api/account/history/preview",
            { method: "POST", json: { scrobbles: chunk } },
          );
          checked += chunk.length;
          setMessage(`Проверено ${checked} из ${rows.length}`);
          return { rows: chunk, preview };
        },
      );
      setBatches(results);
      setMessage(
        "Проверьте образец и подтвердите импорт. Предпросмотр действует 15 минут.",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Не удалось прочитать файл",
      );
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    setBusy(true);
    let imported = 0;
    let duplicates = 0;
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
        setMessage(`Перенесено ${imported}, пропущено дублей ${duplicates}…`);
      });
      setBatches([]);
      setMessage(
        `Импорт завершён: ${imported} новых прослушиваний, ${duplicates} дублей пропущено.`,
      );
    } catch (cause) {
      setBatches([]);
      setMessage(
        `Уже перенесено: ${imported}. ${cause instanceof Error ? cause.message : "Ошибка импорта"} Проверьте файл и повторите: уже добавленные записи будут пропущены.`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-[800px] space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        title="Перенос истории"
        subtitle="Выгрузка и восстановление собственной музыкальной истории"
      />
      <Link href="/library" className="text-sm text-accent">
        ← Библиотека
      </Link>
      <section className="space-y-3 rounded-xl border border-line p-4">
        <h2 className="font-semibold">Скачать данные</h2>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span>CSV с даты</span>
            <input
              className={input}
              type="date"
              value={exportFrom}
              onChange={(event) => setExportFrom(event.target.value)}
            />
          </label>
          <label>
            <span>CSV по дату</span>
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
            Все данные JSON
          </a>
          <a
            className={`${btn.secondary} ${btn.md}`}
            href={`${API_URL}/api/account/history.csv?${exportQuery}`}
          >
            История CSV
          </a>
        </div>
        <p className="text-xs text-fg-3">
          История передаётся потоком. Исключённые записи сохраняются с отметкой;
          удалённые записи не выгружаются. Для большой истории скачивайте CSV по
          месяцам или годам; JSON содержит весь аккаунт.
        </p>
      </section>
      <section className="space-y-4 rounded-xl border border-line p-4">
        <h2 className="font-semibold">Импортировать историю</h2>
        <p className="text-sm text-fg-2">
          Подходят выгрузка VEIN (JSON или CSV), архив Spotify и экспорт
          ListenBrainz. Можно выбрать сразу несколько файлов или ZIP целиком, до
          100 000 прослушиваний за один перенос. Повторы пропускаются, XP и
          награды за импорт не начисляются.
        </p>
        <details className="text-sm text-fg-2">
          <summary className="cursor-pointer text-fg">
            Где взять историю Spotify и ListenBrainz
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Spotify: в{" "}
              <a
                className="text-accent"
                href="https://www.spotify.com/account/privacy/"
                target="_blank"
                rel="noreferrer"
              >
                настройках приватности
              </a>{" "}
              запросите «Extended streaming history». Архив придёт на почту
              через несколько дней; загрузите его сюда без распаковки.
              Прослушивания короче 30 секунд, подкасты и видео не переносятся.
            </li>
            <li>
              ListenBrainz: на{" "}
              <a
                className="text-accent"
                href="https://listenbrainz.org/settings/export/"
                target="_blank"
                rel="noreferrer"
              >
                странице экспорта
              </a>{" "}
              скачайте архив прослушиваний и загрузите его сюда.
            </li>
            <li>
              Last.fm переносится отдельно, через подключение в настройках.
            </li>
          </ul>
        </details>
        <label className="block">
          <span>Файлы истории</span>
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
          Проверить файлы
        </button>
        {!!batches.length && (
          <div className="space-y-3">
            <p>
              Новых:{" "}
              {batches.reduce((sum, batch) => sum + batch.preview.new, 0)}.
              Дублей:{" "}
              {batches.reduce(
                (sum, batch) => sum + batch.preview.duplicates,
                0,
              )}
              .
            </p>
            <ul className="space-y-2 text-sm">
              {batches[0].preview.sample.map((row, index) => (
                <li className="break-words" key={`${row.played_at}-${index}`}>
                  {row.artist} — {row.title} ·{" "}
                  {new Date(row.played_at).toLocaleString("ru-RU")}
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
              Подтвердить импорт
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
