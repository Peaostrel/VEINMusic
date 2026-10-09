"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Says that the page shows saved data while the device is offline. */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    globalThis.addEventListener("online", update);
    globalThis.addEventListener("offline", update);
    return () => {
      globalThis.removeEventListener("online", update);
      globalThis.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <output
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b border-line-soft bg-surface px-4 py-2 text-center text-xs text-fg-2"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Нет соединения: показаны сохранённые данные, новые прослушивания появятся,
      когда интернет вернётся.
    </output>
  );
}
