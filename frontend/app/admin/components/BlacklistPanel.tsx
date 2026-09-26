"use client";

import { useState } from "react";
import { Filter, Trash2 } from "lucide-react";
import type { BlacklistFilter } from "../types";
import {
  Notice,
  PanelTitle,
  adminRequest,
  buttonClass,
  inputClass,
  labelClass,
  panelClass,
  useAdminResource,
  useNotice,
} from "../ui";

const TYPES: Record<string, string> = {
  keyword: "Слово в названии, исполнителе или альбоме",
  artist: "Исполнитель (точное совпадение)",
  regex: "Регулярное выражение (название или исполнитель)",
};

/** Plays matching these filters are not recorded (white noise, podcasts…). */
export default function BlacklistPanel() {
  const { data, reload } = useAdminResource<{ filters: BlacklistFilter[] }>(
    "/api/admin/catalog/blacklist",
  );
  const [pattern, setPattern] = useState("");
  const [type, setType] = useState("keyword");
  const [reason, setReason] = useState("");
  const { notice, run } = useNotice();

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(
      () =>
        adminRequest("/api/admin/catalog/blacklist", {
          method: "POST",
          json: {
            pattern: pattern.trim(),
            filter_type: type,
            reason: reason.trim() || null,
          },
        }),
      "Фильтр добавлен",
    );
    if (ok) {
      setPattern("");
      setReason("");
      reload();
    }
  };

  const remove = async (f: BlacklistFilter) => {
    if (!confirm(`Удалить фильтр «${f.pattern}»?`)) return;
    if (
      await run(
        () =>
          adminRequest(`/api/admin/catalog/blacklist/${f.id}`, {
            method: "DELETE",
          }),
        "Фильтр удалён",
      )
    )
      reload();
  };

  return (
    <section className={panelClass} aria-labelledby="blacklist-heading">
      <PanelTitle
        icon={<Filter className="w-4 h-4 text-red-500" aria-hidden="true" />}
      >
        <span id="blacklist-heading">Чёрный список (не засчитывать)</span>
      </PanelTitle>
      <form
        onSubmit={add}
        className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <label>
          <span className={labelClass}>Шаблон</span>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            required
            maxLength={256}
            className={inputClass}
          />
        </label>
        <label>
          <span className={labelClass}>Тип</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={inputClass}
          >
            {Object.entries(TYPES).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Причина</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
          />
        </label>
        <button type="submit" className={buttonClass.primary}>
          Добавить фильтр
        </button>
      </form>
      <Notice text={notice} />
      <ul className="divide-y divide-white/5">
        {(data?.filters ?? []).map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-3 py-2 text-xs"
          >
            <div className="min-w-0">
              <span className="font-mono text-white break-all">
                {f.pattern}
              </span>{" "}
              <span className="text-gray-400">({f.filter_type})</span>
              {f.reason && <div className="text-gray-400">{f.reason}</div>}
            </div>
            <button
              type="button"
              onClick={() => remove(f)}
              aria-label={`Удалить фильтр ${f.pattern}`}
              className="p-2 hover:bg-red-500/20 rounded-lg text-red-400"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </li>
        ))}
        {data?.filters.length === 0 && (
          <li className="py-2 text-xs text-gray-400">Фильтров нет</li>
        )}
      </ul>
    </section>
  );
}
