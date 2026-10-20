"use client";

import { useState } from "react";
import { Flag, X } from "lucide-react";
import Dialog from "@/components/Dialog";
import { apiJson } from "@/app/lib/api";
import { useT } from "@/app/lib/i18n/client";
import { msg, type Translator } from "@/app/lib/i18n/core";
import { btn } from "@/components/ui";

export type ReportTarget =
  | { type: "user"; username: string }
  | { type: "comment"; commentId: number; author: string; text: string | null }
  | { type: "track"; trackId: number; title: string; artist: string };

const REASONS = [
  { id: "spam", label: msg("Спам или реклама") },
  { id: "abuse", label: msg("Оскорбления или травля") },
  { id: "inappropriate", label: msg("Неприемлемый контент") },
  { id: "cheating", label: msg("Накрутка прослушиваний") },
  { id: "impersonation", label: msg("Выдаёт себя за другого") },
  { id: "other", label: msg("Другое") },
] as const;

// Same as REASONS_BY_TARGET on the API (app/routers/reports.py)
const REASONS_BY_TARGET: Record<ReportTarget["type"], readonly string[]> = {
  user: REASONS.map((r) => r.id),
  comment: ["spam", "abuse", "inappropriate", "other"],
  track: ["spam", "inappropriate", "other"],
};

const TRACK_LABELS: Record<string, string> = {
  spam: msg("Спам или реклама в названии"),
  inappropriate: msg("Оскорбительное или неприемлемое название"),
};

function dialogTitle(target: ReportTarget, t: Translator): string {
  if (target.type === "comment")
    return t("Жалоба на комментарий @{user}", { user: target.author });
  if (target.type === "track")
    return t("Жалоба на трек «{artist} — {title}»", {
      artist: target.artist,
      title: target.title,
    });
  return t("Жалоба на профиль @{user}", { user: target.username });
}

/** Sends a report on a profile, a comment or a track to the moderators. */
export default function ReportDialog({
  target,
  onClose,
}: Readonly<{ target: ReportTarget; onClose: () => void }>) {
  const t = useT();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [repeated, setRepeated] = useState(false);
  const [error, setError] = useState("");
  const reasons = REASONS.filter((r) =>
    REASONS_BY_TARGET[target.type].includes(r.id),
  ).map((r) => ({
    ...r,
    label: (target.type === "track" && TRACK_LABELS[r.id]) || r.label,
  }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    setState("sending");
    setError("");
    try {
      const result = await apiJson<{ status: string }>("/api/reports", {
        method: "POST",
        json: {
          target_type: target.type,
          ...(target.type === "user" && { username: target.username }),
          ...(target.type === "comment" && { comment_id: target.commentId }),
          ...(target.type === "track" && { track_id: target.trackId }),
          reason,
          details: details.trim() || null,
        },
      });
      setRepeated(result.status === "already_reported");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Не удалось отправить"));
      setState("idle");
    }
  };

  const title = dialogTitle(target, t);

  return (
    <Dialog label={title} onClose={onClose}>
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Flag className="h-4 w-4 text-danger" aria-hidden="true" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Закрыть")}
            className={btn.icon}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {state === "done" ? (
          <div className="space-y-4">
            <p className="text-sm text-fg-2">
              {repeated
                ? t("Вы уже жаловались на это, жалоба ждёт модераторов.")
                : t("Спасибо, жалоба отправлена модераторам.")}{" "}
              {t("Когда её рассмотрят, придёт уведомление.")}
            </p>
            <button
              type="button"
              onClick={onClose}
              className={`${btn.primary} ${btn.md} w-full`}
            >
              {t("Готово")}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {target.type === "comment" && target.text && (
              <blockquote className="rounded-lg border border-line-soft bg-bg px-3 py-2 text-sm text-fg-2">
                «{target.text}»
              </blockquote>
            )}
            <fieldset className="space-y-1.5">
              <legend className="mb-2 text-xs text-fg-2">{t("Причина")}</legend>
              {reasons.map((r) => (
                <label
                  key={r.id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    reason === r.id
                      ? "border-accent text-fg"
                      : "border-line-soft text-fg-2 hover:text-fg"
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.id}
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                    className="accent-(--accent)"
                  />
                  {t(r.label)}
                </label>
              ))}
            </fieldset>
            <label className="block">
              <span className="mb-1.5 block text-xs text-fg-2">
                {t("Подробности (необязательно)")}
              </span>
              <textarea
                autoComplete="off"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full resize-none rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-fg outline-none transition-colors focus:border-fg-3"
              />
            </label>
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              type="submit"
              disabled={!reason || state === "sending"}
              className={`${btn.primary} ${btn.md} w-full`}
            >
              {state === "sending" ? t("Отправляем…") : t("Отправить жалобу")}
            </button>
          </form>
        )}
      </div>
    </Dialog>
  );
}
