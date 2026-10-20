"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { qualityRequest } from "@/app/lib/qualityApi";
import { btn } from "@/components/ui";
import { useT } from "@/app/lib/i18n/client";
interface Session {
  id: string;
  device: string;
  current: boolean;
  last_seen_at: string;
  created_at: string;
}
export default function BrowserSessions() {
  const t = useT();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [message, setMessage] = useState("");
  const [legacy, setLegacy] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    qualityRequest<{ items: Session[]; legacy_session: boolean }>(
      "/api/account/sessions",
    )
      .then((data) => {
        setSessions(data.items);
        setLegacy(data.legacy_session);
      })
      .catch((cause: unknown) =>
        setMessage(
          cause instanceof Error
            ? t(cause.message)
            : t("Не удалось загрузить устройства"),
        ),
      );
  }, [t]);
  const revoke = async (session: Session) => {
    setBusy(true);
    try {
      await qualityRequest(`/api/account/sessions/${session.id}`, {
        method: "DELETE",
      });
      if (session.current) router.push("/auth");
      else {
        setSessions((items) => items.filter((item) => item.id !== session.id));
        setMessage(t("Сессия завершена."));
      }
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? t(cause.message)
          : t("Не удалось завершить сессию"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border border-line p-4">
      <h3 className="font-semibold">{t("Браузеры и устройства")}</h3>
      <output aria-live="polite" className="block text-sm">
        {message}
      </output>
      {legacy && (
        <p className="text-sm text-fg-3">
          {t(
            "Этот вход сделан до появления списка устройств. Для отзыва старых входов используйте выход со всех устройств.",
          )}
        </p>
      )}
      {sessions.map((session) => (
        <div
          key={session.id}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"
        >
          <div>
            <p>
              {session.device
                .split(" · ")
                .map((part) => t(part))
                .join(" · ")}
              {session.current && ` · ${t("текущая сессия")}`}
            </p>
            <p className="text-xs text-fg-3">
              {t("Последняя активность: {time}", {
                time: new Date(session.last_seen_at).toLocaleString(t.locale),
              })}
            </p>
          </div>
          <button
            className={btn.secondary}
            disabled={busy}
            onClick={() => {
              void revoke(session);
            }}
          >
            {t("Завершить сессию")}
          </button>
        </div>
      ))}
    </section>
  );
}
