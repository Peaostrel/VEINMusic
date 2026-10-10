"use client";
import { useState } from "react";
import { jsonRequest, qualityRequest } from "@/app/lib/qualityApi";
import { btn } from "@/components/ui";
export default function SaveForLater({
  trackId,
}: Readonly<{ trackId: number }>) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await qualityRequest(
        `/api/me/listen-later/${trackId}`,
        jsonRequest("PUT", {}),
      );
      setMessage("В списке на потом");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Не удалось сохранить",
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
        Послушать позже
      </button>
      <output aria-live="polite" className="text-xs">
        {message}
      </output>
    </span>
  );
}
