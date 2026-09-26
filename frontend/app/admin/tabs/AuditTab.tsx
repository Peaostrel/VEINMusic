"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";
import type { AuditEntry, AuditPage } from "../types";
import {
  PanelTitle,
  Pager,
  formatDateTime,
  inputClass,
  labelClass,
  panelClass,
  query,
  useAdminResource,
} from "../ui";

const LIMIT = 50;

function Details({ value }: Readonly<{ value: AuditEntry["details"] }>) {
  if (!value) return <span className="text-gray-500">—</span>;
  if (typeof value === "string") return <span>{value}</span>;
  return (
    <span className="font-mono text-[11px] text-gray-300 break-all">
      {Object.entries(value)
        .map(
          ([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
        )
        .join(" · ")}
    </span>
  );
}

/** Who changed what in the admin panel. */
export default function AuditTab() {
  const [action, setAction] = useState("");
  const [admin, setAdmin] = useState("");
  const [target, setTarget] = useState("");
  const [offset, setOffset] = useState(0);
  const { data, error, loading } = useAdminResource<AuditPage>(
    `/api/admin/audit${query({ action, admin, target, limit: LIMIT, offset })}`,
  );

  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setOffset(0);
    };

  return (
    <div className="space-y-4">
      <div className={panelClass}>
        <PanelTitle
          icon={
            <ScrollText className="w-4 h-4 text-red-500" aria-hidden="true" />
          }
        >
          Журнал действий администраторов
        </PanelTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label>
            <span className={labelClass}>Действие</span>
            <select
              value={action}
              onChange={(e) => resetPage(setAction)(e.target.value)}
              className={inputClass}
            >
              <option value="">Все</option>
              {(data?.actions ?? []).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Администратор</span>
            <input
              value={admin}
              onChange={(e) => resetPage(setAdmin)(e.target.value.trim())}
              placeholder="ник"
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Объект</span>
            <input
              value={target}
              onChange={(e) => resetPage(setTarget)(e.target.value)}
              placeholder="пользователь, трек, флаг…"
              className={inputClass}
            />
          </label>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs font-bold">{error}</p>}

      <div className="bg-[#141418] border border-white/5 rounded-2xl overflow-x-auto">
        <table className="w-full text-left text-xs text-gray-300">
          <thead className="bg-[#0f0f12] text-gray-400 font-mono uppercase text-[11px] border-b border-white/5">
            <tr>
              <th className="py-3 px-4">Когда</th>
              <th className="py-3 px-4">Кто</th>
              <th className="py-3 px-4">Действие</th>
              <th className="py-3 px-4">Объект</th>
              <th className="py-3 px-4">Подробности</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data?.items ?? []).map((e) => (
              <tr key={e.id}>
                <td className="py-2.5 px-4 font-mono whitespace-nowrap text-gray-400">
                  {formatDateTime(e.created_at)}
                </td>
                <td className="py-2.5 px-4 font-bold text-white">@{e.admin}</td>
                <td className="py-2.5 px-4 font-mono text-red-300">
                  {e.action}
                </td>
                <td className="py-2.5 px-4">{e.target ?? "—"}</td>
                <td className="py-2.5 px-4">
                  <Details value={e.details} />
                </td>
              </tr>
            ))}
            {!loading && data?.items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-400">
                  Записей нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager
        total={data?.total ?? 0}
        limit={LIMIT}
        offset={offset}
        onChange={setOffset}
      />
    </div>
  );
}
