"use client";

import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";
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
  keyword: msg("Слово в названии, исполнителе или альбоме"),
  artist: msg("Исполнитель (точное совпадение)"),
  regex: msg("Регулярное выражение (название или исполнитель)"),
};

/** Plays matching these filters are not recorded (white noise, podcasts…). */
export default function BlacklistPanel() {
  const t = useT();
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
      t("Фильтр добавлен"),
    );
    if (ok) {
      setPattern("");
      setReason("");
      reload();
    }
  };

  const remove = async (f: BlacklistFilter) => {
    if (!confirm(t("Удалить фильтр «{pattern}»?", { pattern: f.pattern })))
      return;
    if (
      await run(
        () =>
          adminRequest(`/api/admin/catalog/blacklist/${f.id}`, {
            method: "DELETE",
          }),
        t("Фильтр удалён"),
      )
    )
      reload();
  };

  return (
    <section className={panelClass} aria-labelledby="blacklist-heading">
      <PanelTitle
        icon={<Filter className="w-4 h-4 text-danger" aria-hidden="true" />}
      >
        <span id="blacklist-heading">
          {t("Чёрный список (не засчитывать)")}
        </span>
      </PanelTitle>
      <form
        onSubmit={add}
        className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <label>
          <span className={labelClass}>{t("Шаблон")}</span>
          <input
            autoComplete="off"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            required
            maxLength={256}
            className={inputClass}
          />
        </label>
        <label>
          <span className={labelClass}>{t("Тип")}</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={inputClass}
          >
            {Object.entries(TYPES).map(([id, label]) => (
              <option key={id} value={id}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>{t("Причина")}</span>
          <input
            autoComplete="off"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
          />
        </label>
        <button type="submit" className={buttonClass.primary}>
          {t("Добавить фильтр")}
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
              <span className="font-mono text-fg break-all">{f.pattern}</span>{" "}
              <span className="text-fg-2">({f.filter_type})</span>
              {f.reason && <div className="text-fg-2">{f.reason}</div>}
            </div>
            <button
              type="button"
              onClick={() => remove(f)}
              aria-label={t("Удалить фильтр {pattern}", { pattern: f.pattern })}
              className="p-2 hover:bg-[#2a1b1b] rounded-lg text-danger"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </li>
        ))}
        {data?.filters.length === 0 && (
          <li className="py-2 text-xs text-fg-2">{t("Фильтров нет")}</li>
        )}
      </ul>
    </section>
  );
}
