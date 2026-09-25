"use client";

import { Users, Disc3, Search } from "lucide-react";
import type { AdminPanelState } from "../useAdminPanel";

export default function CatalogTab({
  trackSearch,
  setTrackSearch,
  sourceTrackId,
  setSourceTrackId,
  targetTrackId,
  setTargetTrackId,
  sourceArtist,
  setSourceArtist,
  targetArtist,
  setTargetArtist,
  handleMergeTracks,
  handleMergeArtists,
  filteredTracks,
}: AdminPanelState) {
  return (
    <div className="space-y-8">
      {/* Merge Duplicates Tool */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <form
          onSubmit={handleMergeTracks}
          className="bg-[#141418] border border-white/5 p-6 rounded-2xl space-y-4"
        >
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Disc3 className="w-4 h-4 text-red-500" />
            Слияние треков-дубликатов (Track Alias)
          </h3>
          <p className="text-xs text-gray-400">
            Переносит все скробблы с исходного ID на канонический ID и создает
            алиас для будущих скробблов.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-[10px] font-mono text-gray-400 uppercase">
                Исходный ID (Дубликат)
              </span>
              <input
                type="number"
                placeholder="Напр. 1045"
                value={sourceTrackId}
                onChange={(e) => setSourceTrackId(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
              />
            </div>
            <div>
              <span className="block text-[10px] font-mono text-gray-400 uppercase">
                Канонический ID (Основной)
              </span>
              <input
                type="number"
                placeholder="Напр. 42"
                value={targetTrackId}
                onChange={(e) => setTargetTrackId(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Объединить треки и создать алиас
          </button>
        </form>

        <form
          onSubmit={handleMergeArtists}
          className="bg-[#141418] border border-white/5 p-6 rounded-2xl space-y-4"
        >
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" />
            Слияние имен исполнителей
          </h3>
          <p className="text-xs text-gray-400">
            Обновляет все треки и скробблы, заменяя опечатки или альтернативные
            написания имени артиста.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-[10px] font-mono text-gray-400 uppercase">
                Старое имя (с опечаткой)
              </span>
              <input
                type="text"
                placeholder="Напр. The Weekndd"
                value={sourceArtist}
                onChange={(e) => setSourceArtist(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
              />
            </div>
            <div>
              <span className="block text-[10px] font-mono text-gray-400 uppercase">
                Правильное имя
              </span>
              <input
                type="text"
                placeholder="Напр. The Weeknd"
                value={targetArtist}
                onChange={(e) => setTargetArtist(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Нормализовать имя исполнителя
          </button>
        </form>
      </div>

      {/* Tracks Browser */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по названию или исполнителю..."
              value={trackSearch}
              onChange={(e) => setTrackSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#141418] border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
            />
          </div>
          <span className="text-xs text-gray-500 font-mono">
            Треков: {filteredTracks.length}
          </span>
        </div>

        <div className="bg-[#141418] border border-white/5 rounded-2xl overflow-hidden max-h-[500px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#0f0f12] text-gray-400 font-mono uppercase text-[11px] sticky top-0 z-10 border-b border-white/5">
              <tr>
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Трек</th>
                <th className="py-3 px-4">Исполнитель</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTracks.slice(0, 150).map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.02] transition">
                  <td className="py-2.5 px-4 font-mono text-gray-500">
                    #{t.id}
                  </td>
                  <td className="py-2.5 px-4 font-bold text-white">
                    {t.title}
                  </td>
                  <td className="py-2.5 px-4 text-gray-400">{t.artist}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
