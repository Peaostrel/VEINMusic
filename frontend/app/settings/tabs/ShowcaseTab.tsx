"use client";
import React from "react";
import AutocompleteInput from "../components/AutocompleteInput";

interface ShowcaseTabProps {
  data: any;
  updateData: (k: string, v: any) => void;
}

export default function ShowcaseTab({
  data,
  updateData,
}: Readonly<ShowcaseTabProps>) {
  const getLockInfo = (updatedAtStr: string | null) => {
    if (!updatedAtStr) return { isLocked: false, daysLeft: 0 };
    const updatedDate = new Date(updatedAtStr);
    const unlockDate = new Date(
      updatedDate.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const now = new Date();
    if (now < unlockDate) {
      const diffMs = unlockDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return { isLocked: true, daysLeft: diffDays };
    }
    return { isLocked: false, daysLeft: 0 };
  };

  const artistLock = getLockInfo(data.favArtistUpdatedAt);
  const trackLock = getLockInfo(data.favTrackUpdatedAt);
  const albumLock = getLockInfo(data.favAlbumUpdatedAt);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <h2 className="text-xl font-bold mb-4 text-[var(--accent-text)]">
        Витрина профиля
      </h2>
      <p className="text-xs text-gray-400 mb-4 leading-relaxed">
        Настройте свои музыкальные редкости. Они будут отображаться в красивой
        секции на вашей публичной странице. Внимание: менять любимого артиста,
        трек и альбом можно не чаще 1 раза в 30 дней!
      </p>

      <div className="bg-[#121212]/50 p-5 rounded-xl border border-white/5 space-y-6">
        {/* АРТИСТ */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label
              htmlFor="fav-artist"
              className="block text-sm font-bold text-gray-300"
            >
              🎤 Любимый артист
            </label>
            {artistLock.isLocked && (
              <span className="text-xs font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded">
                🔒 Заблокировано (осталось {artistLock.daysLeft} дн.)
              </span>
            )}
          </div>
          <AutocompleteInput
            id="fav-artist"
            value={data.favArtist || ""}
            onChange={(val) => updateData("favArtist", val)}
            entityType="artist"
            disabled={artistLock.isLocked}
            className={`w-full p-3 rounded-lg text-white border border-white/5 transition-colors outline-none ${artistLock.isLocked ? "bg-[#1f1f1f] opacity-60 cursor-not-allowed" : "bg-[#282828]/80 focus:border-[var(--accent)]"}`}
            placeholder="Имя артиста (начните вводить...)"
          />
        </div>

        {/* ТРЕК */}
        <div className="pt-6 border-t border-white/5 space-y-3">
          <div className="flex justify-between items-center">
            <label
              htmlFor="fav-track"
              className="block text-sm font-bold text-gray-300"
            >
              🎵 Любимый трек
            </label>
            {trackLock.isLocked && (
              <span className="text-xs font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded">
                🔒 Заблокировано (осталось {trackLock.daysLeft} дн.)
              </span>
            )}
          </div>
          <AutocompleteInput
            id="fav-track"
            value={data.favTrack || ""}
            onChange={(val) => updateData("favTrack", val)}
            entityType="track"
            disabled={trackLock.isLocked}
            className={`w-full p-3 rounded-lg text-white border border-white/5 transition-colors outline-none ${trackLock.isLocked ? "bg-[#1f1f1f] opacity-60 cursor-not-allowed" : "bg-[#282828]/80 focus:border-[var(--accent)]"}`}
            placeholder="Имя артиста и название трека (например: Король и Шут — Лесник)"
          />
        </div>

        {/* АЛЬБОМ */}
        <div className="pt-6 border-t border-white/5 space-y-3">
          <div className="flex justify-between items-center">
            <label
              htmlFor="fav-album"
              className="block text-sm font-bold text-gray-300"
            >
              💿 Любимый альбом
            </label>
            {albumLock.isLocked && (
              <span className="text-xs font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded">
                🔒 Заблокировано (осталось {albumLock.daysLeft} дн.)
              </span>
            )}
          </div>
          <AutocompleteInput
            id="fav-album"
            value={data.favAlbum || ""}
            onChange={(val) => updateData("favAlbum", val)}
            entityType="album"
            disabled={albumLock.isLocked}
            className={`w-full p-3 rounded-lg text-white border border-white/5 transition-colors outline-none ${albumLock.isLocked ? "bg-[#1f1f1f] opacity-60 cursor-not-allowed" : "bg-[#282828]/80 focus:border-[var(--accent)]"}`}
            placeholder="Имя артиста и название альбома (начните вводить...)"
          />
        </div>
      </div>
    </div>
  );
}
