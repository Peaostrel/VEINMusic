"use client";

import { Users, Disc3, Server, Zap, Flame, Radio } from "lucide-react";
import type { AdminPanelState } from "../useAdminPanel";
import QualityMetrics from "../components/QualityMetrics";
import AnalyticsCharts from "../components/AnalyticsCharts";

export default function OverviewTab({
  tracks,
  totalScrobbles,
  totalUsers,
  health,
  analytics,
  xpMultiplier,
  handleSetMultiplier,
}: Readonly<AdminPanelState>) {
  return (
    <div className="space-y-6">
      <AnalyticsCharts />
      <QualityMetrics />
      {/* Quick Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-line-soft p-5 rounded-xl">
          <div className="flex items-center justify-between text-fg-2 text-xs font-mono mb-2">
            <span>Пользователи</span>
            <Users className="w-4 h-4 text-fg-3" />
          </div>
          <div className="text-3xl font-semibold text-fg">{totalUsers}</div>
          <div className="text-[11px] text-fg-2 mt-1">
            DAU: {analytics?.dau || 0} • MAU: {analytics?.mau || 0}
          </div>
        </div>

        <div className="bg-surface border border-line-soft p-5 rounded-xl">
          <div className="flex items-center justify-between text-fg-2 text-xs font-mono mb-2">
            <span>Скробблы (всего)</span>
            <Disc3 className="w-4 h-4 text-fg-3" />
          </div>
          <div className="text-3xl font-semibold text-fg">
            {totalScrobbles.toLocaleString()}
          </div>
          <div className="text-[11px] text-ok mt-1 font-mono">
            +{analytics?.scrobbles_24h || 0} за 24 часа
          </div>
        </div>

        <div className="bg-surface border border-line-soft p-5 rounded-xl">
          <div className="flex items-center justify-between text-fg-2 text-xs font-mono mb-2">
            <span>Треков в базе</span>
            <Zap className="w-4 h-4 text-fg-3" />
          </div>
          <div className="text-3xl font-semibold text-fg">{tracks.length}</div>
          <div className="text-[11px] text-fg-2 mt-1">Каталог нормализован</div>
        </div>

        <div className="bg-surface border border-line-soft p-5 rounded-xl">
          <div className="flex items-center justify-between text-fg-2 text-xs font-mono mb-2">
            <span>WebSocket-клиенты</span>
            <Radio className="w-4 h-4 text-fg-3" />
          </div>
          <div className="text-3xl font-semibold text-fg">
            {health?.websockets.connected_clients || 0}
          </div>
          <div className="text-[11px] text-fg-2 mt-1">
            В {health?.websockets.active_rooms || 0} комнатах
          </div>
        </div>
      </div>

      {/* System Services Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface border border-line-soft p-6 rounded-xl space-y-4">
          <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
            <Server className="w-4 h-4 text-fg-3" />
            Инфраструктура и База данных
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center p-3 bg-bg rounded-xl border border-line-soft">
              <span className="text-fg-2">PostgreSQL Connection Pool</span>
              <span className="px-2 py-0.5 border border-line text-ok font-mono font-medium rounded">
                ACTIVE (OK)
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-bg rounded-xl border border-line-soft">
              <span className="text-fg-2">Синхронизация Яндекс.Музыки</span>
              <span className="font-mono text-fg font-medium">
                {health?.cloud_scrobblers.yandex_users || 0} аккаунтов
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-bg rounded-xl border border-line-soft">
              <span className="text-fg-2">Синхронизация Spotify</span>
              <span className="font-mono text-fg font-medium">
                {health?.cloud_scrobblers.spotify_users || 0} аккаунтов
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-bg rounded-xl border border-line-soft">
              <span className="text-fg-2">Синхронизация SoundCloud</span>
              <span className="font-mono text-fg font-medium">
                {health?.cloud_scrobblers.soundcloud_users || 0} аккаунтов
              </span>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-line-soft p-6 rounded-xl space-y-4">
          <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
            <Flame className="w-4 h-4 text-fg-3" />
            Глобальный множитель опыта (XP)
          </h3>
          <p className="text-fg-2 text-xs">
            Увеличьте опыт за скробблы для всех пользователей платформы
            (например, в честь выходных или ивентов). Действует на
            прослушивания, засчитанные после изменения; уже набранный опыт не
            пересчитывается.
          </p>

          <div className="flex items-center gap-3">
            {[1.0, 1.5, 2.0, 3.0].map((val) => (
              <button
                type="button"
                key={val}
                onClick={() => handleSetMultiplier(val)}
                className={`flex-1 py-2.5 rounded-xl font-mono font-medium text-xs transition cursor-pointer ${
                  xpMultiplier === val
                    ? "bg-line text-fg"
                    : "bg-surface-2 hover:bg-line text-fg-2 border border-line"
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
