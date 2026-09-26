"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { LogoTile } from "@/components/brand";

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
    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[PWA] Service Worker registered with scope:", reg.scope);
        })
        .catch((err) => {
          console.warn("[PWA] Service Worker registration failed:", err);
        });
    }

    // 2. Capture install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

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

  return (
    <div className="fixed bottom-20 right-4 z-50 flex max-w-sm flex-col gap-2 lg:bottom-4">
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
            onClick={() => setShowInstallBanner(false)}
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
