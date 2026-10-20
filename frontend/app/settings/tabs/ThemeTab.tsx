"use client";
import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";
import { Check, Headphones, Lock } from "lucide-react";
import React from "react";
import LanguageSwitch from "@/components/LanguageSwitch";
import { THEMES } from "../utils";
import type { SettingsData, UpdateData, UpdatePreference } from "../types";
import {
  SelectRow,
  SettingsIntro,
  ToggleRow,
  settingsCard,
} from "../components/PreferenceControls";

const FRAMES = [
  { id: "", name: msg("Без рамки"), req: 1, class: "" },
  {
    id: "meloman",
    name: msg("Меломан"),
    req: 5,
    class: "avatar-frame-meloman",
  },
  {
    id: "audiophile",
    name: msg("Аудиофил"),
    req: 15,
    class: "avatar-frame-audiophile",
  },
  { id: "maniac", name: msg("Маньяк"), req: 30, class: "avatar-frame-maniac" },
  { id: "legend", name: msg("Легенда"), req: 50, class: "avatar-frame-legend" },
  { id: "god", name: msg("Божество"), req: 100, class: "avatar-frame-god" },
];

interface ThemeTabProps {
  data: SettingsData;
  updateData: UpdateData;
  updatePreference: UpdatePreference;
  level: number;
}

