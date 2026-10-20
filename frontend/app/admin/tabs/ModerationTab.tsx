"use client";

import { useT } from "@/app/lib/i18n/client";
import { useState } from "react";
import { MessageSquareWarning, Trash2, UserRound } from "lucide-react";
import type { AdminComment, Paged } from "../types";
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

/** Latest comments: search, open the author, delete. */
export default function ModerationTab({
  onOpenUser,
}: Readonly<{ onOpenUser: (username: string) => void }>) {
  const t = useT();
  const [q, setQ] = useState("");
  const [username, setUsername] = useState("");
  const [offset, setOffset] = useState(0);
  const { data, error, reload } = useAdminResource<Paged<AdminComment>>(
    `/api/admin/comments${query({ q, username, limit: LIMIT, offset })}`,
  );
  const { notice, run } = useNotice();

  const remove = async (c: AdminComment) => {
    if (
      !confirm(
        t("Удалить комментарий @{username}?", { username: c.author.username }) +
          `\n\n«${c.content}»`,
      )
    )
      return;
    if (
      await run(
        () => adminRequest(`/api/admin/comments/${c.id}`, { method: "DELETE" }),
        t("Комментарий удалён"),
      )
    )
      reload();
  };

  return (
    <div className="space-y-4">
      <div className={panelClass}>
        <PanelTitle
          icon={
            <MessageSquareWarning
              className="w-4 h-4 text-danger"
              aria-hidden="true"
            />
          }
        >
          {t("Модерация комментариев")}
        </PanelTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label>
            <span className={labelClass}>{t("Текст")}</span>
            <input
              autoComplete="off"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
              placeholder={t("Поиск по тексту")}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>{t("Автор")}</span>
            <input
              autoComplete="off"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value.trim());
                setOffset(0);
              }}
              placeholder={t("ник")}
              className={inputClass}
            />
          </label>
        </div>
        <Notice text={notice || (error ? `❌ ${error}` : "")} />
      </div>

      <ul className="space-y-2">
        {(data?.items ?? []).map((c) => (
          <li
            key={c.id}
            className="bg-surface border border-line-soft rounded-xl p-4 flex flex-col sm:flex-row gap-3 sm:items-start"
          >
            <div className="flex-1 min-w-0 space-y-1">
              <div className="text-xs text-fg-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenUser(c.author.username)}
                  className="font-medium text-fg hover:text-accent inline-flex items-center gap-1"
                >
                  <UserRound className="w-3.5 h-3.5" aria-hidden="true" />@
                  {c.author.username}
                </button>
                {c.author.is_banned && (
                  <span className="px-1.5 rounded text-danger text-[10px] font-medium">
                    {t("БАН")}
                  </span>
                )}
                <span className="font-mono">
                  {formatDateTime(c.created_at)}
                </span>
                {c.scrobble && (
                  <span>
                    {t("к «{track}» у @{owner}", {
                      track: `${c.scrobble.artist} — ${c.scrobble.title}`,
                      owner: c.scrobble.owner,
                    })}
                  </span>
                )}
              </div>
              <p className="text-sm text-fg break-words whitespace-pre-wrap">
                {c.content}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(c)}
              className={`${buttonClass.danger} inline-flex items-center gap-1 shrink-0`}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              {t("Удалить")}
            </button>
          </li>
        ))}
        {data?.items.length === 0 && (
          <li className="text-center text-fg-2 text-xs py-6">
            {t("Комментариев нет")}
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
