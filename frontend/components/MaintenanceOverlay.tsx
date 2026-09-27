"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/app/lib/api";
import { LogoTile } from "@/components/brand";

const POLL_MS = 5000;
const MAINTENANCE_HEADER = "x-maintenance";

/** The server marks its "update in progress" answers with this header
 * (see deploy/Caddyfile). */
function isMarked(res: Response) {
  return res.headers.get(MAINTENANCE_HEADER) === "1";
}

/** A 502/504 may be a restarting container or just one endpoint's failing
 * upstream (the country list, for one): worth asking /health. */
function isGatewayError(res: Response) {
  return res.status === 502 || res.status === 504;
}

async function serverUpdating(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    return isMarked(res) || isGatewayError(res);
  } catch {
    // Unreachable: restarting, unless the device itself is offline
    return navigator.onLine;
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Full-screen "update in progress" notice while the server deploys a new
 * version. It watches the page's own API requests; once the API answers
 * normally again, the page reloads to pick up the new version.
 */
export default function MaintenanceOverlay() {
  const [updating, setUpdating] = useState(false);
  const checking = useRef(false);

  useEffect(() => {
    const original = window.fetch;
    const check = async () => {
      if (checking.current) return;
      checking.current = true;
      if (await serverUpdating()) setUpdating(true);
      checking.current = false;
    };
    window.fetch = async (input, init) => {
      const toApi = requestUrl(input).startsWith(API_URL);
      try {
        const res = await original(input, init);
        if (toApi && isMarked(res)) setUpdating(true);
        else if (toApi && isGatewayError(res)) void check();
        return res;
      } catch (e) {
        // A failed request (CORS on an error page, connection refused) may
        // mean the server is restarting: ask /health before saying so
        if (toApi) void check();
        throw e;
      }
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  useEffect(() => {
    if (!updating) return;
    const timer = window.setInterval(async () => {
      if (!(await serverUpdating())) window.location.reload();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [updating]);

  if (!updating) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="maintenance-title"
      aria-describedby="maintenance-text"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/90 p-6 backdrop-blur-sm"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-8 py-10 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <LogoTile size={44} />
        <h2 id="maintenance-title" className="text-lg font-semibold">
          Идёт обновление
        </h2>
        <p id="maintenance-text" className="text-sm leading-relaxed text-fg-2">
          Мы выкатываем новую версию VEINMusic. Пожалуйста, подождите — это
          займёт около минуты, страница обновится сама.
        </p>
        <span className="flex gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