export default function ThemeTab({
  data,
  updateData,
  updatePreference,
  level,
}: Readonly<ThemeTabProps>) {
  const t = useT();
  const isThemeCustom =
    data.theme && typeof data.theme === "string" && data.theme.startsWith("#");
  const appearance = data.preferences.appearance;
  const updateAppearance = (patch: Partial<typeof appearance>) =>
    updatePreference("appearance", { ...appearance, ...patch });

  return (
    <div className="space-y-8">
      <SettingsIntro
        title={t("Оформление")}
        description={t(
          "Настройте режим, масштаб, доступность, цветовую тему и рамку аватара. Изменения интерфейса видны сразу, но сохраняются только кнопкой внизу.",
        )}
      />
      <section className={settingsCard}>
        <div className="flex flex-col gap-3 border-b border-line-soft px-5 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fg">
              {t("Язык интерфейса")}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-fg-2">
              {t(
                "Русский или английский. Применяется сразу, страница перезагрузится.",
              )}
            </span>
          </span>
          <LanguageSwitch />
        </div>
        <SelectRow
          title={t("Режим интерфейса")}
          description={t(
            "Тёмный, светлый или зависящий от настроек устройства.",
          )}
          value={appearance.color_mode}
          options={[
            { value: "dark", label: t("Тёмный") },
            { value: "light", label: t("Светлый") },
            { value: "system", label: t("Как в системе") },
          ]}
          onChange={(color_mode) => updateAppearance({ color_mode })}
        />
        <SelectRow
          title={t("Плотность интерфейса")}
          description={t("Компактный режим уменьшает навигацию и интервалы.")}
          value={appearance.density}
          options={[
            { value: "comfortable", label: t("Обычная") },
            { value: "compact", label: t("Компактная") },
          ]}
          onChange={(density) => updateAppearance({ density })}
        />
        <SelectRow
          title={t("Размер интерфейса")}
          description={t("Меняет базовый размер текста и элементов сайта.")}
          value={appearance.font_scale}
          options={[
            { value: "small", label: t("Меньше") },
            { value: "normal", label: t("Обычный") },
            { value: "large", label: t("Больше") },
          ]}
          onChange={(font_scale) => updateAppearance({ font_scale })}
        />
        <ToggleRow
          title={t("Сократить анимации")}
          description={t(
            "Отключает декоративные переходы и движения интерфейса.",
          )}
          checked={appearance.reduce_motion}
          onChange={(reduce_motion) => updateAppearance({ reduce_motion })}
        />
        <ToggleRow
          title={t("Повышенный контраст")}
          description={t("Делает границы и вторичный текст заметнее.")}
          checked={appearance.high_contrast}
          onChange={(high_contrast) => updateAppearance({ high_contrast })}
        />
        <ToggleRow
          title={t("Размытие фона")}
          description={t(
            "Использовать backdrop-blur в плавающих панелях и окнах.",
          )}
          checked={appearance.background_blur}
          onChange={(background_blur) => updateAppearance({ background_blur })}
        />
      </section>

      {/* Секция цветовой темы */}
      <div>
        <h2 className="text-lg font-semibold text-fg mb-6">
          {t("Выбор цветовой темы")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {THEMES.map((opt) => {
            const isLocked = level < opt.req;
            const isSelected = opt.isCustom
              ? isThemeCustom
              : data.theme === opt.id;

            let cardBorderClass = "border-line hover:bg-surface";
            if (isLocked) {
              cardBorderClass =
                "border-line-soft opacity-50 cursor-not-allowed";
            } else if (isSelected) {
              cardBorderClass = "border-accent bg-surface";
            }

            let backgroundStyle = opt.color;
            if (opt.isRainbow) {
              backgroundStyle =
                "conic-gradient(#e06c8c, #e3a93b, #5fb58e, #56b6c2, #9d86e6, #e06c8c)";
            } else if (opt.isCustom) {
              if (isThemeCustom) {
                backgroundStyle = data.theme;
              } else {
                backgroundStyle = "linear-gradient(135deg, #e07a45, #9d86e6)";
              }
            }

            let statusIndicator: React.ReactNode = null;
            if (isLocked) {
              statusIndicator = (
                <Lock className="h-4 w-4 text-fg-3" aria-label={t("Закрыто")} />
              );
            } else if (isSelected) {
              statusIndicator = (
                <Check
                  className="h-4 w-4 text-accent"
                  aria-label={t("Выбрано")}
                />
              );
            }

            return (
              <button
                type="button"
                key={opt.id}
                onClick={() => {
                  if (isLocked) return;
                  if (opt.isCustom) {
                    const currentColor = isThemeCustom ? data.theme : "#e06c6c";
                    updateData("theme", currentColor);
                  } else {
                    updateData("theme", opt.id);
                  }
                }}
                className={`text-left w-full p-4 rounded-xl border transition-colors flex flex-col gap-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-fg-3/40 ${cardBorderClass}`}
                disabled={isLocked}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-8 h-8 rounded-full"
                      style={{
                        background: backgroundStyle,
                      }}
                    ></div>
                    <div>
                      <div className="font-medium text-fg">{t(opt.name)}</div>
                      <div className="font-mono text-[11px] text-fg-3">
                        {t("с ур. {n}", { n: opt.req })}
                      </div>
                    </div>
                  </div>
                  {statusIndicator}
                </div>

                {isSelected && opt.isCustom && (
                  <div className="w-full pt-3 border-t border-line-soft flex items-center gap-3">
                    <span className="text-xs text-fg-2">{t("Цвет:")}</span>
                    <input
                      type="color"
                      value={isThemeCustom ? data.theme : "#e06c6c"}
                      onChange={(e) => updateData("theme", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-10 h-7 rounded bg-transparent border border-line cursor-pointer p-0"
                    />
                    <span className="font-mono text-xs text-fg">
                      {isThemeCustom ? data.theme : "#e06c6c"}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Секция рамки аватара */}
      <div className="pt-6 border-t border-line-soft">
        <h2 className="text-lg font-semibold text-fg mb-2">
          {t("Рамка аватара")}
        </h2>
        <p className="text-xs text-fg-2 mb-6 leading-relaxed">
          {t("Рамки открываются по мере роста уровня.")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {FRAMES.map((frame) => {
            const isLocked = level < frame.req;
            const isSelected = (data.avatarFrame || "") === frame.id;

            let cardClass = "border-line hover:bg-surface";
            if (isLocked) {
              cardClass = "border-line-soft opacity-50 cursor-not-allowed";
            } else if (isSelected) {
              cardClass = "border-accent bg-surface";
            }

            const frameWrapperClass = frame.id
              ? `avatar-frame-wrapper ${frame.class}`
              : "p-[5px] border-2 border-dashed border-line rounded-full";

            let frameStatusIndicator: React.ReactNode = null;
            if (isLocked) {
              frameStatusIndicator = (
                <Lock className="h-4 w-4 text-fg-3" aria-label={t("Закрыто")} />
              );
            } else if (isSelected) {
              frameStatusIndicator = (
                <Check
                  className="h-4 w-4 text-accent"
                  aria-label={t("Выбрано")}
                />
              );
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
                className={`text-left w-full p-4 rounded-xl border transition-colors flex items-center justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-fg-3/40 ${cardClass}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`${frameWrapperClass} shrink-0`}>
                    <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center text-fg-3">
                      <Headphones className="h-4 w-4" aria-hidden="true" />
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-fg text-sm">
                      {t(frame.name)}
                    </div>
                    <div className="font-mono text-[11px] text-fg-3">
                      {t("с ур. {n}", { n: frame.req })}
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
