"use client";

import { useState } from "react";
import { Flag, X } from "lucide-react";
import Dialog from "@/components/Dialog";
import { apiJson } from "@/app/lib/api";
import { btn } from "@/components/ui";

export type ReportTarget =
  | { type: "user"; username: string }
  | { type: "comment"; commentId: number; author: string; text: string | null };

const REASONS = [
  { id: "spam", label: "Спам или реклама" },
  { id: "abuse", label: "Оскорбления или травля" },
  { id: "inappropriate", label: "Неприемлемый контент" },
  { id: "cheating", label: "Накрутка прослушиваний" },
  { id: "impersonation", label: "Выдаёт себя за другого" },
  { id: "other", label: "Другое" },
] as const;

/** Sends a report on a profile or a comment to the moderators. */
export default function ReportDialog({
  target,
  onClose,
}: Readonly<{ target: ReportTarget; onClose: () => void }>) {
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const reasons =
    target.type === "comment"
      ? REASONS.filter((r) => r.id !== "cheating" && r.id !== "impersonation")
      : REASONS;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    setState("sending");
    setError("");
    try {
      await apiJson("/api/reports", {
        method: "POST",
        json: {
          target_type: target.type,
          ...(target.type === "user"
            ? { username: target.username }
            : { comment_id: target.commentId }),
          reason,
          details: details.trim() || null,
        },
      });
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить");
      setState("idle");
    }
  };

  const title =
    target.type === "user"
      ? `Жалоба на профиль @${target.username}`
      : `Жалоба на комментарий @${target.author}`;

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
            aria-label="Закрыть"
            className={btn.icon}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {state === "done" ? (
          <div className="space-y-4">
            <p className="text-sm text-fg-2">
              Спасибо, жалоба отправлена модераторам. Мы посмотрим её в
              ближайшее время.
            </p>
            <button
              type="button"
              onClick={onClose}
              className={`${btn.primary} ${btn.md} w-full`}
            >
              Готово
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
              <legend className="mb-2 text-xs text-fg-2">Причина</legend>
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
                  {r.label}
                </label>
              ))}
            </fieldset>
            <label className="block">
              <span className="mb-1.5 block text-xs text-fg-2">
                Подробности (необязательно)
              </span>
              <textarea
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
              {state === "sending" ? "Отправляем…" : "Отправить жалобу"}
            </button>
          </form>
        )}
      </div>
    </Dialog>
  );
}
