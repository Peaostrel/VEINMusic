"use client";

import type { useRouter } from "next/navigation";

export interface ProfileActionsProps {
  isLogged: boolean;
  isMyProfile: boolean;
  isFollowing: boolean;
  hasImportedLastfm: boolean;
  username: string;
  importLoading: boolean;
  onFollow: () => void;
  onImport: () => void;
  onShowWrapped: () => void;
  onListenTogether: () => void;
  onShowCompatibility: () => void;
  router: ReturnType<typeof useRouter>;
}

export function ProfileActions({
  isLogged,
  isMyProfile,
  isFollowing,
  hasImportedLastfm,
  username,
  importLoading,
  onFollow,
  onImport,
  onShowWrapped,
  onListenTogether,
  onShowCompatibility,
  router,
}: Readonly<ProfileActionsProps>) {
  return (
    <div className="flex flex-wrap justify-end gap-4 mb-4 pt-4">
      {isLogged && !isMyProfile && (
        <button
          type="button"
          onClick={onFollow}
          className={`px-5 py-2.5 text-sm rounded-lg font-black transition-all flex items-center gap-2 ${isFollowing ? "bg-white/10 text-white hover:bg-white/20" : "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] shadow-[0_0_15px_var(--accent-glow)] hover:scale-105"}`}
        >
          {isFollowing ? "Отписаться" : "Подписаться"}
        </button>
      )}
      <button
        type="button"
        onClick={() => router.push(`/user/${username}/stats`)}
        className="bg-white/5 border border-white/10 text-white px-5 py-2.5 text-sm rounded-lg hover:bg-white/10 transition backdrop-blur-sm flex items-center gap-2 font-bold"
      >
        📊 Подробная статистика
      </button>
      {isMyProfile && (
        <button
          type="button"
          onClick={onImport}
          disabled={importLoading}
          className={`bg-red-500/10 border border-red-500/30 text-red-400 px-5 py-2.5 text-sm rounded-lg hover:bg-red-500/20 transition backdrop-blur-sm flex items-center gap-2 font-bold ${importLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          title="Импортировать историю из Last.fm"
        >
          {importLoading ? (
            <div className="animate-spin border-2 border-red-400 border-t-transparent rounded-full w-4 h-4"></div>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M10.584 17.21l-.88-2.392s-1.43 1.594-3.573 1.594c-1.897 0-3.244-1.649-3.244-4.288 0-3.382 1.704-4.591 3.381-4.591 2.42 0 3.189 1.567 3.849 3.574l.88 2.749c.88 2.666 2.529 4.81 7.285 4.81 3.409 0 5.718-1.044 5.718-3.793 0-2.227-1.265-3.381-3.63-3.931l-1.758-.385c-1.21-.275-1.567-.77-1.567-1.595 0-.934.742-1.484 1.952-1.484 1.32 0 2.034.495 2.144 1.677l2.749-.33c-.22-2.474-1.924-3.492-4.729-3.492-2.474 0-4.893.935-4.893 3.932 0 1.87.907 3.051 3.189 3.601l1.87.44c1.402.33 1.869.907 1.869 1.704 0 1.017-.99 1.43-2.86 1.43-2.776 0-3.93-1.457-4.59-3.464l-.907-2.75c-1.155-3.573-2.997-4.893-6.653-4.893C2.144 5.333 0 7.89 0 12.233c0 4.18 2.144 6.434 5.993 6.434 3.106 0 4.591-1.457 4.591-1.457z" />
            </svg>
          )}
          {importLoading
            ? "Запуск..."
            : hasImportedLastfm
              ? "Синхронизировать Last.fm"
              : "Импорт Last.fm"}
        </button>
      )}
      <button
        type="button"
        onClick={onShowWrapped}
        className="bg-white/5 border border-white/10 text-white px-5 py-2.5 text-sm rounded-lg hover:bg-white/10 transition backdrop-blur-sm flex items-center gap-2 font-bold"
      >
        📸 Поделиться
      </button>
      {!isMyProfile && isLogged && (
        <>
          <button
            type="button"
            onClick={onShowCompatibility}
            className="bg-purple-500/10 border border-purple-500/30 text-purple-300 px-5 py-2.5 text-sm rounded-lg hover:bg-purple-500/20 transition backdrop-blur-sm flex items-center gap-2 font-bold cursor-pointer"
          >
            ⚡ Совместимость
          </button>
          <button
            type="button"
            onClick={onListenTogether}
            className="bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--accent-text)] px-5 py-2.5 text-sm rounded-lg hover:bg-[var(--accent)]/20 transition backdrop-blur-sm flex items-center gap-2 font-bold"
          >
            🤝 Слушать вместе
          </button>
        </>
      )}
      {isMyProfile && (
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="bg-white/5 border border-white/10 text-white px-5 py-2.5 text-sm rounded-lg hover:bg-white/10 transition backdrop-blur-sm flex items-center gap-2 font-bold"
        >
          ⚙️ Настройки
        </button>
      )}
    </div>
  );
}
