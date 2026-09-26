"use client";

import { useState } from "react";
import { Pencil, Trash2, Trophy } from "lucide-react";
import type { Achievement } from "../types";
import {
  Notice,
  PanelTitle,
  adminRequest,
  buttonClass,
  inputClass,
  labelClass,
  panelClass,
  useNotice,
} from "../ui";

const RULES: Record<string, string> = {
  manual: "Вручную (выдаёт админ)",
  total_scrobbles: "Число прослушиваний",
  night_scrobbles: "Ночные прослушивания (00–06)",
  specific_artist: "Исполнитель",
  specific_track: "Трек",
  specific_album: "Альбом (уникальные треки)",
};

type Form = {
  name: string;
  description: string;
  icon: string;
  rule_type: string;
  rule_value: string;
  rule_target: string;
  rule_meta: string;
  target_image: string;
  reward_xp: string;
};

const EMPTY: Form = {
  name: "",
  description: "",
  icon: "🏆",
  rule_type: "manual",
  rule_value: "1",
  rule_target: "",
  rule_meta: "",
  target_image: "",
  reward_xp: "50",
};

function toForm(a: Achievement): Form {
  return {
    name: a.name,
    description: a.description ?? "",
    icon: a.icon ?? "",
    rule_type: a.rule_type,
    rule_value: String(a.rule_value ?? 0),
    rule_target: a.rule_target ?? "",
    rule_meta: a.rule_meta ?? "",
    target_image: a.target_image ?? "",
    reward_xp: String(a.reward_xp ?? 0),
  };
}

/** Create, edit and delete achievements and their unlock rules. */
export default function AchievementsManager({
  achievements,
  onChanged,
}: Readonly<{ achievements: Achievement[]; onChanged: () => void }>) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { notice, run } = useNotice();
  const set =
    (key: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [key]: e.target.value });
  const needsTarget = form.rule_type.startsWith("specific_");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const json = {
      ...form,
      rule_value: Number(form.rule_value || 0),
      reward_xp: Number(form.reward_xp || 0),
      rule_target: form.rule_target || null,
      rule_meta: form.rule_meta || null,
      target_image: form.target_image || null,
    };
    const ok = await run(
      () =>
        editingId === null
          ? adminRequest("/api/admin/achievements", { method: "POST", json })
          : adminRequest(`/api/admin/achievements/${editingId}`, {
              method: "PUT",
              json,
            }),
      editingId === null ? "Достижение создано" : "Достижение обновлено",
    );
    if (ok) {
      setForm(EMPTY);
      setEditingId(null);
      onChanged();
    }
  };

  const remove = async (a: Achievement) => {
    if (!confirm(`Удалить «${a.name}»? Оно пропадёт у всех, кто его получил.`))
      return;
    if (
      await run(
        () =>
          adminRequest(`/api/admin/achievements/${a.id}`, { method: "DELETE" }),
        "Достижение удалено",
      )
    )
      onChanged();
  };

  return (
    <section className="space-y-4" aria-labelledby="achievements-heading">
      <form onSubmit={save} className={panelClass}>
        <PanelTitle
          icon={
            <Trophy className="w-4 h-4 text-purple-400" aria-hidden="true" />
          }
        >
          <span id="achievements-heading">
            {editingId === null
              ? "Новое достижение"
              : `Редактирование #${editingId}`}
          </span>
        </PanelTitle>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="sm:col-span-2">
            <span className={labelClass}>Название</span>
            <input
              value={form.name}
              onChange={set("name")}
              required
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Иконка</span>
            <input
              value={form.icon}
              onChange={set("icon")}
              required
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>Награда, XP</span>
            <input
              type="number"
              min={0}
              value={form.reward_xp}
              onChange={set("reward_xp")}
              className={inputClass}
            />
          </label>
          <label className="sm:col-span-4">
            <span className={labelClass}>
              Описание (ссылки: [текст](https://…))
            </span>
            <input
              value={form.description}
              onChange={set("description")}
              required
              className={inputClass}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>Правило</span>
            <select
              value={form.rule_type}
              onChange={set("rule_type")}
              className={inputClass}
            >
              {Object.entries(RULES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {form.rule_type !== "manual" && (
            <label>
              <span className={labelClass}>Нужно раз / треков</span>
              <input
                type="number"
                min={1}
                value={form.rule_value}
                onChange={set("rule_value")}
                className={inputClass}
              />
            </label>
          )}
          {needsTarget && (
            <>
              <label className="sm:col-span-2">
                <span className={labelClass}>
                  Цель: «Исполнитель - Трек», имя или ссылка
                </span>
                <input
                  value={form.rule_target}
                  onChange={set("rule_target")}
                  required
                  className={inputClass}
                />
              </label>
              <label>
                <span className={labelClass}>Подпись (необязательно)</span>
                <input
                  value={form.rule_meta}
                  onChange={set("rule_meta")}
                  className={inputClass}
                />
              </label>
              <label>
                <span className={labelClass}>Картинка (URL)</span>
                <input
                  type="url"
                  value={form.target_image}
                  onChange={set("target_image")}
                  className={inputClass}
                />
              </label>
            </>
          )}
        </div>
        {needsTarget && (
          <p className="text-[11px] text-gray-400">
            Для ссылки на Яндекс Музыку или Spotify название, обложка и число
            треков альбома подтянутся автоматически.
          </p>
        )}
        <Notice text={notice} />
        <div className="flex gap-2">
          <button type="submit" className={buttonClass.primary}>
            {editingId === null ? "Создать" : "Сохранить"}
          </button>
          {editingId !== null && (
            <button
              type="button"
              className={buttonClass.secondary}
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY);
              }}
            >
              Отмена
            </button>
          )}
        </div>
      </form>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {achievements.map((a) => (
          <li
            key={a.id}
            className="bg-[#141418] border border-white/5 p-3.5 rounded-xl flex items-start gap-3"
          >
            <div
              className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-xl shrink-0"
              aria-hidden="true"
            >
              {a.icon || "🏆"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-white text-xs truncate">
                {a.name}
              </div>
              <div className="text-[11px] text-gray-400 truncate">
                {a.description}
              </div>
              <div className="text-[10px] font-mono mt-0.5 text-gray-400">
                {RULES[a.rule_type] ?? a.rule_type}
                {a.rule_type !== "manual" && ` ≥ ${a.rule_value}`} ·{" "}
                <span className="text-emerald-400">+{a.reward_xp} XP</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                aria-label={`Изменить ${a.name}`}
                className="p-1.5 hover:bg-white/10 rounded-lg text-blue-300"
                onClick={() => {
                  setEditingId(a.id);
                  setForm(toForm(a));
                }}
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Удалить ${a.name}`}
                className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400"
                onClick={() => remove(a)}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
