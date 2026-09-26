"use client";

import { ShieldAlert, CheckCircle, RotateCcw } from "lucide-react";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import type { AdminPanelState } from "../useAdminPanel";

export default function AntifraudTab({
  suspiciousUsers,
  handleToggleBan,
  handleResetSuspiciousXp,
  handleUnflagAntifraud,
}: AdminPanelState) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-5 bg-[#141418] border border-red-500/20 rounded-2xl">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-red-500" />
          <div>
            <h3 className="font-bold text-white text-sm">
              Система автоматического обнаружения накрутки
            </h3>
            <p className="text-gray-400 text-xs">
              Алгоритм анализирует скорость скробблинга (&gt;70 треков/час) и
              короткие треки (&lt;20с).
            </p>
          </div>
        </div>
        <span className="px-3 py-1 bg-red-500/20 text-red-300 font-mono text-xs font-bold rounded-lg">
          {suspiciousUsers.length} флагов
        </span>
      </div>

      {suspiciousUsers.length === 0 ? (
        <div className="text-center py-16 bg-[#141418] border border-white/5 rounded-2xl">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-60" />
          <p className="text-sm text-gray-400">
            Подозрительных аккаунтов не обнаружено. Система чиста!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suspiciousUsers.map((su) => (
            <div
              key={su.user_id}
              className="bg-[#141418] border border-red-500/30 p-5 rounded-2xl space-y-4 shadow-lg shadow-red-950/20"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={
                      sanitizeImageUrl(su.avatar_url) ||
                      "https://assets.vein.guru/avatars/default.png"
                    }
                    alt={su.username}
                    className="w-10 h-10 rounded-xl object-cover border border-white/10"
                  />
                  <div>
                    <div className="font-bold text-white">@{su.username}</div>
                    <div className="text-xs text-gray-400 font-mono">
                      {su.total_scrobbles} скробблов • {su.total_xp} XP
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="px-2.5 py-1 bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-mono font-bold rounded-lg">
                    Риск: {su.risk_score}%
                  </span>
                </div>
              </div>

              <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-xs text-red-300 space-y-1">
                <div className="font-bold text-gray-400 text-[10px] uppercase tracking-wider font-mono">
                  Причины срабатывания:
                </div>
                {su.reasons.length > 0 ? (
                  su.reasons.map((r) => <div key={r}>• {r}</div>)
                ) : (
                  <div>
                    • {su.antifraud_reason || "Флаг установлен администратором"}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => handleResetSuspiciousXp(su.username)}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Сбросить XP и стрик
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleBan(su.username, su.is_banned)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    su.is_banned
                      ? "bg-white/10 text-white hover:bg-white/20"
                      : "bg-red-950/60 border border-red-500/40 text-red-400 hover:bg-red-950"
                  }`}
                >
                  {su.is_banned ? "Разбан" : "Бан"}
                </button>
                <button
                  type="button"
                  onClick={() => handleUnflagAntifraud(su.username)}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-xs font-bold transition cursor-pointer"
                  title="Снять подозрение"
                >
                  Снять флаг
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
