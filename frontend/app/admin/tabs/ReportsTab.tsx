"use client";

import { useState } from "react";
import { Check, Flag, Trash2, UserRound, X } from "lucide-react";
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
  spam: "Спам или реклама",
  abuse: "Оскорбления или травля",
  inappropriate: "Неприемлемый контент",
  cheating: "Накрутка прослушиваний",
  impersonation: "Выдаёт себя за другого",
  other: "Другое",
};

const STATUS_LABELS = {
  open: "Открытые",
  resolved: "Приняты меры",
  dismissed: "Отклонённые",
  all: "Все",
} as const;

function Person({
  p,
  onOpenUser,
}: Readonly<{
  p: AdminReport["target"];
  onOpenUser: (username: string) => void;
}>) {
  if (!p) return <span className="text-fg-3">удалён</span>;
  return (
    <button
      type="button"
      onClick={() => onOpenUser(p.username)}
      className="inline-flex items-center gap-1 font-medium text-fg hover:text-accent"
    >
      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />@{p.username}
      {p.is_banned && (
        <span className="ml-1 text-[10px] font-medium text-danger">БАН</span>
      )}
    </button>
  );
}

function ReportItem({
  r,
  onOpenUser,
  onChanged,
  run,
}: Readonly<{
  r: AdminReport;
  onOpenUser: (username: string) => void;
  onChanged: () => void;
  run: ReturnType<typeof useNotice>["run"];
}>) {
  const [note, setNote] = useState("");

  const resolve = async (
    status: "resolved" | "dismissed",
    deleteComment = false,
  ) => {
    if (
      deleteComment &&
      !confirm(`Удалить комментарий @${r.target?.username} и закрыть жалобу?`)
    )
      return;
    if (
      await run(
        () =>
          adminRequest(`/api/admin/reports/${r.id}/resolve`, {
            method: "POST",
            json: {
              status,
              resolution: note.trim() || null,
              delete_comment: deleteComment,
            },
          }),
        status === "dismissed" ? "Жалоба отклонена" : "Жалоба закрыта",
      )
    )
      onChanged();
  };

  return (
    <li className="space-y-3 rounded-xl border border-line-soft bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2">
        <span className="rounded border border-danger-line px-1.5 text-[11px] font-medium text-danger">
          {REPORT_REASONS[r.reason] ?? r.reason}
        </span>
        <span>{r.type === "comment" ? "комментарий" : "профиль"}</span>
        <Person p={r.target} onOpenUser={onOpenUser} />
        {r.target_open_reports > 1 && (
          <span className="text-accent">
            открытых жалоб на него: {r.target_open_reports}
          </span>
        )}
        <span className="font-mono">{formatDateTime(r.created_at)}</span>
        <span className="flex items-center gap-1">
          от <Person p={r.reporter} onOpenUser={onOpenUser} />
        </span>
      </div>

      {r.comment && (
        <blockquote className="rounded-lg border border-line-soft bg-bg px-3 py-2 text-sm text-fg">
          «{r.comment.text}»
          {!r.comment.exists && (
            <span className="ml-2 text-xs text-fg-3">(уже удалён)</span>
          )}
        </blockquote>
      )}
      {r.details && (
        <p className="whitespace-pre-wrap text-sm text-fg-2">{r.details}</p>
      )}

      {r.status === "open" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Заметка: что сделано (необязательно)"
            aria-label="Заметка"
            className={`${inputClass} sm:flex-1`}
          />
          <div className="flex flex-wrap gap-2">
            {r.comment?.exists && (
              <button
                type="button"
                className={buttonClass.danger}
                onClick={() => resolve("resolved", true)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Удалить комментарий
              </button>
            )}
            <button
              type="button"
              className={buttonClass.primary}
              onClick={() => resolve("resolved")}
              title="Меры приняты (например, бан в карточке пользователя)"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Меры приняты
            </button>
            <button
              type="button"
              className={buttonClass.secondary}
              onClick={() => resolve("dismissed")}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Отклонить
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-fg-2">
          {r.status === "resolved" ? "Меры приняты" : "Отклонена"} ·{" "}
          {r.resolved_by ? `@${r.resolved_by}` : "—"} ·{" "}
          {formatDateTime(r.resolved_at)}
          {r.resolution && ` · ${r.resolution}`}
        </p>
      )}
    </li>
  );
}

/** Reports from users on profiles and comments. */
export default function ReportsTab({
  onOpenUser,
  onChanged,
}: Readonly<{
  onOpenUser: (username: string) => void;
  onChanged?: () => void;
}>) {
  const [status, setStatus] = useState<keyof typeof STATUS_LABELS>("open");
  const [targetType, setTargetType] = useState("");
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useAdminResource<ReportPage>(
    `/api/admin/reports${query({ status, target_type: targetType, limit: LIMIT, offset })}`,
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
          Жалобы пользователей
          {data && (
            <span className="font-mono text-xs font-normal text-fg-3">
              открытых: {data.open_count}
            </span>
          )}
        </PanelTitle>
        <p className="text-xs text-fg-2">
          Пользователи жалуются на профили и комментарии. Закрытие жалобы
          закрывает и остальные открытые жалобы на тот же профиль или
          комментарий. Бан и другие меры — в карточке пользователя.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Статус</span>
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
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>На что</span>
            <select
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value);
                setOffset(0);
              }}
              className={inputClass}
            >
              <option value="">Всё</option>
              <option value="user">Профили</option>
              <option value="comment">Комментарии</option>
            </select>
          </label>
        </div>
        <Notice text={notice || (error ? `❌ ${error}` : "")} />
      </div>

      <ul className="space-y-2">
        {(data?.items ?? []).map((r) => (
          <ReportItem
            key={r.id}
            r={r}
            onOpenUser={onOpenUser}
            onChanged={changed}
            run={run}
          />
        ))}
        {!loading && data?.items.length === 0 && (
          <li className="py-6 text-center text-xs text-fg-2">
            {status === "open" ? "Открытых жалоб нет" : "Жалоб нет"}
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
