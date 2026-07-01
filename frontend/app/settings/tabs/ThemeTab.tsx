"use client";
import React from "react";
import { THEMES } from "../utils";

const FRAMES = [
  { id: "", name: "Без рамки", req: 1, class: "" },
  { id: "meloman", name: "Меломан", req: 5, class: "avatar-frame-meloman" },
  {
    id: "audiophile",
    name: "Аудиофил",
    req: 15,
    class: "avatar-frame-audiophile",
  },
  { id: "maniac", name: "Маньяк", req: 30, class: "avatar-frame-maniac" },
  { id: "legend", name: "Легенда", req: 50, class: "avatar-frame-legend" },
  { id: "god", name: "Божество", req: 100, class: "avatar-frame-god" },
];

interface ThemeTabProps {
  data: any;
  updateData: (k: string, v: any) => void;
  level: number;
}

export default function ThemeTab({
  data,
  updateData,
  level,
}: Readonly<ThemeTabProps>) {
  const isThemeCustom =
    data.theme && typeof data.theme === "string" && data.theme.startsWith("#");

  return (
    <div className="p-6 md:p-8 space-y-8">
      {/* Секция цветовой темы */}
      <div>
        <h2 className="text-xl font-bold mb-6 text-[var(--accent-text)]">
          Выбор цветовой темы
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {THEMES.map((opt) => {
            const isLocked = level < opt.req;
            const isSelected = opt.isCustom
              ? isThemeCustom
              : data.theme === opt.id;

            let cardBorderClass = "border-white/10 hover:border-white/30";
            if (isLocked) {
              cardBorderClass = "opacity-50 grayscale cursor-not-allowed";
            } else if (isSelected) {
              cardBorderClass =
                "border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_15px_var(--accent-glow)]";
            }

            let backgroundStyle = opt.color;
            if (opt.isRainbow) {
              backgroundStyle =
                "linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff)";
            } else if (opt.isCustom) {
              backgroundStyle = isThemeCustom
                ? data.theme
                : "linear-gradient(45deg, #ef4444, #3b82f6)";
            }

            let statusIndicator = null;
            if (isLocked) {
              statusIndicator = "🔒";
            } else if (isSelected) {
              statusIndicator = "✅";
            }

            return (
              <button
                type="button"
                key={opt.id}
                onClick={() => {
                  if (isLocked) return;
                  if (opt.isCustom) {
                    const currentColor = isThemeCustom ? data.theme : "#ef4444";
                    updateData("theme", currentColor);
                  } else {
                    updateData("theme", opt.id);
                  }
                }}
                className={`text-left w-full p-4 rounded-xl border-2 transition-all flex flex-col gap-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50 ${cardBorderClass}`}
                disabled={isLocked}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-8 h-8 rounded-full shadow-lg"
                      style={{
                        background: backgroundStyle,
                      }}
                    ></div>
                    <div>
                      <div className="font-bold text-white">{opt.name}</div>
                      <div className="text-xs text-gray-400">LVL {opt.req}</div>
                    </div>
                  </div>
                  {statusIndicator}
                </div>

                {isSelected && opt.isCustom && (
                  <div className="w-full pt-3 border-t border-white/5 flex items-center gap-3">
                    <span className="text-xs text-gray-400">Цвет:</span>
                    <input
                      type="color"
                      value={isThemeCustom ? data.theme : "#ef4444"}
                      onChange={(e) => updateData("theme", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-10 h-7 rounded bg-transparent border border-white/10 cursor-pointer p-0"
                    />
                    <span className="font-mono text-xs text-white uppercase">
                      {isThemeCustom ? data.theme : "#ef4444"}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Секция рамки аватара */}
      <div className="pt-6 border-t border-white/5">
        <h2 className="text-xl font-bold mb-2 text-[var(--accent-text)]">
          Анимированная рамка аватара
        </h2>
        <p className="text-xs text-gray-400 mb-6 leading-relaxed">
          Украсьте ваш аватар уникальной анимированной рамкой. Дополнительные
          стили разблокируются по мере роста вашего уровня.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {FRAMES.map((frame) => {
            const isLocked = level < frame.req;
            const isSelected = (data.avatarFrame || "") === frame.id;

            let cardClass = "border-white/10 hover:border-white/30";
            if (isLocked) {
              cardClass = "opacity-50 grayscale cursor-not-allowed";
            } else if (isSelected) {
              cardClass =
                "border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_15px_var(--accent-glow)]";
            }

            const frameWrapperClass = frame.id
              ? `avatar-frame-wrapper ${frame.class}`
              : "p-[5px] border-2 border-dashed border-gray-600 rounded-full";

            let frameStatusIndicator = null;
            if (isLocked) {
              frameStatusIndicator = "🔒";
            } else if (isSelected) {
              frameStatusIndicator = "✅";
            }

            return (
              <button
                type="button"
                key={frame.id}
                disabled={isLocked}
                onClick={() => {
                  if (!isLocked) {
                    updateData("avatarFrame", frame.id);
                  }
                }}
                className={`text-left w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50 ${cardClass}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`${frameWrapperClass} shrink-0`}>
                    <div className="w-10 h-10 rounded-full bg-[#282828] flex items-center justify-center text-lg shadow-inner">
                      🎧
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">
                      {frame.name}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      LVL {frame.req}
                    </div>
                  </div>
                </div>
                <div>{frameStatusIndicator}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
