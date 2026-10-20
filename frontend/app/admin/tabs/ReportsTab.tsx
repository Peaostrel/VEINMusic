"use client";

import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";
import { useState } from "react";
import Link from "next/link";
import { Ban, Check, Flag, Music2, Trash2, UserRound, X } from "lucide-react";
import type { AdminReport, ReportPage } from "../types";
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

export const REPORT_REASONS: Record<string, string> = {
  spam: msg("Спам или реклама"),
  abuse: msg("Оскорбления или травля"),
  inappropriate: msg("Неприемлемый контент"),
  cheating: msg("Накрутка прослушиваний"),
  impersonation: msg("Выдаёт себя за другого"),
  other: msg("Другое"),
};

const STATUS_LABELS = {
  open: msg("Открытые"),
  resolved: msg("Приняты меры"),
  dismissed: msg("Отклонённые"),
  all: msg("Все"),
} as const;

const TYPE_LABELS: Record<AdminReport["type"], string> = {
  user: msg("профиль"),
  comment: msg("комментарий"),
  track: msg("трек"),
};

type Action = "none" | "delete_comment" | "ban_user" | "delete_track";

function Person({
  p,
  onOpenUser,
  formerName,
}: Readonly<{
  p: AdminReport["target"];
  onOpenUser: (username: string) => void;
  /** The name from the snapshot, for a deleted account */
  formerName?: string | null;
}>) {
  const t = useT();
  if (!p)
    return (
      <span className="text-fg-3">
        {formerName ? t("@{name} (удалён)", { name: formerName }) : t("удалён")}
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => onOpenUser(p.username)}
      className="inline-flex items-center gap-1 font-medium text-fg hover:text-accent"
    >
      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />@{p.username}
      {p.is_banned && (
        <span className="ml-1 text-[10px] font-medium text-danger">
          {t("БАН")}
        </span>
      )}
    </button>
  );
}

/** How much to trust a reporter: many dismissed reports weigh less. */
function ReporterHistory({
  h,
}: Readonly<{ h: AdminReport["reporter_history"] }>) {
  const t = useT();
  if (!h || h.total < 2) return null;
  const doubtful = h.dismissed >= 2 && h.dismissed * 2 >= h.total;
  return (
    <span
      className={doubtful ? "text-danger" : "text-fg-3"}
      title={t("Прошлые жалобы этого пользователя")}
    >
      {t("жалоб {total}: подтверждено {resolved}, отклонено {dismissed}", {
        total: h.total,
        resolved: h.resolved,
        dismissed: h.dismissed,
      })}
    </span>
  );
}

/** What was reported, as it was at the time of the report. */
function Evidence({ r }: Readonly<{ r: AdminReport }>) {
  const t = useT();
  if (r.type === "comment" && r.comment)
    return (
      <blockquote className="rounded-lg border border-line-soft bg-bg px-3 py-2 text-sm text-fg">
        «{r.comment.text}»
        {!r.comment.exists && (
          <span className="ml-2 text-xs text-fg-3">{t("(уже удалён)")}</span>
        )}
      </blockquote>
    );
  if (r.type === "track" && r.track) {
    const name = `${r.track.artist ?? "?"} — ${r.track.title ?? "?"}`;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-line-soft bg-bg px-3 py-2 text-sm">
        <Music2 className="h-4 w-4 shrink-0 text-fg-3" aria-hidden="true" />
        {r.track.exists && r.track.id ? (
          <Link
            href={`/track/${r.track.id}`}
            target="_blank"
            className="font-medium hover:text-accent"
          >
            {name}
          </Link>
        ) : (
          <span className="font-medium">
            {name} <span className="text-xs text-fg-3">{t("(удалён)")}</span>
          </span>
        )}
        {r.track.album && (
          <span className="text-xs text-fg-3">
            {t("альбом «{album}»", { album: r.track.album })}
          </span>
        )}
      </div>
    );
  }
  const s = r.snapshot;
  if (r.type === "user" && s && (s.display_name || s.bio || s.location))
    return (
      <div className="space-y-1 rounded-lg border border-line-soft bg-bg px-3 py-2 text-sm">
        <p className="text-[11px] text-fg-3">{t("Профиль на момент жалобы")}</p>
        {s.display_name && <p className="font-medium">{s.display_name}</p>}
        {s.bio && <p className="whitespace-pre-wrap text-fg-2">{s.bio}</p>}
        {s.location && <p className="text-xs text-fg-3">{s.location}</p>}
      </div>
    );
  return null;
}

