"use client";

import { ShieldAlert, CheckCircle, RotateCcw } from "lucide-react";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import type { AdminPanelState } from "../useAdminPanel";

export default function AntifraudTab({
  suspiciousUsers,
  handleToggleBan,
  handleResetSuspiciousXp,
  handleUnflagAntifraud,
}: Readonly<AdminPanelState>) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-5 bg-surface border border-danger-line rounded-xl">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-danger" />
          <div>
            <h3 className="font-medium text-fg text-sm">
              Система автоматического обнаружения накрутки
            </h3>
            <p className="text-fg-2 text-xs">
              Алгоритм анализирует скорость скробблинга (&gt;70 треков/час) и
              короткие треки (&lt;20с).
            </p>
          </div>
        </div>
        <span className="px-3 py-1 text-danger font-mono text-xs font-medium rounded-lg">
          {suspiciousUsers.length} флагов
        </span>
      </div>

      {suspiciousUsers.length === 0 ? (
        <div className="text-center py-16 bg-surface border border-line-soft rounded-xl">
          <CheckCircle className="w-12 h-12 text-ok mx-auto mb-3 opacity-60" />
          <p className="text-sm text-fg-2">
            Подозрительных аккаунтов не обнаружено. Система чиста!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suspiciousUsers.map((su) => (
            <div
              key={su.user_id}
              className="bg-surface border border-danger-line p-5 rounded-xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={
                      sanitizeImageUrl(su.avatar_url) ||
                      "https://assets.vein.guru/avatars/default.png"
                    }
                    alt={su.username}
                    className="w-10 h-10 rounded-xl object-cover border border-line"
                  />
                  <div>
                    <div className="font-medium text-fg">@{su.username}</div>
                    <div className="text-xs text-fg-2 font-mono">
                      {su.total_scrobbles} скробблов • {su.total_xp} XP
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="px-2.5 py-1 border border-danger-line text-danger text-xs font-mono font-medium rounded-lg">
                    Риск: {su.risk_score}%
                  </span>
                </div>
              </div>

              <div className="p-3 bg-bg rounded-xl border border-line-soft text-xs text-danger space-y-1">
                <div className="font-medium text-fg-2 text-[10px] font-mono">
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

              <div className="flex items-center gap-2 pt-2 border-t border-line-soft">
                <button
                  type="button"
                  onClick={() => handleResetSuspiciousXp(su.username)}
                  className="flex-1 py-2 bg-accent text-on-accent hover:brightness-110 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Сбросить XP и стрик
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleBan(su.username, su.is_banned)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                    su.is_banned
                      ? "bg-line text-fg hover:bg-line"
                      : "border border-danger-line text-danger hover:bg-[#2a1b1b]"
                  }`}
                >
                  {su.is_banned ? "Разбан" : "Бан"}
                </button>
                <button
                  type="button"
                  onClick={() => handleUnflagAntifraud(su.username)}
                  className="px-3 py-2 bg-surface-2 hover:bg-line text-fg-2 rounded-xl text-xs font-medium transition cursor-pointer"
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
