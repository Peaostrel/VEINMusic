"use client";

import { Megaphone, Trash2, Zap } from "lucide-react";
import type { AdminPanelState } from "../useAdminPanel";
import BroadcastPanel from "../components/BroadcastPanel";

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
}: Readonly<AdminPanelState>) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Announcements Manager */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-fg-2" />
          Глобальные системные оповещения
        </h3>

        <form
          onSubmit={handleCreateAnnouncement}
          className="bg-surface border border-line-soft p-5 rounded-xl space-y-3"
        >
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <span className="block text-[10px] font-mono text-fg-2">
                Заголовок
              </span>
              <input
                type="text"
                placeholder="Технические работы"
                value={newAnn.title}
                onChange={(e) =>
                  setNewAnn({ ...newAnn, title: e.target.value })
                }
                className="w-full mt-1 px-3 py-2 bg-bg border border-line rounded-xl text-xs text-fg"
                required
              />
            </div>
            <div>
              <span className="block text-[10px] font-mono text-fg-2">Тип</span>
              <select
                value={newAnn.type}
                onChange={(e) => setNewAnn({ ...newAnn, type: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-bg border border-line rounded-xl text-xs text-fg"
              >
                <option value="info">Информация</option>
                <option value="warning">Предупреждение</option>
                <option value="alert">Важное</option>
              </select>
            </div>
          </div>

          <div>
            <span className="block text-[10px] font-mono text-fg-2">
              Текст сообщения
            </span>
            <textarea
              placeholder="15 августа с 04:00 до 05:00 планируется обновление..."
              value={newAnn.message}
              onChange={(e) =>
                setNewAnn({ ...newAnn, message: e.target.value })
              }
              rows={2}
              className="w-full mt-1 px-3 py-2 bg-bg border border-line rounded-xl text-xs text-fg resize-none"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-accent text-on-accent hover:brightness-110 font-medium rounded-xl text-xs transition cursor-pointer"
          >
            Опубликовать оповещение
          </button>
        </form>

        <div className="space-y-3">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className="bg-surface border border-line-soft p-4 rounded-xl flex items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg text-xs">
                    {ann.title}
                  </span>
                  <span className="px-2 py-0.2 rounded font-mono text-[9px] bg-surface-2 text-fg-2">
                    {ann.type}
                  </span>
                </div>
                <p className="text-xs text-fg-2 mt-1">{ann.message}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    handleToggleAnnouncement(ann.id, ann.is_active)
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    ann.is_active
                      ? "border border-line text-ok"
                      : "bg-surface-2 text-fg-2"
                  }`}
                >
                  {ann.is_active ? "Активно" : "Скрыто"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteAnnouncement(ann.id)}
                  className="p-1.5 hover:bg-[#2a1b1b] text-danger rounded-lg transition cursor-pointer"
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
        <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          Динамические Feature Flags
        </h3>

        <form
          onSubmit={handleCreateFlag}
          className="bg-surface border border-line-soft p-5 rounded-xl space-y-3"
        >
          <div>
            <span className="block text-[10px] font-mono text-fg-2">
              Ключ флага (slug)
            </span>
            <input
              type="text"
              placeholder="enable_listen_together"
              value={newFlag.key}
              onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-bg border border-line rounded-xl text-xs text-fg font-mono"
              required
            />
          </div>
          <div>
            <span className="block text-[10px] font-mono text-fg-2">
              Описание
            </span>
            <input
              type="text"
              placeholder="Включает режим синхронного прослушивания"
              value={newFlag.description}
              onChange={(e) =>
                setNewFlag({ ...newFlag, description: e.target.value })
              }
              className="w-full mt-1 px-3 py-2 bg-bg border border-line rounded-xl text-xs text-fg"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 bg-accent text-on-accent hover:brightness-110 font-medium rounded-xl text-xs transition cursor-pointer"
          >
            + Добавить фича-флаг
          </button>
        </form>

        <div className="space-y-3">
          {featureFlags.map((flag) => (
            <div
              key={flag.id}
              className="bg-surface border border-line-soft p-4 rounded-xl flex items-center justify-between gap-4"
            >
              <div>
                <div className="font-mono font-medium text-fg text-xs">
                  {flag.key}
                </div>
                <p className="text-xs text-fg-2 mt-0.5">
                  {flag.description || "Без описания"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleToggleFlag(flag.key, flag.is_enabled)}
                className={`px-3.5 py-1.5 rounded-xl font-mono text-xs font-medium transition cursor-pointer ${
                  flag.is_enabled
                    ? "bg-line text-fg"
                    : "bg-line text-fg-2 hover:bg-line"
                }`}
              >
                {flag.is_enabled ? "включено" : "выключено"}
              </button>
            </div>
          ))}
        </div>
      </div>
      <BroadcastPanel />
    </div>
  );
}
