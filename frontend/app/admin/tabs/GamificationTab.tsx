"use client";

import { Trash2, Sparkles } from "lucide-react";
import type { AdminPanelState } from "../useAdminPanel";
import AchievementsManager from "../components/AchievementsManager";

export default function GamificationTab({
  achievements,
  frames,
  newFrame,
  setNewFrame,
  handleCreateFrame,
  handleDeleteFrame,
  loadAllData,
}: Readonly<AdminPanelState>) {
  return (
    <div className="space-y-8">
      {/* Avatar Frames Management */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          Коллекционные рамки аватара
        </h3>

        <form
          onSubmit={handleCreateFrame}
          className="bg-surface border border-line-soft p-5 rounded-xl grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
        >
          <div>
            <span className="block text-[10px] font-mono text-fg-2">
              Название
            </span>
            <input
              type="text"
              placeholder="Neon Fire"
              value={newFrame.name}
              onChange={(e) =>
                setNewFrame({ ...newFrame, name: e.target.value })
              }
              className="w-full mt-1 px-3 py-2 bg-bg border border-line rounded-xl text-xs text-fg"
              required
            />
          </div>

          <div>
            <span className="block text-[10px] font-mono text-fg-2">
              Код (slug)
            </span>
            <input
              type="text"
              placeholder="neon_fire"
              value={newFrame.code}
              onChange={(e) =>
                setNewFrame({ ...newFrame, code: e.target.value })
              }
              className="w-full mt-1 px-3 py-2 bg-bg border border-line rounded-xl text-xs text-fg"
              required
            />
          </div>

          <div>
            <span className="block text-[10px] font-mono text-fg-2">
              Редкость
            </span>
            <select
              value={newFrame.rarity}
              onChange={(e) =>
                setNewFrame({ ...newFrame, rarity: e.target.value })
              }
              className="w-full mt-1 px-3 py-2 bg-bg border border-line rounded-xl text-xs text-fg"
            >
              <option value="common">Common</option>
              <option value="rare">Rare</option>
              <option value="epic">Epic</option>
              <option value="legendary">Legendary</option>
            </select>
          </div>

          <div>
            <span className="block text-[10px] font-mono text-fg-2">
              Мин. уровень
            </span>
            <input
              type="number"
              min="1"
              value={newFrame.required_level}
              onChange={(e) =>
                setNewFrame({
                  ...newFrame,
                  required_level: Number.parseInt(e.target.value, 10) || 1,
                })
              }
              className="w-full mt-1 px-3 py-2 bg-bg border border-line rounded-xl text-xs text-fg"
            />
          </div>

          <button
            type="submit"
            className="py-2.5 bg-accent text-on-accent hover:brightness-110 font-medium rounded-xl text-xs transition cursor-pointer"
          >
            + Добавить рамку
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {frames.map((frame) => (
            <div
              key={frame.id}
              className="bg-surface border border-line-soft p-4 rounded-xl space-y-3 relative group"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-fg text-sm">
                  {frame.name}
                </span>
                <span className="px-2 py-0.5 rounded font-mono text-[10px] font-medium text-accent border border-line">
                  {frame.rarity}
                </span>
              </div>
              <div className="text-xs text-fg-2 font-mono">
                <div>
                  Код: <span className="text-fg font-medium">{frame.code}</span>
                </div>
                <div>Требует: Lvl {frame.required_level}+</div>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteFrame(frame.id)}
                className="w-full py-1.5 bg-surface-2 hover:bg-[#2a1b1b] text-fg-2 hover:text-danger rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Удалить
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-6 border-t border-line-soft">
        <AchievementsManager
          achievements={achievements}
          onChanged={loadAllData}
        />
      </div>
    </div>
  );
}
