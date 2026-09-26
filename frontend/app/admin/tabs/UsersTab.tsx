"use client";

import {
  Trash2,
  Edit,
  CheckCircle,
  Ban,
  RotateCcw,
  Search,
  IdCard,
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
  onOpenUser,
}: AdminPanelState & { onOpenUser: (username: string) => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-fg-2 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Поиск по нику или имени..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-line rounded-xl text-sm text-fg placeholder:text-fg-3 focus:outline-none focus:border-fg-3"
          />
        </div>
        <span className="text-xs text-fg-2 font-mono">
          Найдено: {filteredUsers.length}
        </span>
      </div>

      <div className="bg-surface border border-line-soft rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-fg-2">
            <thead className="bg-[#0f0f12] text-fg-2 font-mono text-[11px] border-b border-line-soft">
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
                        className="w-9 h-9 rounded-xl object-cover border border-line"
                        onError={fallbackOnce(
                          "https://assets.vein.guru/avatars/default.png",
                        )}
                      />
                      <div>
                        <button
                          type="button"
                          onClick={() => onOpenUser(u.username)}
                          className="font-medium text-fg flex items-center gap-1.5 hover:text-accent"
                        >
                          @{u.username}
                          {u.is_verified && (
                            <CheckCircle className="w-3.5 h-3.5 text-fg-2 inline" />
                          )}
                        </button>
                        <div className="text-[11px] text-fg-2">
                          {u.display_name || "Без имени"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] font-medium ${getUserRoleBadge(u.role)}`}
                    >
                      {u.role || "user"}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono">
                    <div>{u.scrobbles} треков</div>
                    <div className="text-ok font-medium">{u.total_xp} XP</div>
                  </td>
                  <td className="py-3.5 px-4">
                    {u.is_banned && (
                      <span className="px-2 py-0.5 rounded border border-danger-line text-danger text-[10px] font-medium">
                        ЗАБЛОКИРОВАН
                      </span>
                    )}
                    {!u.is_banned && u.is_flagged_antifraud && (
                      <span className="px-2 py-0.5 rounded border border-line text-accent text-[10px] font-medium">
                        ФЛАГ АНТИФРОД
                      </span>
                    )}
                    {!u.is_banned && !u.is_flagged_antifraud && (
                      <span className="text-ok font-mono text-[11px]">
                        Активен
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenUser(u.username)}
                        className="p-2 hover:bg-line rounded-lg text-fg transition"
                        title="Карточка пользователя"
                        aria-label={`Карточка @${u.username}`}
                      >
                        <IdCard className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleVerify(u.username, !!u.is_verified)
                        }
                        className="p-2 hover:bg-line rounded-lg text-fg-2 transition"
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
                        className="p-2 hover:bg-line rounded-lg text-fg-2 transition"
                        title="Изменить роль"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetProfile(u.username)}
                        className="p-2 hover:bg-line rounded-lg text-accent transition"
                        title="Очистить профиль (аватар/био)"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleBan(u.username, !!u.is_banned)
                        }
                        className={`p-2 hover:bg-line rounded-lg transition ${
                          u.is_banned ? "text-ok" : "text-fg-2"
                        }`}
                        title={u.is_banned ? "Разблокировать" : "Заблокировать"}
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(u.username)}
                        className="p-2 hover:bg-[#2a1b1b] text-danger rounded-lg transition"
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
