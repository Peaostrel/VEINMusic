"use client";
import { useEffect, useState } from "react";
import { jsonRequest, qualityRequest } from "@/app/lib/qualityApi";
import { btn, input } from "@/components/ui";

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
              cause instanceof Error ? cause.message : "Ошибка загрузки",
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
        setMessage("Изменение отменено.");
        setRevision((value) => value + 1);
      } else {
        const result = await qualityRequest<{ count: number; undo_id: string }>(
          "/api/me/history/apply",
          jsonRequest("POST", data),
        );
        setUndo(result.undo_id);
        setPreview(null);
        setMessage(
          `Изменено записей: ${result.count}. Отмена доступна 24 часа.`,
        );
        setRevision((value) => value + 1);
      }
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Не удалось выполнить действие",
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
      <h2 className="text-lg font-semibold">История и зачёт прослушиваний</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span>Поиск</span>
          <input
            aria-label="Поиск в истории"
            className={input}
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              reset();
            }}
          />
        </label>
        <label className="text-sm">
          <span>Источник</span>
          <input
            aria-label="Источник истории"
            placeholder="Точное название из записи"
            className={input}
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              reset();
            }}
          />
        </label>
        <label className="text-sm">
          <span>Состояние</span>
          <select
            className={input}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              reset();
            }}
          >
            <option value="all">Все</option>
            <option value="counted">Засчитанные</option>
            <option value="incomplete">Незавершённые</option>
            <option value="excluded">Исключённые</option>
            <option value="metadata">Без полных метаданных</option>
          </select>
        </label>
        <label className="text-sm">
          <span>С даты</span>
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
          <span>По дату</span>
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
          Отменить изменение
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
        Выбрать записи этой страницы
      </label>
      <div className="divide-y divide-line rounded-xl border border-line">
        {page.items.map((item) => (
          <label key={item.id} className="flex items-start gap-3 p-4">
            <input
              aria-label={`Выбрать ${item.track.title}`}
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
                {new Date(item.played_at).toLocaleString("ru-RU")} ·{" "}
                {item.confirmed_sources.join(", ")}
              </span>
              <span className="block text-sm">
                {item.status.label} · {item.status.listened_sec} /{" "}
                {item.status.required_sec} с
              </span>
              <span className="block text-xs text-fg-3">
                {item.status.explanation}
              </span>
            </span>
          </label>
        ))}
        {!page.items.length && (
          <p className="p-4 text-sm">Записей не найдено.</p>
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
            К последним
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
            Следующие 50
          </button>
        )}
      </div>
      <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <p>Выбрано: {selected.length}</p>
        <label>
          <span>Действие</span>
          <select
            className={input}
            value={action}
            onChange={(event) => {
              setAction(event.target.value as Action);
              setPreview(null);
            }}
          >
            <option value="exclude">Исключить из статистики</option>
            <option value="restore">Вернуть в статистику</option>
            <option value="delete">Удалить</option>
            <option value="edit">Исправить метаданные</option>
          </select>
        </label>
        {action === "edit" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span>Новое название</span>
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
              <span>Новый исполнитель</span>
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
          Предварительный просмотр
        </button>
        {preview && (
          <div className="space-y-3">
            <p>
              Будет изменено записей: {preview.count}. Отмена — в течение 24
              часов.
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
              Применить к {preview.count} записям
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
