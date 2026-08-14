export default function PrivacyTab({ data, updateData }: any) {
  return (
    <div className="p-6 md:p-8 space-y-8">
      <h2 className="text-xl font-bold mb-4 text-[var(--accent-text)]">
        Приватность
      </h2>
      <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex items-center justify-between">
        <div>
          <p className="font-bold text-white">Приватный профиль</p>
          <p className="text-xs text-gray-400">
            Скрыть историю от всех, кроме подписчиков.
          </p>
        </div>
        <button
          type="button"
          onClick={() => updateData("isPrivate", !data.isPrivate)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${data.isPrivate ? "bg-[var(--accent)]" : "bg-gray-700"}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${data.isPrivate ? "translate-x-6" : "translate-x-1"}`}
          />
        </button>
      </div>

      <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="font-bold text-white">Совместное прослушивание</p>
          <p className="text-xs text-gray-400">
            Кто может приглашать вас слушать музыку вместе.
          </p>
        </div>
        <select
          value={data.syncPrivacy || "all"}
          onChange={(e) => updateData("syncPrivacy", e.target.value)}
          className="bg-[#1e1e1e] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="all">Все пользователи</option>
          <option value="followers">Только те, на кого я подписан</option>
          <option value="none">Никто</option>
        </select>
      </div>
    </div>
  );
}
