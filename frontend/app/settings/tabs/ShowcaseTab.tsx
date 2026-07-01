"use client";
import React from "react";

interface StarRatingProps {
  value: number;
  onChange: (v: number) => void;
}

function StarRating({ value, onChange }: Readonly<StarRatingProps>) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`text-2xl transition-all duration-200 outline-none ${
            star <= (value || 0)
              ? "text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.6)] scale-110"
              : "text-gray-600 hover:text-gray-400 hover:scale-105"
          }`}
        >
          ★
        </button>
      ))}
      {value > 0 && (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="text-xs text-gray-500 hover:text-red-400 ml-2"
        >
          Сбросить
        </button>
      )}
    </div>
  );
}

interface ShowcaseTabProps {
  data: any;
  updateData: (k: string, v: any) => void;
}

export default function ShowcaseTab({
  data,
  updateData,
}: Readonly<ShowcaseTabProps>) {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <h2 className="text-xl font-bold mb-4 text-[var(--accent-text)]">
        Витрина профиля
      </h2>
      <p className="text-xs text-gray-400 mb-4 leading-relaxed">
        Настройте свои музыкальные редкости с оценками и мини-обзорами. Они
        будут отображаться в красивой секции на вашей публичной странице.
      </p>

      <div className="bg-[#121212]/50 p-5 rounded-xl border border-white/5 space-y-6">
        {/* АРТИСТ */}
        <div className="space-y-3">
          <label
            htmlFor="fav-artist"
            className="block text-sm font-bold text-gray-300"
          >
            🎤 Любимый артист
          </label>
          <input
            id="fav-artist"
            value={data.favArtist || ""}
            onChange={(e) => updateData("favArtist", e.target.value)}
            className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none"
            placeholder="Имя артиста (например: Король и Шут)"
          />
          <div className="grid grid-cols-1 gap-3 pt-2">
            <div>
              <span className="block text-xs font-bold text-gray-400 mb-1">
                Оценка артиста
              </span>
              <StarRating
                value={data.favArtistRating || 0}
                onChange={(v) => updateData("favArtistRating", v)}
              />
            </div>
            <div>
              <label
                htmlFor="fav-artist-review"
                className="block text-xs font-bold text-gray-400 mb-1"
              >
                Мини-обзор / Мнение об артисте
              </label>
              <textarea
                id="fav-artist-review"
                value={data.favArtistReview || ""}
                onChange={(e) => updateData("favArtistReview", e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none text-sm resize-none"
                placeholder="Что вам больше всего нравится в творчестве этого исполнителя?..."
              />
            </div>
          </div>
        </div>

        {/* ТРЕК */}
        <div className="pt-6 border-t border-white/5 space-y-3">
          <label
            htmlFor="fav-track-name"
            className="block text-sm font-bold text-gray-300"
          >
            🎵 Любимый трек
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={data.favTrackArtist || ""}
              onChange={(e) => updateData("favTrackArtist", e.target.value)}
              className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none"
              placeholder="Имя артиста"
            />
            <input
              id="fav-track-name"
              value={data.favTrackName || ""}
              onChange={(e) => updateData("favTrackName", e.target.value)}
              className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none"
              placeholder="Название трека"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 pt-2">
            <div>
              <span className="block text-xs font-bold text-gray-400 mb-1">
                Оценка трека
              </span>
              <StarRating
                value={data.favTrackRating || 0}
                onChange={(v) => updateData("favTrackRating", v)}
              />
            </div>
            <div>
              <label
                htmlFor="fav-track-review"
                className="block text-xs font-bold text-gray-400 mb-1"
              >
                Мини-обзор / Мнение о треке
              </label>
              <textarea
                id="fav-track-review"
                value={data.favTrackReview || ""}
                onChange={(e) => updateData("favTrackReview", e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none text-sm resize-none"
                placeholder="Расскажите историю вашей любви к этой песне..."
              />
            </div>
          </div>
        </div>

        {/* АЛЬБОМ */}
        <div className="pt-6 border-t border-white/5 space-y-3">
          <label
            htmlFor="fav-album-name"
            className="block text-sm font-bold text-gray-300"
          >
            💿 Любимый альбом
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={data.favAlbumArtist || ""}
              onChange={(e) => updateData("favAlbumArtist", e.target.value)}
              className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none"
              placeholder="Имя артиста"
            />
            <input
              id="fav-album-name"
              value={data.favAlbumName || ""}
              onChange={(e) => updateData("favAlbumName", e.target.value)}
              className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none"
              placeholder="Название альбома"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 pt-2">
            <div>
              <span className="block text-xs font-bold text-gray-400 mb-1">
                Оценка альбома
              </span>
              <StarRating
                value={data.favAlbumRating || 0}
                onChange={(v) => updateData("favAlbumRating", v)}
              />
            </div>
            <div>
              <label
                htmlFor="fav-album-review"
                className="block text-xs font-bold text-gray-400 mb-1"
              >
                Мини-обзор / Мнение об альбоме
              </label>
              <textarea
                id="fav-album-review"
                value={data.favAlbumReview || ""}
                onChange={(e) => updateData("favAlbumReview", e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full p-3 rounded-lg bg-[#282828]/80 text-white border border-white/5 focus:border-[var(--accent)] transition-colors outline-none text-sm resize-none"
                placeholder="Чем вас зацепил этот альбом? Любимый треклист?..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
