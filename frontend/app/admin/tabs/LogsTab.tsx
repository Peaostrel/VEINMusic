"use client";

import { useState } from "react";
import { Bug, RefreshCw, Trash2 } from "lucide-react";
import type { LogEntry, LogPage } from "../types";
import {
  Notice,
  PanelTitle,
  Pager,
  adminRequest,
  buttonClass,
  formatDateTime,
  inputClass,
  labelClass,
  panelClass,
  query,
  useAdminResource,
  useNotice,
} from "../ui";

const LIMIT = 50;

const LEVEL_STYLE: Record<LogEntry["level"], string> = {
  WARNING: "text-accent border-accent/40",
  ERROR: "text-danger border-danger-line",
  CRITICAL: "bg-danger text-bg border-danger",
};

function Entry({ e }: Readonly<{ e: LogEntry }>) {
  return (
    <li className="space-y-1.5 rounded-xl border border-line-soft bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
        <span
          className={`rounded border px-1.5 font-mono text-[10px] font-semibold ${LEVEL_STYLE[e.level]}`}
        >
          {e.level}
        </span>
        <span className="font-mono">{formatDateTime(e.ts)}</span>
        <span className="rounded bg-surface-2 px-1.5 font-mono text-[11px]">
          {e.source}
        </span>
        <span className="truncate font-mono text-[11px] text-fg-3">
          {e.logger}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words font-mono text-[13px] text-fg">
        {e.message}
      </p>
      {e.trace && (
        <details className="text-xs">
          <summary className="cursor-pointer text-fg-2 hover:text-fg">
            Трассировка
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-bg p-3 font-mono text-[11px] leading-relaxed text-fg-2">
            {e.trace}
          </pre>
        </details>
      )}
    </li>
  );
}

/** Recent warnings and errors of the API and the worker. */
export default function LogsTab() {
  const [level, setLevel] = useState("");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useAdminResource<LogPage>(
    `/api/admin/logs${query({ level, source, q, limit: LIMIT, offset })}`,
  );
  const { notice, run } = useNotice();

  const clear = async () => {
    if (!confirm("Очистить журнал ошибок?")) return;
    if (
      await run(
        () => adminRequest("/api/admin/logs", { method: "DELETE" }),
        "Журнал очищен",
      )
    )
      reload();
  };

  const filter =
    (set: (v: string) => void) =>
    (v: string): void => {
      set(v);
      setOffset(0);
    };

  return (
    <div className="space-y-4">
      <div className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelTitle icon={<Bug aria-hidden="true" />}>
            Ошибки и предупреждения
          </PanelTitle>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reload}
              className={buttonClass.secondary}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Обновить
            </button>
            <button
              type="button"
              onClick={clear}
              className={buttonClass.danger}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Очистить
            </button>
          </div>
        </div>
        <p className="text-xs text-fg-2">
          Последняя тысяча записей уровня WARNING и выше из API и воркера. Ключи
          и токены в текстах скрыты.
          {data &&
            !data.shared &&
            " Redis недоступен: показаны записи только этого процесса API."}
        </p>
        {data && (
          <div className="flex flex-wrap gap-4 font-mono text-xs text-fg-2">
            <span>
              ошибок:{" "}
              <b className="text-danger">
                {(data.counts.ERROR ?? 0) + (data.counts.CRITICAL ?? 0)}
              </b>
            </span>
            <span>
              предупреждений:{" "}
              <b className="text-accent">{data.counts.WARNING ?? 0}</b>
            </span>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label>
            <span className={labelClass}>Уровень</span>
            <select
              value={level}
              onChange={(e) => filter(setLevel)(e.target.value)}
              className={inputClass}
            >
              <option value="">Все</option>
              <option value="ERROR">Ошибки</option>
              <option value="WARNING">Предупреждения</option>
              <option value="CRITICAL">Критические</option>
            </select>
          </label>
          <label>
            <span className={labelClass}>Процесс</span>
            <select
              value={source}
              onChange={(e) => filter(setSource)(e.target.value)}
              className={inputClass}
            >
              <option value="">Все</option>
              {(data?.sources ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Текст</span>
            <input
              value={q}
              onChange={(e) => filter(setQ)(e.target.value)}
              placeholder="ynison, Spotify, user 7…"
              className={inputClass}
            />
          </label>
        </div>
        <Notice text={notice || (error ? `❌ ${error}` : "")} />
      </div>

      <ul className="space-y-2">
        {(data?.items ?? []).map((e) => (
          <Entry key={e.id} e={e} />
        ))}
        {!loading && data?.items.length === 0 && (
          <li className="py-6 text-center text-xs text-fg-2">
            Записей нет — и это хорошо
          </li>
        )}
      </ul>
      <Pager
        total={data?.total ?? 0}
        limit={LIMIT}
        offset={offset}
        onChange={setOffset}
      />
    </div>
  );
}
