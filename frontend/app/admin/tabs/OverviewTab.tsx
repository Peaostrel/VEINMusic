"use client";

import { Users, Disc3, Server, Zap, Flame, Radio } from "lucide-react";
import type { AdminPanelState } from "../useAdminPanel";

export default function OverviewTab({
  tracks,
  totalScrobbles,
  totalUsers,
  health,
  analytics,
  xpMultiplier,
  handleSetMultiplier,
}: AdminPanelState) {
  return (
    <div className="space-y-6">
      {/* Quick Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#141418] border border-white/5 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-gray-400 text-xs font-mono mb-2">
            <span>ПОЛЬЗОВАТЕЛИ</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-black text-white">{totalUsers}</div>
          <div className="text-[11px] text-gray-400 mt-1">
            DAU: {analytics?.dau || 0} • MAU: {analytics?.mau || 0}
          </div>
        </div>

        <div className="bg-[#141418] border border-white/5 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-gray-400 text-xs font-mono mb-2">
            <span>СКРОББЛЫ (ВСЕГО)</span>
            <Disc3 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-white">
            {totalScrobbles.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-400 mt-1 font-mono">
            +{analytics?.scrobbles_24h || 0} за 24 часа
          </div>
        </div>

        <div className="bg-[#141418] border border-white/5 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-gray-400 text-xs font-mono mb-2">
            <span>ТРЕКОВ В БАЗЕ</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-white">{tracks.length}</div>
          <div className="text-[11px] text-gray-400 mt-1">
            Каталог нормализован
          </div>
        </div>

        <div className="bg-[#141418] border border-white/5 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-gray-400 text-xs font-mono mb-2">
            <span>WEBSOCKET КЛИЕНТЫ</span>
            <Radio className="w-4 h-4 text-red-500 animate-pulse" />
          </div>
          <div className="text-3xl font-black text-white">
            {health?.websockets.connected_clients || 0}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            В {health?.websockets.active_rooms || 0} комнатах
          </div>
        </div>
      </div>

      {/* System Services Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#141418] border border-white/5 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Server className="w-4 h-4 text-red-500" />
            Инфраструктура и База данных
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center p-3 bg-black/30 rounded-xl border border-white/5">
              <span className="text-gray-400">PostgreSQL Connection Pool</span>
              <span className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-mono font-bold rounded">
                ACTIVE (OK)
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-black/30 rounded-xl border border-white/5">
              <span className="text-gray-400">Синхронизация Яндекс.Музыки</span>
              <span className="font-mono text-white font-bold">
                {health?.cloud_scrobblers.yandex_users || 0} аккаунтов
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-black/30 rounded-xl border border-white/5">
              <span className="text-gray-400">Синхронизация Spotify</span>
              <span className="font-mono text-white font-bold">
                {health?.cloud_scrobblers.spotify_users || 0} аккаунтов
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[#141418] border border-white/5 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-500" />
            Глобальный множитель опыта (XP)
          </h3>
          <p className="text-gray-400 text-xs">
            Увеличьте опыт за скробблы для всех пользователей платформы
            (например, в честь выходных или ивентов).
          </p>

          <div className="flex items-center gap-3">
            {[1.0, 1.5, 2.0, 3.0].map((val) => (
              <button
                type="button"
                key={val}
                onClick={() => handleSetMultiplier(val)}
                className={`flex-1 py-2.5 rounded-xl font-mono font-bold text-xs transition cursor-pointer ${
                  xpMultiplier === val
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                    : "bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10"
                }`}
              >
                x{val.toFixed(1)} XP
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
