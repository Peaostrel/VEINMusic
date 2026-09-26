"use client";

import { Plus, X } from "lucide-react";
import type {
  Country,
  ImageField,
  SettingsData,
  SocialLink,
  UpdateData,
} from "../types";

interface GeneralTabProps {
  data: SettingsData;
  updateData: UpdateData;
  countries: Country[];
  cities: string[];
  isCityInputFocused: boolean;
  setIsCityInputFocused: (focused: boolean) => void;
  onSelectFile: (
    event: React.ChangeEvent<HTMLInputElement>,
    field: ImageField,
  ) => void;
  username: string;
  socialLinks: SocialLink[];
  addSocialLink: () => void;
  updateSocialLink: (
    id: SocialLink["id"],
    field: "network" | "username",
    value: string,
  ) => void;
  removeSocialLink: (id: SocialLink["id"]) => void;
}

export default function GeneralTab({
  data,
  updateData,
  countries,
  cities,
  isCityInputFocused,
  setIsCityInputFocused,
  onSelectFile,
  username,
  socialLinks,
  addSocialLink,
  updateSocialLink,
  removeSocialLink,
}: Readonly<GeneralTabProps>) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="col-span-1 md:col-span-2 mb-4">
          <label
            htmlFor="cover-upload"
            className="mb-1.5 block text-xs text-fg-2"
          >
            Визуальное оформление
          </label>
          <div className="relative w-full rounded-xl bg-surface-2 border-2 border-dashed border-line hover:border-line transition-colors group mb-10">
            <label
              htmlFor="cover-upload"
              className="block w-full h-32 md:h-48 cursor-pointer overflow-hidden rounded-xl relative"
            >
              {data.coverUrl ? (
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500"
                  style={{ backgroundImage: `url(${data.coverUrl})` }}
                ></div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-fg-2 group-hover:text-fg transition-colors">
                  <span className="font-medium">Загрузить обложку</span>
                </div>
              )}
              <input
                id="cover-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onSelectFile(e, "coverUrl")}
              />
            </label>
            <label
              htmlFor="avatar-upload"
              className="absolute -bottom-8 left-6 md:left-10 w-24 h-24 md:w-28 md:h-28 rounded-full bg-surface border-4 border-bg cursor-pointer overflow-hidden group/avatar z-10 hover:border-line"
            >
              {data.avatarUrl ? (
                <img
                  src={data.avatarUrl}
                  alt="Аватар"
                  className="w-full h-full object-cover group-hover/avatar:scale-110 transition-transform"
                />
              ) : (
                <img
                  src={`https://api.dicebear.com/9.x/micah/svg?seed=${username || "default"}&backgroundColor=transparent`}
                  alt="Аватар"
                  className="w-full h-full object-cover group-hover/avatar:scale-110 transition-transform bg-surface-2"
                />
              )}
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onSelectFile(e, "avatarUrl")}
              />
            </label>
          </div>
        </div>
        <div>
          <label
            htmlFor="display-name"
            className="mb-1.5 block text-xs text-fg-2"
          >
            Отображаемое Имя
          </label>
          <input
            id="display-name"
            value={data.displayName}
            onChange={(e) => updateData("displayName", e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-fg-3"
          />
        </div>
        <div>
          <label
            htmlFor="country-select"
            className="mb-1.5 block text-xs text-fg-2"
          >
            Страна
          </label>
          <select
            id="country-select"
            value={data.country}
            onChange={(e) => updateData("country", e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-fg-3 cursor-pointer"
          >
            <option value="">Выберите страну...</option>
            {countries.map((c) => (
              <option key={c.code} value={c.name}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="city-input"
            className="mb-1.5 block text-xs text-fg-2"
          >
            Город
          </label>
          <div className="relative">
            <input
              id="city-input"
              value={data.city}
              onChange={(e) => updateData("city", e.target.value)}
              onFocus={() => setIsCityInputFocused(true)}
              onBlur={() => setTimeout(() => setIsCityInputFocused(false), 200)}
              placeholder="Введите название..."
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-fg-3"
            />
            {isCityInputFocused && cities.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-surface border border-accent rounded-lg mt-1 z-[100] max-h-60 overflow-y-auto">
                {cities.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => {
                      updateData("city", c);
                      setIsCityInputFocused(false);
                    }}
                    className="w-full text-left p-4 hover:bg-[var(--accent)] hover:text-[var(--text-on-accent)] cursor-pointer text-sm border-b border-line-soft last:border-none transition-all"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div>
        <label
          htmlFor="bio-textarea"
          className="mb-1.5 block text-xs text-fg-2"
        >
          О себе
        </label>
        <textarea
          id="bio-textarea"
          value={data.bio}
          onChange={(e) => updateData("bio", e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-fg outline-none transition-colors focus:border-fg-3"
        ></textarea>
      </div>

      <div className="pt-6 border-t border-line-soft space-y-4">
        <span className="block text-sm font-medium text-fg-2">
          Социальные сети
        </span>

        {socialLinks && socialLinks.length > 0 ? (
          <div className="space-y-3">
            {socialLinks.map((link) => (
              <div
                key={link.id}
                className="flex gap-3 items-center bg-surface p-3 rounded-lg border border-line-soft"
              >
                <select
                  aria-label="Соцсеть"
                  value={link.network}
                  onChange={(e) =>
                    updateSocialLink(link.id, "network", e.target.value)
                  }
                  className="h-10 cursor-pointer rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none"
                >
                  <option value="telegram">Telegram</option>
                  <option value="vk">VK</option>
                  <option value="steam">Steam</option>
                  <option value="github">GitHub</option>
                  <option value="instagram">Instagram</option>
                </select>

                <input
                  type="text"
                  value={link.username}
                  onChange={(e) =>
                    updateSocialLink(link.id, "username", e.target.value)
                  }
                  placeholder="Никнейм/ID"
                  aria-label="Никнейм или ID"
                  className="h-10 min-w-0 flex-grow rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-fg-3"
                />

                <button
                  type="button"
                  onClick={() => removeSocialLink(link.id)}
                  aria-label="Удалить ссылку"
                  className="p-2.5 text-danger border border-danger-line rounded-lg hover:bg-[#2a1b1b] transition-colors text-sm font-medium"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-2">
            Социальные сети пока не привязаны.
          </p>
        )}

        <button
          type="button"
          onClick={addSocialLink}
          className="bg-surface-2 hover:bg-line border border-line text-fg font-medium px-4 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Добавить ссылку
        </button>
      </div>
    </div>
  );
}
