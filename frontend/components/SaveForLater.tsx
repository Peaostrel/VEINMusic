"use client";
import { useState } from "react";
import { useT } from "@/app/lib/i18n/client";
import { jsonRequest, qualityRequest } from "@/app/lib/qualityApi";
import { btn } from "@/components/ui";
export default function SaveForLater({
  trackId,
}: Readonly<{ trackId: number }>) {
  const t = useT();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await qualityRequest(
        `/api/me/listen-later/${trackId}`,
        jsonRequest("PUT", {}),
      );
      setMessage(t("В списке на потом"));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : t("Не удалось сохранить"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className={`${btn.secondary} ${btn.sm}`}
        disabled={busy}
        onClick={() => {
          void save();
        }}
      >
        {t("Послушать позже")}
      </button>
      <output aria-live="polite" className="text-xs">
        {message}
      </output>
    </span>
  );
}