/** All reports about one profile, comment or track, decided at once. */
function ReportGroup({
  reports,
  onOpenUser,
  onChanged,
  run,
}: Readonly<{
  reports: AdminReport[];
  onOpenUser: (username: string) => void;
  onChanged: () => void;
  run: ReturnType<typeof useNotice>["run"];
}>) {
  const t = useT();
  const [note, setNote] = useState("");
  const [blockArtist, setBlockArtist] = useState(false);
  const r = reports[0];
  const open = reports.filter((x) => x.status === "open");
  const reporters = new Set(reports.map((x) => x.reporter?.username)).size;

  const resolve = async (
    status: "resolved" | "dismissed",
    action: Action = "none",
  ) => {
    const confirmText: Partial<Record<Action, string>> = {
      delete_comment: t("Удалить комментарий @{username} и закрыть жалобы?", {
        username: r.target?.username ?? "",
      }),
      ban_user: t("Заблокировать @{username}? Все его сеансы завершатся.", {
        username: r.target?.username ?? "",
      }),
      delete_track: t("Удалить трек «{track}» вместе с его прослушиваниями?", {
        track: `${r.track?.artist} — ${r.track?.title}`,
      }),
    };
    if (confirmText[action] && !confirm(confirmText[action])) return;
    const target = open[0] ?? r;
    if (
      await run(
        () =>
          adminRequest(`/api/admin/reports/${target.id}/resolve`, {
            method: "POST",
            json: {
              status,
              resolution: note.trim() || null,
              action,
              block_artist: action === "delete_track" && blockArtist,
            },
          }),
        status === "dismissed"
          ? t("Жалобы отклонены, авторы получат уведомление")
          : t("Жалобы закрыты, авторы получат уведомление"),
      )
    )
      onChanged();
  };

  return (
    <li className="space-y-3 rounded-xl border border-line-soft bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2">
        <span className="font-medium uppercase tracking-wide text-fg-3">
          {t(TYPE_LABELS[r.type])}
        </span>
        {r.type !== "track" && (
          <Person
            p={r.target}
            onOpenUser={onOpenUser}
            formerName={r.snapshot?.username}
          />
        )}
        {reports.length > 1 && (
          <span className="rounded border border-danger-line px-1.5 text-[11px] font-medium text-danger">
            {reporters === 1
              ? t("жалоб: {n} от {m} человека", {
                  n: reports.length,
                  m: reporters,
                })
              : t("жалоб: {n} от {m} человек", {
                  n: reports.length,
                  m: reporters,
                })}
          </span>
        )}
        {r.type !== "track" && r.target_open_reports > r.same_open_reports && (
          <span className="text-accent">
            {t("всего открытых жалоб на него: {n}", {
              n: r.target_open_reports,
            })}
          </span>
        )}
      </div>

      <Evidence r={r} />

      <ul className="space-y-2 border-l border-line-soft pl-3">
        {reports.map((x) => (
          <li key={x.id} className="space-y-1 text-xs text-fg-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="rounded border border-line px-1.5 text-[11px] font-medium text-fg">
                {REPORT_REASONS[x.reason]
                  ? t(REPORT_REASONS[x.reason])
                  : x.reason}
              </span>
              <span className="flex items-center gap-1">
                {t("от")} <Person p={x.reporter} onOpenUser={onOpenUser} />
              </span>
              <ReporterHistory h={x.reporter_history} />
              <span className="font-mono">{formatDateTime(x.created_at)}</span>
            </div>
            {x.details && (
              <p className="whitespace-pre-wrap text-sm text-fg-2">
                {x.details}
              </p>
            )}
          </li>
        ))}
      </ul>

      {open.length > 0 ? (
        <div className="space-y-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder={t(
              "Заметка: что сделано (необязательно, видна только админам)",
            )}
            aria-label={t("Заметка")}
            className={inputClass}
          />
          {r.type === "track" && r.track?.exists && r.track.artist && (
            <label className="flex items-center gap-2 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={blockArtist}
                onChange={(e) => setBlockArtist(e.target.checked)}
                className="accent-(--accent)"
              />
              {t(
                "При удалении трека больше не принимать прослушивания исполнителя «{artist}»",
                { artist: r.track.artist },
              )}
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {r.type === "comment" && r.comment?.exists && (
              <button
                type="button"
                className={buttonClass.danger}
                onClick={() => resolve("resolved", "delete_comment")}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t("Удалить комментарий")}
              </button>
            )}
            {r.type === "track" && r.track?.exists && (
              <button
                type="button"
                className={buttonClass.danger}
                onClick={() => resolve("resolved", "delete_track")}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t("Удалить трек")}
              </button>
            )}
            {r.target && !r.target.is_banned && (
              <button
                type="button"
                className={buttonClass.danger}
                onClick={() => resolve("resolved", "ban_user")}
              >
                <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                {r.type === "comment" ? t("Забанить автора") : t("Забанить")}
              </button>
            )}
            <button
              type="button"
              className={buttonClass.primary}
              onClick={() => resolve("resolved")}
              title={t(
                "Меры приняты отдельно (например, в карточке пользователя)",
              )}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {t("Меры приняты")}
            </button>
            <button
              type="button"
              className={buttonClass.secondary}
              onClick={() => resolve("dismissed")}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {t("Нарушения нет")}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-fg-2">
          {r.status === "resolved" ? t("Меры приняты") : t("Отклонена")} ·{" "}
          {r.resolved_by ? `@${r.resolved_by}` : "—"} ·{" "}
          {formatDateTime(r.resolved_at)}
          {r.resolution && ` · ${r.resolution}`}
        </p>
      )}
    </li>
  );
}

