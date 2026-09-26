"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `poll` now and then every `intervalMs` while the tab is visible.
 * A hidden tab makes no requests; it refreshes as soon as it is shown again.
 */
export function useVisiblePolling(
  poll: () => void | Promise<void>,
  intervalMs: number,
  enabled = true,
) {
  const pollRef = useRef(poll);
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const run = () => {
      void pollRef.current();
    };
    const start = () => {
      timer ??= setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        run();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") {
      run();
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
