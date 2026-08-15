"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export default function PWARegistration() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
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
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
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
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {showInstallBanner && (
        <div className="bg-[#18181b]/95 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center text-black font-black shrink-0">
            V
          </div>
          <div className="flex-grow min-w-0">
            <p className="text-white font-bold text-sm">Установить VEINMusic</p>
            <p className="text-gray-400 text-xs">
              Быстрый доступ и оффлайн-режим
            </p>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            className="bg-yellow-500 hover:bg-yellow-400 text-black px-3 py-1.5 rounded-lg text-xs font-black shrink-0 transition-colors"
          >
            Установить
          </button>
          <button
            type="button"
            onClick={() => setShowInstallBanner(false)}
            className="text-gray-500 hover:text-white shrink-0 p-1"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
