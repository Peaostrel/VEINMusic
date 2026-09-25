import type { SyntheticEvent } from "react";

/**
 * `onError` handler that swaps in a fallback image exactly once. Setting
 * `src` unconditionally loops forever (thousands of requests) when the
 * fallback fails too, e.g. behind an ad blocker or while dicebear is down.
 */
export function fallbackOnce(fallback: string) {
  return (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.dataset.fallbackApplied === "1") return;
    img.dataset.fallbackApplied = "1";
    img.src = fallback;
  };
}
