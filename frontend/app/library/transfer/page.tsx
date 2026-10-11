"use client";

import Link from "next/link";
import { useState } from "react";
import { API_URL, apiJson } from "@/app/lib/api";
import { readHistoryFile } from "@/app/lib/historyTransfer";
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
  const [file, setFile] = useState<File | null>(null);
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
    if (!file) return;
    setBusy(true);
    setBatches([]);
    setMessage("Проверяем файл…");
    try {
      const rows = await readHistoryFile(file);
      const results: Batch[] = [];
      for (let index = 0; index < rows.length; index += 5000) {
        const chunk = rows.slice(index, index + 5000);
        results.push({
          rows: chunk,
          preview: await apiJson<Preview>("/api/account/history/preview", {
            method: "POST",
            json: { scrobbles: chunk },
          }),
        });
        setMessage(
          `Проверено ${Math.min(index + 5000, rows.length)} из ${rows.length}`,
        );
      }
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
      for (const batch of batches) {
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
      }
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
            CSV с даты
            <input
              className={input}
              type="date"
              value={exportFrom}
              onChange={(event) => setExportFrom(event.target.value)}
            />
          </label>
          <label>
            CSV по дату
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
        <h2 className="font-semibold">Импортировать историю VEIN</h2>
        <p className="text-sm text-fg-2">
          JSON или CSV, до 20 МБ и 50 000 записей за один перенос. Импорт
          сохраняет даты, источник и отметки исключения. XP и награды за него не
          начисляются; настройки аккаунта не меняются.
        </p>
        <label className="block">
          Файл истории
          <input
            type="file"
            accept=".json,.csv,application/json,text/csv"
            disabled={busy}
            className={`${input} mt-2 h-auto py-3`}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setBatches([]);
              setMessage("");
            }}
          />
        </label>
        <button
          disabled={!file || busy}
          className={`${btn.secondary} ${btn.md}`}
          onClick={() => {
            void preview();
          }}
        >
          Проверить файл
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
