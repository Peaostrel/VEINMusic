"use client";
import { useEffect, useState } from "react";
import { jsonRequest, qualityRequest } from "@/app/lib/qualityApi";
import { btn, input } from "@/components/ui";
import { useT } from "@/app/lib/i18n/client";
import { tr } from "@/app/lib/i18n/active";

interface Listen {
  id: number;
  played_at: string;
  source: string;
  confirmed_sources: string[];
  status: {
    label: string;
    explanation: string;
    listened_sec: number;
    required_sec: number;
  };
  track: { title: string; artist: string; album: string | null };
}
interface Page {
  items: Listen[];
  next_cursor: string | null;
}
interface Preview {
  count: number;
  sample: { id: number; title: string; artist: string }[];
}
type Action = "exclude" | "restore" | "delete" | "edit";

export default function HistoryManager() {
  const t = useT();
  const [page, setPage] = useState<Page>({ items: [], next_cursor: null });
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [status, setStatus] = useState("all");
  const [cursor, setCursor] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [action, setAction] = useState<Action>("exclude");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q, source, status, limit: "50" });
      if (cursor) params.set("cursor", cursor);
      if (start)
        params.set("start", new Date(`${start}T00:00:00`).toISOString());
      if (end) {
        const date = new Date(`${end}T00:00:00`);
        date.setDate(date.getDate() + 1);
        params.set("end", date.toISOString());
      }
      qualityRequest<Page>(`/api/me/history?${params}`, {
        signal: controller.signal,
      })
        .then((value) => {
          setPage(value);
          setSelected([]);
          setPreview(null);
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted)
            setMessage(
              cause instanceof Error ? cause.message : tr("Ошибка загрузки"),
            );
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, source, start, end, status, cursor, revision]);
  const data = {
    ids: selected,
    action,
    title: title || null,
    artist: artist || null,
  };
  const perform = async (mode: "preview" | "apply" | "undo") => {
    setBusy(true);
    try {
      if (mode === "preview") {
        setPreview(
          await qualityRequest<Preview>(
            "/api/me/history/preview",
            jsonRequest("POST", data),
          ),
        );
      } else if (mode === "undo") {
        await qualityRequest(
          `/api/me/history/undo/${undo}`,
          jsonRequest("POST", {}),
        );
        setUndo(null);
        setMessage(t("Изменение отменено."));
        setRevision((value) => value + 1);
      } else {
        const result = await qualityRequest<{ count: number; undo_id: string }>(
          "/api/me/history/apply",
          jsonRequest("POST", data),
        );
        setUndo(result.undo_id);
        setPreview(null);
        setMessage(
          t("Изменено записей: {n}. Отмена доступна 24 часа.", {
            n: result.count,
          }),
        );
        setRevision((value) => value + 1);
      }
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : t("Не удалось выполнить действие"),
      );
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    setCursor("");
    setPreview(null);
    setSelected([]);
  };
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">
        {t("История и зачёт прослушиваний")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span>{t("Поиск")}</span>
          <input
            aria-label={t("Поиск в истории")}
            className={input}
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              reset();
            }}
          />
        </label>
        <label className="text-sm">
          <span>{t("Источник")}</span>
          <input
            aria-label={t("Источник истории")}
            placeholder={t("Точное название из записи")}
            className={input}
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              reset();
            }}
          />
        </label>
        <label className="text-sm">
          <span>{t("Состояние")}</span>
          <select
            className={input}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              reset();
            }}
          >
            <option value="all">{t("Все")}</option>
            <option value="counted">{t("Засчитанные")}</option>
            <option value="incomplete">{t("Незавершённые")}</option>
            <option value="excluded">{t("Исключённые")}</option>
            <option value="metadata">{t("Без полных метаданных")}</option>
          </select>
        </label>
        <label className="text-sm">
          <span>{t("С даты")}</span>
          <input
            type="date"
            className={input}
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              reset();
            }}
          />
        </label>
        <label className="text-sm">
          <span>{t("По дату")}</span>
          <input
            type="date"
            className={input}
            value={end}
            onChange={(event) => {
              setEnd(event.target.value);
              reset();
            }}
          />
        </label>
      </div>
      <output aria-live="polite" className="block text-sm">
        {message}
      </output>
      {undo && (
        <button
          className={btn.secondary}
          disabled={busy}
          onClick={() => {
            void perform("undo");
          }}
        >
          {t("Отменить изменение")}
        </button>
      )}
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={
            page.items.length > 0 && selected.length === page.items.length
          }
          onChange={(event) => {
            setSelected(
              event.target.checked ? page.items.map((item) => item.id) : [],
            );
            setPreview(null);
          }}
        />{" "}
        {t("Выбрать записи этой страницы")}
      </label>
      <div className="divide-y divide-line rounded-xl border border-line">
        {page.items.map((item) => (
          <label key={item.id} className="flex items-start gap-3 p-4">
            <input
              aria-label={t("Выбрать {title}", { title: item.track.title })}
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(event) => {
                setSelected((ids) =>
                  event.target.checked
                    ? [...ids, item.id]
                    : ids.filter((id) => id !== item.id),
                );
                setPreview(null);
              }}
            />
            <span className="min-w-0">
              <span className="block font-medium">
                {item.track.artist} — {item.track.title}
              </span>
              <span className="block text-xs text-fg-3">
                {new Date(item.played_at).toLocaleString(t.locale)} ·{" "}
                {item.confirmed_sources
                  .map((value) => {
                    // "<source> · клиент|облако|живое подключение"
                    const [name, kind] = value.split(" · ");
                    return kind ? `${name} · ${t(kind)}` : value;
                  })
                  .join(", ")}
              </span>
              <span className="block text-sm">
                {t(item.status.label)} ·{" "}
                {t("{listened} / {required} с", {
                  listened: item.status.listened_sec,
                  required: item.status.required_sec,
                })}
              </span>
              <span className="block text-xs text-fg-3">
                {t(item.status.explanation)}
              </span>
            </span>
          </label>
        ))}
        {!page.items.length && (
          <p className="p-4 text-sm">{t("Записей не найдено.")}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {cursor && (
          <button
            className={btn.secondary}
            onClick={() => {
              setCursor("");
              setSelected([]);
            }}
          >
            {t("К последним")}
          </button>
        )}
        {page.next_cursor && (
          <button
            className={btn.secondary}
            onClick={() => {
              setCursor(page.next_cursor ?? "");
              setSelected([]);
            }}
          >
            {t("Следующие 50")}
          </button>
        )}
      </div>
      <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <p>{t("Выбрано: {n}", { n: selected.length })}</p>
        <label>
          <span>{t("Действие")}</span>
          <select
            className={input}
            value={action}
            onChange={(event) => {
              setAction(event.target.value as Action);
              setPreview(null);
            }}
          >
            <option value="exclude">{t("Исключить из статистики")}</option>
            <option value="restore">{t("Вернуть в статистику")}</option>
            <option value="delete">{t("Удалить")}</option>
            <option value="edit">{t("Исправить метаданные")}</option>
          </select>
        </label>
        {action === "edit" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span>{t("Новое название")}</span>
              <input
                className={input}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label>
              <span>{t("Новый исполнитель")}</span>
              <input
                className={input}
                value={artist}
                onChange={(event) => {
                  setArtist(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
          </div>
        )}
        <button
          className={btn.secondary}
          disabled={busy || !selected.length}
          onClick={() => {
            void perform("preview");
          }}
        >
          {t("Предварительный просмотр")}
        </button>
        {preview && (
          <div className="space-y-3">
            <p>
              {t("Будет изменено записей: {n}. Отмена — в течение 24 часов.", {
                n: preview.count,
              })}
            </p>
            <ul className="text-sm">
              {preview.sample.map((item) => (
                <li key={item.id}>
                  {item.artist} — {item.title}
                </li>
              ))}
            </ul>
            <button
              className={btn.primary}
              disabled={busy}
              onClick={() => {
                void perform("apply");
              }}
            >
              {t("Применить к {n} записям", { n: preview.count })}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
