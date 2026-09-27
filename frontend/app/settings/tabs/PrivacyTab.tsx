import type { SettingsData, UpdateData } from "../types";

export default function PrivacyTab({
  data,
  updateData,
}: Readonly<{ data: SettingsData; updateData: UpdateData }>) {
  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold text-fg mb-4">Приватность</h2>
      <div className="bg-surface p-6 rounded-xl border border-line-soft flex items-center justify-between">
        <div>
          <p className="font-medium text-fg">Приватный профиль</p>
          <p className="text-xs text-fg-2">
            Историю и статистику видите только вы. Подписчики тоже не получают
            доступ.
          </p>
        </div>
        <button
          type="button"
          onClick={() => updateData("isPrivate", !data.isPrivate)}
          role="switch"
          aria-checked={data.isPrivate}
          aria-label="Приватный профиль"
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${data.isPrivate ? "bg-accent" : "bg-line"}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-fg transition ${data.isPrivate ? "translate-x-6" : "translate-x-1"}`}
          />
        </button>
      </div>

      <div className="bg-surface p-6 rounded-xl border border-line-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="font-medium text-fg">Совместное прослушивание</p>
          <p className="text-xs text-fg-2">
            Кто может приглашать вас слушать музыку вместе.
          </p>
        </div>
        <select
          aria-label="Кто может приглашать слушать вместе"
          value={data.syncPrivacy || "all"}
          onChange={(e) => updateData("syncPrivacy", e.target.value)}
          className="bg-surface border border-line rounded-lg px-4 py-2 text-sm text-fg focus:outline-none focus:border-fg-3"
        >
          <option value="all">Все пользователи</option>
          <option value="followers">Только те, на кого я подписан</option>
          <option value="none">Никто</option>
        </select>
      </div>
    </div>
  );
}
