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
}: AdminPanelState) {
  return (
    <div className="space-y-8">
      {/* Avatar Frames Management */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          Коллекционные рамки аватара
        </h3>

        <form
          onSubmit={handleCreateFrame}
          className="bg-[#141418] border border-white/5 p-5 rounded-2xl grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
        >
          <div>
            <span className="block text-[10px] font-mono text-gray-400 uppercase">
              Название
            </span>
            <input
              type="text"
              placeholder="Neon Fire"
              value={newFrame.name}
              onChange={(e) =>
                setNewFrame({ ...newFrame, name: e.target.value })
              }
              className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
              required
            />
          </div>

          <div>
            <span className="block text-[10px] font-mono text-gray-400 uppercase">
              Код (slug)
            </span>
            <input
              type="text"
              placeholder="neon_fire"
              value={newFrame.code}
              onChange={(e) =>
                setNewFrame({ ...newFrame, code: e.target.value })
              }
              className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
              required
            />
          </div>

          <div>
            <span className="block text-[10px] font-mono text-gray-400 uppercase">
              Редкость
            </span>
            <select
              value={newFrame.rarity}
              onChange={(e) =>
                setNewFrame({ ...newFrame, rarity: e.target.value })
              }
              className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
            >
              <option value="common">Common</option>
              <option value="rare">Rare</option>
              <option value="epic">Epic</option>
              <option value="legendary">Legendary</option>
            </select>
          </div>

          <div>
            <span className="block text-[10px] font-mono text-gray-400 uppercase">
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
              className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
            />
          </div>

          <button
            type="submit"
            className="py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs transition cursor-pointer"
          >
            + Добавить рамку
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {frames.map((frame) => (
            <div
              key={frame.id}
              className="bg-[#141418] border border-white/5 p-4 rounded-2xl space-y-3 relative group"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm">
                  {frame.name}
                </span>
                <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 uppercase">
                  {frame.rarity}
                </span>
              </div>
              <div className="text-xs text-gray-400 font-mono">
                <div>
                  Код:{" "}
                  <span className="text-white font-bold">{frame.code}</span>
                </div>
                <div>Требует: Lvl {frame.required_level}+</div>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteFrame(frame.id)}
                className="w-full py-1.5 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Удалить
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-6 border-t border-white/5">
        <AchievementsManager
          achievements={achievements}
          onChanged={loadAllData}
        />
      </div>
    </div>
  );
}
