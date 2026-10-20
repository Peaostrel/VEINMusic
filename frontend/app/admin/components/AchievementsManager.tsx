"use client";

import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";
import { tr } from "@/app/lib/i18n/active";
import { useId, useRef, useState } from "react";
import { Pencil, Plus, Trash2, Trophy, X } from "lucide-react";
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
  manual: msg("Вручную (выдаёт админ)"),
  total_scrobbles: msg("Число прослушиваний"),
  night_scrobbles: msg("Ночные прослушивания (00–06)"),
  specific_artist: msg("Исполнитель"),
  specific_track: msg("Трек"),
  specific_album: msg("Альбом (уникальные треки)"),
};

type Form = {
  name: string;
  description: string;
  name_en: string;
  description_en: string;
  icon: string;
  rule_type: string;
  rule_value: string;
  rule_target: string;
  artist_targets: string[];
  rule_meta: string;
  target_image: string;
  reward_xp: string;
};

const EMPTY: Form = {
  name: "",
  description: "",
  name_en: "",
  description_en: "",
  icon: "🏆",
  rule_type: "manual",
  rule_value: "1",
  rule_target: "",
  artist_targets: [""],
  rule_meta: "",
  target_image: "",
  reward_xp: "50",
};

function textValue(value: string | null | undefined): string {
  return value ?? "";
}

function numberValue(value: number | null | undefined): string {
  return String(value ?? 0);
}

function achievementArtistTargets(a: Achievement): string[] {
  if (a.artist_targets?.length) return a.artist_targets;
  return [textValue(a.rule_target)];
}

function toForm(a: Achievement): Form {
  return {
    name: a.name,
    description: textValue(a.description),
    name_en: textValue(a.name_en),
    description_en: textValue(a.description_en),
    icon: textValue(a.icon),
    rule_type: a.rule_type,
    rule_value: numberValue(a.rule_value),
    rule_target: textValue(a.rule_target),
    artist_targets: achievementArtistTargets(a),
    rule_meta: textValue(a.rule_meta),
    target_image: textValue(a.target_image),
    reward_xp: numberValue(a.reward_xp),
  };
}

function emptyAsNull(value: string): string | null {
  return value || null;
}

function artistTargetsPayload(form: Form): string[] | null {
  if (form.rule_type !== "specific_artist") return null;
  return form.artist_targets.map((value) => value.trim()).filter(Boolean);
}

function toPayload(form: Form) {
  return {
    ...form,
    rule_value: Number(form.rule_value || 0),
    reward_xp: Number(form.reward_xp || 0),
    name_en: emptyAsNull(form.name_en.trim()),
    description_en: emptyAsNull(form.description_en.trim()),
    rule_target: emptyAsNull(form.rule_target),
    artist_targets: artistTargetsPayload(form),
    rule_meta: emptyAsNull(form.rule_meta),
    target_image: emptyAsNull(form.target_image),
  };
}

function formHeading(editingId: number | null): string {
  return editingId === null
    ? tr("Новое достижение")
    : tr("Редактирование #{id}", { id: editingId });
}

function submitLabel(editingId: number | null): string {
  return editingId === null ? tr("Создать") : tr("Сохранить");
}

function CancelEditButton({
  editingId,
  onCancel,
}: Readonly<{ editingId: number | null; onCancel: () => void }>) {
  const t = useT();
  if (editingId === null) return null;
  return (
    <button type="button" className={buttonClass.secondary} onClick={onCancel}>
      {t("Отмена")}
    </button>
  );
}

interface ArtistTargetsEditorProps {
  ids: string[];
  targets: string[];
  onAdd: () => void;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}

