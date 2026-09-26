"use client";
import React from "react";
import AutocompleteInput from "../components/AutocompleteInput";
import type { SettingsData, UpdateData } from "../types";

interface ShowcaseTabProps {
  data: SettingsData;
  updateData: UpdateData;
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
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-fg mb-4">Витрина профиля</h2>
      <p className="text-xs text-fg-2 mb-4 leading-relaxed">
        Настройте свои музыкальные редкости. Они будут отображаться в красивой
        секции на вашей публичной странице. Внимание: менять любимого артиста,
        трек и альбом можно не чаще 1 раза в 30 дней!
      </p>

      <div className="bg-surface p-5 rounded-xl border border-line-soft space-y-6">
        {/* АРТИСТ */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label
              htmlFor="fav-artist"
              className="block text-sm font-medium text-fg-2"
            >
              Любимый артист
            </label>
            {artistLock.isLocked && (
              <span className="text-xs font-medium text-danger px-2 py-1 rounded">
                Можно сменить через {artistLock.daysLeft} дн.
              </span>
            )}
          </div>
          <AutocompleteInput
            id="fav-artist"
            value={data.favArtist || ""}
            onChange={(val) => updateData("favArtist", val)}
            entityType="artist"
            disabled={artistLock.isLocked}
            className={`w-full p-3 rounded-lg text-fg border border-line-soft transition-colors outline-none ${artistLock.isLocked ? "bg-[#1f1f1f] opacity-60 cursor-not-allowed" : "bg-surface-2 focus:border-fg-3"}`}
            placeholder="Имя артиста (начните вводить...)"
          />
        </div>

        {/* ТРЕК */}
        <div className="pt-6 border-t border-line-soft space-y-3">
          <div className="flex justify-between items-center">
            <label
              htmlFor="fav-track"
              className="block text-sm font-medium text-fg-2"
            >
              Любимый трек
            </label>
            {trackLock.isLocked && (
              <span className="text-xs font-medium text-danger px-2 py-1 rounded">
                Можно сменить через {trackLock.daysLeft} дн.
              </span>
            )}
          </div>
          <AutocompleteInput
            id="fav-track"
            value={data.favTrack || ""}
            onChange={(val) => updateData("favTrack", val)}
            entityType="track"
            disabled={trackLock.isLocked}
            className={`w-full p-3 rounded-lg text-fg border border-line-soft transition-colors outline-none ${trackLock.isLocked ? "bg-[#1f1f1f] opacity-60 cursor-not-allowed" : "bg-surface-2 focus:border-fg-3"}`}
            placeholder="Имя артиста и название трека (например: Король и Шут — Лесник)"
          />
        </div>

        {/* АЛЬБОМ */}
        <div className="pt-6 border-t border-line-soft space-y-3">
          <div className="flex justify-between items-center">
            <label
              htmlFor="fav-album"
              className="block text-sm font-medium text-fg-2"
            >
              Любимый альбом
            </label>
            {albumLock.isLocked && (
              <span className="text-xs font-medium text-danger px-2 py-1 rounded">
                Можно сменить через {albumLock.daysLeft} дн.
              </span>
            )}
          </div>
          <AutocompleteInput
            id="fav-album"
            value={data.favAlbum || ""}
            onChange={(val) => updateData("favAlbum", val)}
            entityType="album"
            disabled={albumLock.isLocked}
            className={`w-full p-3 rounded-lg text-fg border border-line-soft transition-colors outline-none ${albumLock.isLocked ? "bg-[#1f1f1f] opacity-60 cursor-not-allowed" : "bg-surface-2 focus:border-fg-3"}`}
            placeholder="Имя артиста и название альбома (начните вводить...)"
          />
        </div>
      </div>
    </div>
  );
}
