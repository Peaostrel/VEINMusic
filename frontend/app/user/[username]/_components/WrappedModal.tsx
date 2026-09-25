"use client";

import { VerifiedBadge } from "../../../Navbar";
import type { ProfileViewProps } from "./useProfilePage";
import { fallbackOnce } from "@/app/lib/img";

export function WrappedModal({
  data,
  showWrapped,
  setShowWrapped,
  u,
  fallbackAvatar,
}: ProfileViewProps) {
  return (
    <>
      {showWrapped && (
        <dialog
          open
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm border-0 bg-transparent outline-none w-full h-full"
        >
          <button
            type="button"
            className="absolute inset-0 w-full h-full cursor-default border-none bg-transparent outline-none"
            aria-label="Закрыть"
            onClick={() => setShowWrapped(false)}
          />
          <div className="bg-[#1a1a1a] rounded-2xl w-[400px] h-[600px] shadow-2xl overflow-hidden relative border border-white/10 p-6 flex flex-col justify-between z-10">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[var(--accent)]/20 to-transparent opacity-50 z-0 pointer-events-none"></div>
            <div className="z-10 text-center relative">
              <div
                className={`w-24 h-24 mx-auto bg-[#333] rounded-full overflow-hidden border-4 border-[var(--accent)] shadow-[0_0_20px_var(--accent-glow)] mb-4`}
              >
                <img
                  src={u.avatar_url || fallbackAvatar}
                  className="w-full h-full object-cover"
                  alt={u.display_name}
                  onError={fallbackOnce(fallbackAvatar)}
                />
              </div>
              <h2 className="text-3xl font-black text-white flex items-center justify-center">
                {u.display_name}{" "}
                <VerifiedBadge role={u.role} isVerified={u.is_verified} />
              </h2>
              <p className="text-[var(--accent-text)] font-bold mt-1">
                @VEIN Music
              </p>
            </div>
            <div className="z-10 bg-[#121212]/80 p-4 rounded-xl border border-white/5 backdrop-blur-md">
              <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-3">
                Любимые артисты
              </h3>
              {data.stats.top_artists?.slice(0, 3).map((a: any) => (
                <div
                  key={a.artist}
                  className="flex justify-between items-center mb-2 border-l-2 border-[var(--accent)] pl-2"
                >
                  <span className="font-bold truncate text-sm text-white">
                    {a.artist}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {a.plays} plays
                  </span>
                </div>
              ))}
            </div>
            <div className="z-10 text-center text-xs text-gray-500 mt-4">
              Сделай скриншот и закинь в сторис! <br />
              <button
                type="button"
                onClick={() => setShowWrapped(false)}
                className="text-[var(--accent-text)] mt-2 hover:underline font-bold border-none bg-transparent outline-none"
              >
                Закрыть
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
