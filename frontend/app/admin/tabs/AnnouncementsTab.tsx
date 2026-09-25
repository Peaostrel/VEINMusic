"use client";

import { Megaphone, Trash2, Zap } from "lucide-react";
import type { AdminPanelState } from "../useAdminPanel";

export default function AnnouncementsTab({
  announcements,
  featureFlags,
  newAnn,
  setNewAnn,
  newFlag,
  setNewFlag,
  handleCreateAnnouncement,
  handleToggleAnnouncement,
  handleDeleteAnnouncement,
  handleToggleFlag,
  handleCreateFlag,
}: AdminPanelState) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Announcements Manager */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-blue-400" />
          Глобальные системные оповещения
        </h3>

        <form
          onSubmit={handleCreateAnnouncement}
          className="bg-[#141418] border border-white/5 p-5 rounded-2xl space-y-3"
        >
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <span className="block text-[10px] font-mono text-gray-400 uppercase">
                Заголовок
              </span>
              <input
                type="text"
                placeholder="Технические работы"
                value={newAnn.title}
                onChange={(e) =>
                  setNewAnn({ ...newAnn, title: e.target.value })
                }
                className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                required
              />
            </div>
            <div>
              <span className="block text-[10px] font-mono text-gray-400 uppercase">
                Тип
              </span>
              <select
                value={newAnn.type}
                onChange={(e) => setNewAnn({ ...newAnn, type: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
              >
                <option value="info">Info (Синий)</option>
                <option value="warning">Warning (Желтый)</option>
                <option value="alert">Alert (Красный)</option>
              </select>
            </div>
          </div>

          <div>
            <span className="block text-[10px] font-mono text-gray-400 uppercase">
              Текст сообщения
            </span>
            <textarea
              placeholder="15 августа с 04:00 до 05:00 планируется обновление..."
              value={newAnn.message}
              onChange={(e) =>
                setNewAnn({ ...newAnn, message: e.target.value })
              }
              rows={2}
              className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white resize-none"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Опубликовать оповещение
          </button>
        </form>

        <div className="space-y-3">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className="bg-[#141418] border border-white/5 p-4 rounded-2xl flex items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-xs">
                    {ann.title}
                  </span>
                  <span className="px-2 py-0.2 rounded font-mono text-[9px] uppercase bg-white/5 text-gray-400">
                    {ann.type}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{ann.message}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    handleToggleAnnouncement(ann.id, ann.is_active)
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    ann.is_active
                      ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-400"
                      : "bg-white/5 text-gray-500"
                  }`}
                >
                  {ann.is_active ? "Активно" : "Скрыто"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteAnnouncement(ann.id)}
                  className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Flags Manager */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Динамические Feature Flags
        </h3>

        <form
          onSubmit={handleCreateFlag}
          className="bg-[#141418] border border-white/5 p-5 rounded-2xl space-y-3"
        >
          <div>
            <span className="block text-[10px] font-mono text-gray-400 uppercase">
              Ключ флага (slug)
            </span>
            <input
              type="text"
              placeholder="enable_listen_together"
              value={newFlag.key}
              onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white font-mono"
              required
            />
          </div>
          <div>
            <span className="block text-[10px] font-mono text-gray-400 uppercase">
              Описание
            </span>
            <input
              type="text"
              placeholder="Включает режим синхронного прослушивания"
              value={newFlag.description}
              onChange={(e) =>
                setNewFlag({ ...newFlag, description: e.target.value })
              }
              className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs transition cursor-pointer"
          >
            + Добавить фича-флаг
          </button>
        </form>

        <div className="space-y-3">
          {featureFlags.map((flag) => (
            <div
              key={flag.id}
              className="bg-[#141418] border border-white/5 p-4 rounded-2xl flex items-center justify-between gap-4"
            >
              <div>
                <div className="font-mono font-bold text-white text-xs">
                  {flag.key}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {flag.description || "Без описания"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleToggleFlag(flag.key, flag.is_enabled)}
                className={`px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold transition cursor-pointer ${
                  flag.is_enabled
                    ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                    : "bg-white/10 text-gray-400 hover:bg-white/20"
                }`}
              >
                {flag.is_enabled ? "ВКЛЮЧЕНО" : "ОТКЛ"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