/** Groups the page's reports by what they are about, keeping their order. */
function groupReports(items: AdminReport[]): AdminReport[][] {
  const groups = new Map<string, AdminReport[]>();
  for (const item of items) {
    const key = `${item.status === "open" ? "open" : item.id}:${item.target_key}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()];
}

/** Reports from users on profiles, comments and catalog tracks. */
export default function ReportsTab({
  onOpenUser,
  onChanged,
}: Readonly<{
  onOpenUser: (username: string) => void;
  onChanged?: () => void;
}>) {
  const t = useT();
  const [status, setStatus] = useState<keyof typeof STATUS_LABELS>("open");
  const [targetType, setTargetType] = useState("");
  const [sort, setSort] = useState<"priority" | "new">("priority");
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useAdminResource<ReportPage>(
    `/api/admin/reports${query({ status, target_type: targetType, sort, limit: LIMIT, offset })}`,
  );
  const { notice, run } = useNotice();

  const changed = () => {
    reload();
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      <div className={panelClass}>
        <PanelTitle icon={<Flag aria-hidden="true" />}>
          {t("Жалобы пользователей")}
          {data && (
            <span className="font-mono text-xs font-normal text-fg-3">
              {t("открытых: {n}", { n: data.open_count })}
            </span>
          )}
        </PanelTitle>
        <p className="text-xs text-fg-2">
          {t(
            "Жалобы на профили, комментарии и треки каталога. Жалобы на одно и то же собраны вместе и решаются разом; сначала то, на что жалуется больше людей. Авторы жалоб получают уведомление с итогом, имя модератора они не видят. О новой жалобе админам приходит уведомление.",
          )}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label>
            <span className={labelClass}>{t("Статус")}</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as keyof typeof STATUS_LABELS);
                setOffset(0);
              }}
              className={inputClass}
            >
              {Object.entries(STATUS_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>{t("На что")}</span>
            <select
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value);
                setOffset(0);
              }}
              className={inputClass}
            >
              <option value="">{t("Всё")}</option>
              <option value="user">{t("Профили")}</option>
              <option value="comment">{t("Комментарии")}</option>
              <option value="track">{t("Треки")}</option>
            </select>
          </label>
          <label>
            <span className={labelClass}>{t("Порядок")}</span>
            <select
              value={status === "open" ? sort : "new"}
              disabled={status !== "open"}
              title={
                status === "open"
                  ? undefined
                  : t("Закрытые жалобы идут от новых")
              }
              onChange={(e) => {
                setSort(e.target.value as "priority" | "new");
                setOffset(0);
              }}
              className={`${inputClass} disabled:opacity-60`}
            >
              <option value="priority">{t("Сначала важные")}</option>
              <option value="new">{t("Сначала новые")}</option>
            </select>
          </label>
        </div>
        <Notice text={notice || (error ? `❌ ${error}` : "")} />
      </div>

      <ul className="space-y-2">
        {groupReports(data?.items ?? []).map((group) => (
          <ReportGroup
            key={group[0].id}
            reports={group}
            onOpenUser={onOpenUser}
            onChanged={changed}
            run={run}
          />
        ))}
        {!loading && data?.items.length === 0 && (
          <li className="py-6 text-center text-xs text-fg-2">
            {status === "open" ? t("Открытых жалоб нет") : t("Жалоб нет")}
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