function ArtistTargetsEditor({
  ids,
  targets,
  onAdd,
  onChange,
  onRemove,
}: Readonly<ArtistTargetsEditorProps>) {
  const t = useT();
  return (
    <fieldset className="sm:col-span-4 space-y-2">
      <legend className={labelClass}>{t("Артисты")}</legend>
      {targets.map((target, index) => (
        <div key={ids[index]} className="flex items-center gap-2">
          <input
            autoComplete="off"
            value={target}
            onChange={(event) => onChange(index, event.target.value)}
            required
            placeholder={t("Имя или ссылка на артиста Яндекс Музыки")}
            aria-label={t("Артист {n}", { n: index + 1 })}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={t("Удалить артиста {n}", { n: index + 1 })}
            className="rounded-lg p-2 text-fg-3 hover:bg-line hover:text-danger"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        disabled={targets.length >= 20}
        className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline disabled:text-fg-3 disabled:no-underline"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {t("Добавить артиста")}
      </button>
      <p className="text-[11px] text-fg-3">
        {t("Все добавленные артисты войдут в одно достижение. В описании")}{" "}
        <code className="font-mono text-fg-2">{"{artists}"}</code>{" "}
        {t("превратится в кликабельный список имён.")}
      </p>
    </fieldset>
  );
}

/** Create, edit and delete achievements and their unlock rules. */
export default function AchievementsManager({
  achievements,
  onChanged,
}: Readonly<{ achievements: Achievement[]; onChanged: () => void }>) {
  const t = useT();
  const artistFieldPrefix = useId();
  const nextArtistField = useRef(1);
  const [form, setForm] = useState<Form>(EMPTY);
  const [artistTargetIds, setArtistTargetIds] = useState(() => [
    `${artistFieldPrefix}-0`,
  ]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { notice, run } = useNotice();
  const set =
    (key: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [key]: e.target.value });
  const needsTarget = form.rule_type.startsWith("specific_");

  const setArtistTarget = (index: number, value: string) => {
    const artistTargets = [...form.artist_targets];
    artistTargets[index] = value;
    setForm({ ...form, artist_targets: artistTargets });
  };

  const addArtistTarget = () => {
    if (form.artist_targets.length >= 20) return;
    const fieldNumber = nextArtistField.current;
    nextArtistField.current += 1;
    setForm({ ...form, artist_targets: [...form.artist_targets, ""] });
    setArtistTargetIds([
      ...artistTargetIds,
      `${artistFieldPrefix}-new-${fieldNumber}`,
    ]);
  };

  const removeArtistTarget = (index: number) => {
    const artistTargets = form.artist_targets.filter((_, i) => i !== index);
    const remainingIds = artistTargetIds.filter((_, i) => i !== index);
    setForm({
      ...form,
      artist_targets: artistTargets.length ? artistTargets : [""],
    });
    setArtistTargetIds(
      remainingIds.length ? remainingIds : [`${artistFieldPrefix}-empty`],
    );
  };

  const insertArtistsPlaceholder = () => {
    if (form.description.includes("{artists}")) return;
    const description = form.description.trim();
    setForm({
      ...form,
      description: description
        ? `${description} {artists}`
        : t("Прослушать все треки {artists}"),
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const json = toPayload(form);
    const ok = await run(
      () =>
        editingId === null
          ? adminRequest("/api/admin/achievements", { method: "POST", json })
          : adminRequest(`/api/admin/achievements/${editingId}`, {
              method: "PUT",
              json,
            }),
      editingId === null ? t("Достижение создано") : t("Достижение обновлено"),
    );
    if (ok) {
      setForm(EMPTY);
      setArtistTargetIds([`${artistFieldPrefix}-0`]);
      setEditingId(null);
      onChanged();
    }
  };

  const remove = async (a: Achievement) => {
    if (
      !confirm(
        t("Удалить «{name}»? Оно пропадёт у всех, кто его получил.", {
          name: a.name,
        }),
      )
    )
      return;
    if (
      await run(
        () =>
          adminRequest(`/api/admin/achievements/${a.id}`, { method: "DELETE" }),
        t("Достижение удалено"),
      )
    )
      onChanged();
  };

  const cancelEditing = () => {
    setEditingId(null);
    setForm(EMPTY);
    setArtistTargetIds([`${artistFieldPrefix}-0`]);
  };

  return (
    <section className="space-y-4" aria-labelledby="achievements-heading">
      <form onSubmit={save} className={panelClass}>
        <PanelTitle
          icon={<Trophy className="w-4 h-4 text-fg-2" aria-hidden="true" />}
        >
          <span id="achievements-heading">{formHeading(editingId)}</span>
        </PanelTitle>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="sm:col-span-2">
            <span className={labelClass}>{t("Название")}</span>
            <input
              autoComplete="off"
              value={form.name}
              onChange={set("name")}
              required
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>{t("Иконка")}</span>
            <input
              autoComplete="off"
              value={form.icon}
              onChange={set("icon")}
              required
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>{t("Награда, XP")}</span>
            <input
              autoComplete="off"
              type="number"
              min={0}
              value={form.reward_xp}
              onChange={set("reward_xp")}
              className={inputClass}
            />
          </label>
          <div className="sm:col-span-4">
            <span className="mb-1 flex items-center justify-between gap-3">
              <label
                htmlFor="achievement-description"
                className="text-[11px] text-fg-2"
              >
                {t("Описание (ссылки: [текст](https://…))")}
              </label>
              {form.rule_type === "specific_artist" && (
                <button
                  type="button"
                  onClick={insertArtistsPlaceholder}
                  className="text-[11px] text-accent hover:underline disabled:text-fg-3 disabled:no-underline"
                  disabled={form.description.includes("{artists}")}
                >
                  {t("Вставить список артистов")}
                </button>
              )}
            </span>
            <input
              autoComplete="off"
              id="achievement-description"
              value={form.description}
              onChange={set("description")}
              required
              className={inputClass}
            />
          </div>
          <label className="sm:col-span-2">
            <span className={labelClass}>{t("Название (английский)")}</span>
            <input
              autoComplete="off"
              value={form.name_en}
              onChange={set("name_en")}
              placeholder={t("Необязательно")}
              lang="en"
              className={inputClass}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>{t("Описание (английский)")}</span>
            <input
              autoComplete="off"
              value={form.description_en}
              onChange={set("description_en")}
              placeholder={t("Необязательно — иначе покажем русское")}
              lang="en"
              className={inputClass}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>{t("Правило")}</span>
            <select
              value={form.rule_type}
              onChange={(event) => {
                const ruleType = event.target.value;
                setForm({
                  ...form,
                  rule_type: ruleType,
                  artist_targets:
                    ruleType === "specific_artist" &&
                    form.artist_targets.length === 0
                      ? [""]
                      : form.artist_targets,
                });
              }}
              className={inputClass}
            >
              {Object.entries(RULES).map(([id, label]) => (
                <option key={id} value={id}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          {form.rule_type !== "manual" && (
            <label>
              <span className={labelClass}>{t("Нужно раз / треков")}</span>
              <input
                autoComplete="off"
                type="number"
                min={1}
                value={form.rule_value}
                onChange={set("rule_value")}
                className={inputClass}
              />
            </label>
          )}
          {needsTarget && form.rule_type === "specific_artist" && (
            <>
              <ArtistTargetsEditor
                ids={artistTargetIds}
                targets={form.artist_targets}
                onAdd={addArtistTarget}
                onChange={setArtistTarget}
                onRemove={removeArtistTarget}
              />
              <label className="sm:col-span-2">
                <span className={labelClass}>
                  {t("Подпись (необязательно)")}
                </span>
                <input
                  autoComplete="off"
                  value={form.rule_meta}
                  onChange={set("rule_meta")}
                  className={inputClass}
                />
              </label>
              <label className="sm:col-span-2">
                <span className={labelClass}>
                  {t("Обложка достижения (URL)")}
                </span>
                <input
                  autoComplete="off"
                  type="url"
                  value={form.target_image}
                  onChange={set("target_image")}
                  className={inputClass}
                />
              </label>
            </>
          )}
          {needsTarget && form.rule_type !== "specific_artist" && (
            <>
              <label className="sm:col-span-2">
                <span className={labelClass}>
                  {t("Цель: «Исполнитель - Трек», имя или ссылка")}
                </span>
                <input
                  autoComplete="off"
                  value={form.rule_target}
                  onChange={set("rule_target")}
                  required
                  className={inputClass}
                />
              </label>
              <label>
                <span className={labelClass}>
                  {t("Подпись (необязательно)")}
                </span>
                <input
                  autoComplete="off"
                  value={form.rule_meta}
                  onChange={set("rule_meta")}
                  className={inputClass}
                />
              </label>
              <label>
                <span className={labelClass}>{t("Картинка (URL)")}</span>
                <input
                  autoComplete="off"
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
          <p className="text-[11px] text-fg-2">
            {t(
              "Название и обложка подтянутся по ссылке автоматически. Количество треков — для альбомов и исполнителей Яндекс Музыки и альбомов Spotify.",
            )}
          </p>
        )}
        <Notice text={notice} />
        <div className="flex gap-2">
          <button type="submit" className={buttonClass.primary}>
            {submitLabel(editingId)}
          </button>
          <CancelEditButton editingId={editingId} onCancel={cancelEditing} />
        </div>
      </form>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {achievements.map((a) => (
          <li
            key={a.id}
            className="bg-surface border border-line-soft p-3.5 rounded-xl flex items-start gap-3"
          >
            <div
              className="w-10 h-10 rounded-lg bg-bg border border-line flex items-center justify-center text-xl shrink-0"
              aria-hidden="true"
            >
              {a.icon || "🏆"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-fg text-xs truncate">
                {t(a.name)}
              </div>
              <div className="text-[11px] text-fg-2 truncate">
                {t(a.rendered_description ?? a.description)}
              </div>
              <div className="text-[10px] font-mono mt-0.5 text-fg-2">
                {RULES[a.rule_type] ? t(RULES[a.rule_type]) : a.rule_type}
                {a.rule_type !== "manual" && ` ≥ ${a.rule_value}`} ·{" "}
                <span className="text-ok">+{a.reward_xp} XP</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                aria-label={t("Изменить {name}", { name: a.name })}
                className="p-1.5 hover:bg-line rounded-lg text-fg-2"
                onClick={() => {
                  const nextForm = toForm(a);
                  setEditingId(a.id);
                  setForm(nextForm);
                  setArtistTargetIds(
                    nextForm.artist_targets.map(
                      (_, index) => `${artistFieldPrefix}-${a.id}-${index}`,
                    ),
                  );
                }}
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t("Удалить {name}", { name: a.name })}
                className="p-1.5 hover:bg-[#2a1b1b] rounded-lg text-danger"
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
