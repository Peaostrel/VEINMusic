"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { LogoTile } from "@/components/brand";

const DISMISSED_KEY = "vein_pwa_banner_dismissed_at";
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

/** Chromium's install prompt event (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWARegistration() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    let reloadingForUpdate = false;
    // The first install also fires controllerchange. Reloading at that point
    // interrupts forms and dialogs; only reload pages that were already
    // controlled by an older worker and are genuinely receiving an update.
    const wasControlled = Boolean(navigator.serviceWorker?.controller);
    const handleControllerChange = () => {
      if (!wasControlled || reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    };

    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange,
      );
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          console.log("[PWA] Service Worker registered with scope:", reg.scope);
          return reg.update();
        })
        .catch((err) => {
          console.warn("[PWA] Service Worker registration failed:", err);
        });
    }

    // 2. Capture install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      const standalone = globalThis.matchMedia?.(
        "(display-mode: standalone)",
      ).matches;
      const dismissed = Number(localStorage.getItem(DISMISSED_KEY) || 0);
      if (!standalone && Date.now() - dismissed > DISMISS_MS)
        setShowInstallBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "pwa-banner-visible",
      showInstallBanner,
    );
    return () =>
      document.documentElement.classList.remove("pwa-banner-visible");
  }, [showInstallBanner]);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setShowInstallBanner(false);
    }
    setInstallPrompt(null);
  };

  if (!showInstallBanner) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setShowInstallBanner(false);
  };

  return (
    <div className="fixed right-3 bottom-20 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col gap-2 sm:right-4 sm:max-w-sm lg:bottom-4">
      {showInstallBanner && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
          <LogoTile size={40} />
          <div className="flex-grow min-w-0">
            <p className="text-sm font-medium text-fg">Установить VEINMusic</p>
            <p className="text-xs text-fg-2">Быстрый доступ и оффлайн-режим</p>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            className="h-8 shrink-0 rounded-lg bg-accent px-3 text-xs font-medium text-on-accent hover:brightness-110"
          >
            Установить
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 rounded p-1 text-fg-3 hover:text-fg"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
