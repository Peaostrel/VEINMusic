"use client";

import {
  Trash2,
  Edit,
  CheckCircle,
  Ban,
  RotateCcw,
  Search,
} from "lucide-react";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import { getUserRoleBadge } from "../types";
import type { AdminPanelState } from "../useAdminPanel";
import { fallbackOnce } from "@/app/lib/img";

export default function UsersTab({
  userSearch,
  setUserSearch,
  handleToggleBan,
  handleToggleVerify,
  handleChangeRole,
  handleResetProfile,
  handleDeleteUser,
  filteredUsers,
}: AdminPanelState) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Поиск по нику или имени..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#141418] border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
          />
        </div>
        <span className="text-xs text-gray-400 font-mono">
          Найдено: {filteredUsers.length}
        </span>
      </div>

      <div className="bg-[#141418] border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#0f0f12] text-gray-400 font-mono uppercase text-[11px] border-b border-white/5">
              <tr>
                <th className="py-3.5 px-4">Пользователь</th>
                <th className="py-3.5 px-4">Роль</th>
                <th className="py-3.5 px-4">Скробблы / XP</th>
                <th className="py-3.5 px-4">Статус</th>
                <th className="py-3.5 px-4 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.02] transition">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          sanitizeImageUrl(u.avatar_url) ||
                          "https://assets.vein.guru/avatars/default.png"
                        }
                        alt={u.username}
                        className="w-9 h-9 rounded-xl object-cover border border-white/10"
                        onError={fallbackOnce(
                          "https://assets.vein.guru/avatars/default.png",
                        )}
                      />
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          @{u.username}
                          {u.is_verified && (
                            <CheckCircle className="w-3.5 h-3.5 text-blue-400 inline" />
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {u.display_name || "Без имени"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${getUserRoleBadge(u.role)}`}
                    >
                      {u.role || "user"}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono">
                    <div>{u.scrobbles} треков</div>
                    <div className="text-emerald-400 font-bold">
                      {u.total_xp} XP
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    {u.is_banned && (
                      <span className="px-2 py-0.5 rounded bg-red-950/80 border border-red-500/50 text-red-400 text-[10px] font-bold">
                        ЗАБЛОКИРОВАН
                      </span>
                    )}
                    {!u.is_banned && u.is_flagged_antifraud && (
                      <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/50 text-amber-400 text-[10px] font-bold">
                        ФЛАГ АНТИФРОД
                      </span>
                    )}
                    {!u.is_banned && !u.is_flagged_antifraud && (
                      <span className="text-emerald-400 font-mono text-[11px]">
                        Активен
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleVerify(u.username, !!u.is_verified)
                        }
                        className="p-2 hover:bg-white/10 rounded-lg text-blue-400 transition"
                        title={
                          u.is_verified ? "Снять галочку" : "Выдать верификацию"
                        }
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleChangeRole(u.username, u.role || "user")
                        }
                        className="p-2 hover:bg-white/10 rounded-lg text-purple-400 transition"
                        title="Изменить роль"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetProfile(u.username)}
                        className="p-2 hover:bg-white/10 rounded-lg text-amber-400 transition"
                        title="Очистить профиль (аватар/био)"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleBan(u.username, !!u.is_banned)
                        }
                        className={`p-2 hover:bg-white/10 rounded-lg transition ${
                          u.is_banned ? "text-emerald-400" : "text-orange-400"
                        }`}
                        title={u.is_banned ? "Разблокировать" : "Заблокировать"}
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(u.username)}
                        className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition"
                        title="Удалить пользователя навсегда"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
