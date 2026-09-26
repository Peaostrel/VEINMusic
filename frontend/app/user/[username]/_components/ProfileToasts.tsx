"use client";

import type { ProfileViewProps } from "./useProfilePage";

export function ProfileToasts({ toasts, removeToast }: ProfileViewProps) {
  return (
    <>
      <div className="fixed top-24 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-[#121212]/95 backdrop-blur-md border border-[var(--accent)]/50 p-4 rounded-xl shadow-[0_0_30px_var(--accent-glow)] flex items-center gap-4 w-80 pointer-events-auto relative overflow-hidden transition-all duration-300"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[var(--accent)] to-[var(--accent-hover)]"></div>
            <div className="w-14 h-14 bg-black rounded-lg flex items-center justify-center text-3xl shrink-0 overflow-hidden border border-white/10 shadow-inner">
              {t.image ? (
                <img
                  src={t.image}
                  className="w-full h-full object-cover"
                  alt={t.name}
                />
              ) : (
                t.icon
              )}
            </div>
            <div className="flex-grow">
              <div className="text-[10px] text-[var(--accent-text)] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Достижение получено!
              </div>
              <div className="text-white font-black text-sm leading-tight">
                {t.name}
              </div>
              {t.xp > 0 && (
                <div className="text-emerald-400 font-mono text-[11px] font-bold mt-1 bg-emerald-500/10 px-1.5 py-0.5 inline-block rounded">
                  +{t.xp} XP
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Закрыть уведомление"
              className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
