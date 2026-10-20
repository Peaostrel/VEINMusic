"use client";

import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";
import { useState } from "react";
import { Pencil, Search, Trash2 } from "lucide-react";
import Dialog from "@/components/Dialog";
import type { CatalogTrack, Paged } from "../types";
import {
  Notice,
  Pager,
  adminRequest,
  buttonClass,
  inputClass,
  labelClass,
  query,
  useAdminResource,
  useNotice,
} from "../ui";

const LIMIT = 50;
const FIELDS: { key: keyof CatalogTrack; label: string; type?: string }[] = [
  { key: "title", label: msg("Название") },
  { key: "artist", label: msg("Исполнитель") },
  { key: "album", label: msg("Альбом") },
  { key: "genre", label: msg("Жанр") },
  { key: "cover_url", label: msg("Обложка (URL)"), type: "url" },
  { key: "track_url", label: msg("Ссылка на трек (URL)"), type: "url" },
  { key: "duration", label: msg("Длительность, с"), type: "number" },
];

function EditTrack({
  track,
  onClose,
  onSaved,
}: Readonly<{
  track: CatalogTrack;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const t = useT();
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS.map(({ key }) => [
        key,
        track[key] == null ? "" : String(track[key]),
      ]),
    ),
  );
  const { notice, run } = useNotice();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const changes: Record<string, string | number> = {};
    for (const { key, type } of FIELDS) {
      const before = track[key] == null ? "" : String(track[key]);
      if (form[key] !== before)
        changes[key] = type === "number" ? Number(form[key] || 0) : form[key];
    }
    if (Object.keys(changes).length === 0) return onClose();
    const ok = await run(
      () =>
        adminRequest(`/api/admin/tracks/${track.id}`, {
          method: "PUT",
          json: changes,
        }),
      t("Сохранено"),
    );
    if (ok) onSaved();
  };

  return (
    <Dialog label={t("Трек #{id}", { id: track.id })} onClose={onClose}>
      <form
        onSubmit={save}
        className="bg-surface border border-line rounded-xl w-full max-w-lg p-6 space-y-3 text-left"
      >
        <h2 className="text-base font-semibold text-fg">
          {t("Трек #{id} · {n} прослушиваний", {
            id: track.id,
            n: track.plays,
          })}
        </h2>
        {FIELDS.map(({ key, label, type }) => (
          <label key={key} className="block">
            <span className={labelClass}>{t(label)}</span>
            <input
              autoComplete="off"
              type={type ?? "text"}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              required={key === "title" || key === "artist"}
              min={type === "number" ? 0 : undefined}
              max={type === "number" ? 7200 : undefined}
              className={inputClass}
            />
          </label>
        ))}
        <Notice text={notice} />
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className={buttonClass.secondary}
          >
            {t("Отмена")}
          </button>
          <button type="submit" className={buttonClass.primary}>
            {t("Сохранить")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** The whole catalog: search, edit, delete. */
export default function TrackBrowser() {
  const t = useT();
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<CatalogTrack | null>(null);
  const { data, reload } = useAdminResource<Paged<CatalogTrack>>(
    `/api/admin/tracks${query({ q, limit: LIMIT, offset })}`,
  );
  const { notice, run } = useNotice();

  const remove = async (row: CatalogTrack) => {
    if (
      !confirm(
        t("Удалить «{track}» и все его прослушивания ({n})?", {
          track: `${row.artist} — ${row.title}`,
          n: row.plays,
        }),
      )
    )
      return;
    if (
      await run(
        () => adminRequest(`/api/admin/tracks/${row.id}`, { method: "DELETE" }),
        t("Трек удалён"),
      )
    )
      reload();
  };

  return (
    <section className="space-y-3" aria-label={t("Каталог треков")}>
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-fg-2 absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            autoComplete="off"
            type="search"
            aria-label={t("Поиск по каталогу")}
            placeholder={t("Название, исполнитель, альбом или ID…")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
            className={`${inputClass} pl-10 py-2.5 text-sm`}
          />
        </div>
        <span className="text-xs text-fg-2 font-mono">
          {t("Треков: {n}", { n: data?.total ?? "…" })}
        </span>
      </div>
      <Notice text={notice} />
      <div className="bg-surface border border-line-soft rounded-xl overflow-x-auto">
        <table className="w-full text-left text-xs text-fg-2">
          <thead className="bg-[#0f0f12] text-fg-2 font-mono text-[11px] border-b border-line-soft">
            <tr>
              <th className="py-3 px-4">ID</th>
              <th className="py-3 px-4">{t("Трек")}</th>
              <th className="py-3 px-4">{t("Альбом / жанр")}</th>
              <th className="py-3 px-4">{t("Длит.")}</th>
              <th className="py-3 px-4">{t("Прослуш.")}</th>
              <th className="py-3 px-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data?.items ?? []).map((row) => (
              <tr key={row.id} className="hover:bg-white/[0.02]">
                <td className="py-2.5 px-4 font-mono text-fg-2">#{row.id}</td>
                <td className="py-2.5 px-4">
                  <div className="font-medium text-fg">{row.title}</div>
                  <div className="text-fg-2">{row.artist}</div>
                </td>
                <td className="py-2.5 px-4 text-fg-2">
                  {row.album || "—"}
                  {row.genre && (
                    <div className="text-[10px] font-mono">{row.genre}</div>
                  )}
                </td>
                <td className="py-2.5 px-4 font-mono">
                  {row.duration ? t("{n} с", { n: row.duration }) : "—"}
                </td>
                <td className="py-2.5 px-4 font-mono">{row.plays}</td>
                <td className="py-2.5 px-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    aria-label={t("Изменить трек {id}", { id: row.id })}
                    className="p-2 hover:bg-line rounded-lg text-fg-2"
                  >
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    aria-label={t("Удалить трек {id}", { id: row.id })}
                    className="p-2 hover:bg-[#2a1b1b] rounded-lg text-danger"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        total={data?.total ?? 0}
        limit={LIMIT}
        offset={offset}
        onChange={setOffset}
      />
      {editing && (
        <EditTrack
          track={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </section>
  );
}
