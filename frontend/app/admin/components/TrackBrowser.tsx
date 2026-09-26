"use client";

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
  { key: "title", label: "Название" },
  { key: "artist", label: "Исполнитель" },
  { key: "album", label: "Альбом" },
  { key: "genre", label: "Жанр" },
  { key: "cover_url", label: "Обложка (URL)", type: "url" },
  { key: "track_url", label: "Ссылка на трек (URL)", type: "url" },
  { key: "duration", label: "Длительность, с", type: "number" },
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
      "Сохранено",
    );
    if (ok) onSaved();
  };

  return (
    <Dialog label={`Трек #${track.id}`} onClose={onClose}>
      <form
        onSubmit={save}
        className="bg-[#141418] border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-3 text-left"
      >
        <h2 className="text-base font-black text-white">
          Трек #{track.id} · {track.plays} прослушиваний
        </h2>
        {FIELDS.map(({ key, label, type }) => (
          <label key={key} className="block">
            <span className={labelClass}>{label}</span>
            <input
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
            Отмена
          </button>
          <button type="submit" className={buttonClass.primary}>
            Сохранить
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** The whole catalog: search, edit, delete. */
export default function TrackBrowser() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<CatalogTrack | null>(null);
  const { data, reload } = useAdminResource<Paged<CatalogTrack>>(
    `/api/admin/tracks${query({ q, limit: LIMIT, offset })}`,
  );
  const { notice, run } = useNotice();

  const remove = async (t: CatalogTrack) => {
    if (
      !confirm(
        `Удалить «${t.artist} — ${t.title}» и все его прослушивания (${t.plays})?`,
      )
    )
      return;
    if (
      await run(
        () => adminRequest(`/api/admin/tracks/${t.id}`, { method: "DELETE" }),
        "Трек удалён",
      )
    )
      reload();
  };

  return (
    <section className="space-y-3" aria-label="Каталог треков">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Поиск по каталогу"
            placeholder="Название, исполнитель, альбом или ID…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
            className={`${inputClass} pl-10 py-2.5 text-sm`}
          />
        </div>
        <span className="text-xs text-gray-400 font-mono">
          Треков: {data?.total ?? "…"}
        </span>
      </div>
      <Notice text={notice} />
      <div className="bg-[#141418] border border-white/5 rounded-2xl overflow-x-auto">
        <table className="w-full text-left text-xs text-gray-300">
          <thead className="bg-[#0f0f12] text-gray-400 font-mono uppercase text-[11px] border-b border-white/5">
            <tr>
              <th className="py-3 px-4">ID</th>
              <th className="py-3 px-4">Трек</th>
              <th className="py-3 px-4">Альбом / жанр</th>
              <th className="py-3 px-4">Длит.</th>
              <th className="py-3 px-4">Прослуш.</th>
              <th className="py-3 px-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data?.items ?? []).map((t) => (
              <tr key={t.id} className="hover:bg-white/[0.02]">
                <td className="py-2.5 px-4 font-mono text-gray-400">#{t.id}</td>
                <td className="py-2.5 px-4">
                  <div className="font-bold text-white">{t.title}</div>
                  <div className="text-gray-400">{t.artist}</div>
                </td>
                <td className="py-2.5 px-4 text-gray-400">
                  {t.album || "—"}
                  {t.genre && (
                    <div className="text-[10px] font-mono">{t.genre}</div>
                  )}
                </td>
                <td className="py-2.5 px-4 font-mono">
                  {t.duration ? `${t.duration} с` : "—"}
                </td>
                <td className="py-2.5 px-4 font-mono">{t.plays}</td>
                <td className="py-2.5 px-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    aria-label={`Изменить трек ${t.id}`}
                    className="p-2 hover:bg-white/10 rounded-lg text-blue-300"
                  >
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    aria-label={`Удалить трек ${t.id}`}
                    className="p-2 hover:bg-red-500/20 rounded-lg text-red-400"
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
