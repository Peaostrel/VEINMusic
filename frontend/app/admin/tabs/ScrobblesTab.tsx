"use client";

import { useT } from "@/app/lib/i18n/client";
import { useState } from "react";
import { Check, ListMusic, Pencil, Trash2, UserRound, X } from "lucide-react";
import type { AdminScrobble, BulkDeleteResult, ScrobblePage } from "../types";
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

const LIMIT = 30;

function mmss(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

interface Filters {
  username: string;
  q: string;
  source: string;
  date_from: string;
  date_to: string;
}

function Row({
  s,
  onOpenUser,
  onChanged,
  run,
}: Readonly<{
  s: AdminScrobble;
  onOpenUser: (username: string) => void;
  onChanged: () => void;
  run: ReturnType<typeof useNotice>["run"];
}>) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [artist, setArtist] = useState(s.artist);
  const [title, setTitle] = useState(s.title);

  const save = async () => {
    if (
      await run(
        () =>
          adminRequest(`/api/admin/scrobbles/${s.id}`, {
            method: "PUT",
            json: { title, artist },
          }),
        t("Трек исправлен"),
      )
    ) {
      setEditing(false);
      onChanged();
    }
  };

  const remove = async () => {
    if (
      !confirm(
        t(
          "Удалить прослушивание @{username}: «{track}»? Опыт за него ({xp} XP) пропадёт.",
          {
            username: s.username,
            track: `${s.artist} — ${s.title}`,
            xp: s.xp_earned,
          },
        ),
      )
    )
      return;
    if (
      await run(
        () =>
          adminRequest(`/api/admin/scrobbles/${s.id}`, { method: "DELETE" }),
        t("Прослушивание удалено"),
      )
    )
      onChanged();
  };

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line-soft bg-surface p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {s.cover_url ? (
          <img
            src={s.cover_url}
            alt=""
            className="h-10 w-10 shrink-0 rounded bg-surface-2 object-cover"
          />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded bg-surface-2" />
        )}
        {editing ? (
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              aria-label={t("Исполнитель")}
              className={inputClass}
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label={t("Название")}
              className={inputClass}
            />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">{s.title}</p>
            <p className="truncate text-xs text-fg-2">{s.artist}</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2 sm:justify-end">
        <button
          type="button"
          onClick={() => onOpenUser(s.username)}
          className="inline-flex items-center gap-1 font-medium text-fg hover:text-accent"
        >
          <UserRound className="h-3.5 w-3.5" aria-hidden="true" />@{s.username}
        </button>
        <span className="rounded bg-surface-2 px-1.5 font-mono text-[11px]">
          {s.source ?? "—"}
          {s.is_imported && ` · ${t("импорт")}`}
        </span>
        <span className="font-mono">{formatDateTime(s.played_at)}</span>
        <span
          className={`font-mono ${s.counted ? "text-ok" : "text-fg-3"}`}
          title={s.counted ? t("Засчитано") : t("Не засчитано (меньше 85%)")}
        >
          {mmss(s.listened_sec)} / {s.duration ? mmss(s.duration) : "?"}
          {s.counted && ` · ${s.xp_earned} XP`}
        </span>
      </div>
      <div className="flex shrink-0 gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={save}
              className={buttonClass.primary}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {t("Сохранить")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={buttonClass.secondary}
              aria-label={t("Отмена")}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={buttonClass.secondary}
              title={t("Исправить трек")}
              aria-label={t("Исправить трек")}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={remove}
              className={buttonClass.danger}
              title={t("Удалить")}
              aria-label={t("Удалить")}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** Mass delete of one user's scrobbles matching the current filters. */
function BulkDelete({
  filters,
  onDone,
}: Readonly<{ filters: Filters; onDone: () => void }>) {
  const t = useT();
  const [preview, setPreview] = useState<BulkDeleteResult | null>(null);
  const { notice, setNotice, run } = useNotice();
  const body = {
    username: filters.username,
    q: filters.q || null,
    source: filters.source || null,
    date_from: filters.date_from || null,
    date_to: filters.date_to || null,
  };

  const count = () =>
    run(async () => {
      setPreview(
        await adminRequest<BulkDeleteResult>(
          "/api/admin/scrobbles/bulk-delete",
          { method: "POST", json: { ...body, dry_run: true } },
        ),
      );
    }, t("Посчитано"));

  const remove = async () => {
    if (!preview) return;
    if (
      !confirm(
        t(
          "Удалить {n} прослушиваний @{username}? Пропадёт {xp} XP. Это необратимо.",
          { n: preview.matched, username: filters.username, xp: preview.xp },
        ),
      )
    )
      return;
    await run(async () => {
      const r = await adminRequest<BulkDeleteResult>(
        "/api/admin/scrobbles/bulk-delete",
        { method: "POST", json: { ...body, dry_run: false } },
      );
      setPreview(null);
      setNotice(`✅ ${t("Удалено: {n}", { n: r.deleted })}`);
      onDone();
    }, t("Удалено"));
  };

  return (
    <div className={panelClass}>
      <PanelTitle icon={<Trash2 aria-hidden="true" />}>
        {t("Массовое удаление")}
      </PanelTitle>
      <p className="text-xs text-fg-2">
        {t(
          "Удаляет прослушивания одного пользователя по фильтрам выше: текст, источник и период. Например, фантомные треки после бага. Сначала посчитайте, сколько попадёт под удаление.",
        )}
      </p>
      {filters.username ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={count}
            className={buttonClass.secondary}
          >
            {t("Посчитать для @{username}", { username: filters.username })}
          </button>
          {preview && (
            <>
              <span className="font-mono text-xs text-fg-2">
                {t("найдено {n}", { n: preview.matched })} · {preview.xp} XP
              </span>
              {preview.matched > 0 && (
                <button
                  type="button"
                  onClick={remove}
                  className={buttonClass.danger}
                >
                  {t("Удалить {n}", { n: preview.matched })}
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-fg-3">
          {t(
            "Укажите пользователя в фильтре — удалять можно только у одного пользователя за раз.",
          )}
        </p>
      )}
      <Notice text={notice} />
    </div>
  );
}

/** Users' scrobbles: search, fix the track, delete, mass delete. */
export default function ScrobblesTab({
  onOpenUser,
  initialUsername = "",
}: Readonly<{
  onOpenUser: (username: string) => void;
  initialUsername?: string;
}>) {
  const t = useT();
  const [filters, setFilters] = useState<Filters>({
    username: initialUsername,
    q: "",
    source: "",
    date_from: "",
    date_to: "",
  });
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useAdminResource<ScrobblePage>(
    `/api/admin/scrobbles${query({ ...filters, limit: LIMIT, offset })}`,
  );
  const { notice, run } = useNotice();

  const set = (key: keyof Filters) => (value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setOffset(0);
  };

  return (
    <div className="space-y-4">
      <div className={panelClass}>
        <PanelTitle icon={<ListMusic aria-hidden="true" />}>
          {t("Прослушивания")}
          {data && (
            <span className="font-mono text-xs font-normal text-fg-3">
              {data.total}
            </span>
          )}
        </PanelTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label>
            <span className={labelClass}>{t("Пользователь")}</span>
            <input
              value={filters.username}
              onChange={(e) => set("username")(e.target.value.trim())}
              placeholder={t("ник")}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>{t("Трек или исполнитель")}</span>
            <input
              value={filters.q}
              onChange={(e) => set("q")(e.target.value)}
              placeholder={t("поиск")}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>{t("Источник")}</span>
            <select
              value={filters.source}
              onChange={(e) => set("source")(e.target.value)}
              className={inputClass}
            >
              <option value="">{t("Все")}</option>
              {(data?.sources ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>{t("С")}</span>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => set("date_from")(e.target.value)}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>{t("По")}</span>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => set("date_to")(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <Notice text={notice || (error ? `❌ ${error}` : "")} />
      </div>

      <ul className="space-y-2">
        {(data?.items ?? []).map((s) => (
          <Row
            key={s.id}
            s={s}
            onOpenUser={onOpenUser}
            onChanged={reload}
            run={run}
          />
        ))}
        {!loading && data?.items.length === 0 && (
          <li className="py-6 text-center text-xs text-fg-2">
            {t("Ничего не найдено")}
          </li>
        )}
      </ul>
      <Pager
        total={data?.total ?? 0}
        limit={LIMIT}
        offset={offset}
        onChange={setOffset}
      />

      <BulkDelete filters={filters} onDone={reload} />
    </div>
  );
}
