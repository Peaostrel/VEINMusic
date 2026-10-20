"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Pause, Play, Save, Send, Trash2 } from "lucide-react";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import { openSocket } from "@/app/lib/api";
import { isValidUser } from "@/app/lib/theme";
import { plural } from "@/app/lib/plural";
import { useT } from "@/app/lib/i18n/client";
import { Avatar, Meter, btn, inputOnCard } from "@/components/ui";

interface ChatMessage {
  from: string;
  text: string;
  timestamp: number;
}

interface TrackState {
  title: string;
  artist: string;
  album?: string;
  cover_url?: string;
  duration: number;
  progress_sec: number;
  is_playing: boolean;
  updated_at: number;
}

interface PageProps {
  readonly params: Promise<{ roomId: string }>;
}

export default function TogetherRoomPage({ params }: Readonly<PageProps>) {
  const t = useT();
  const { roomId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomNameParam = searchParams.get("name") || t("Музыкальная комната");
  const initialRoomNameRef = useRef(roomNameParam);

  const [connected, setConnected] = useState(false);
  const [listeners, setListeners] = useState<string[]>([]);
  const [host, setHost] = useState("");
  const [me, setMe] = useState("");
  const [roomName, setRoomName] = useState(roomNameParam);
  const [roomNameDraft, setRoomNameDraft] = useState(roomNameParam);
  const [isPrivate, setIsPrivate] = useState(false);
  const [privateDraft, setPrivateDraft] = useState(false);
  const [roomNotice, setRoomNotice] = useState("");
  // The server names unauthenticated listeners "Guest_…" (real usernames are lowercase)
  const isGuest = me.startsWith("Guest_");
  const [track, setTrack] = useState<TrackState>({
    title: t("Ожидание трека от DJ…"),
    artist: "VEINMusic",
    album: "",
    cover_url: "",
    duration: 180,
    progress_sec: 0,
    is_playing: false,
    updated_at: 0,
  });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [currentProgress, setCurrentProgress] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);

  // Connect to WebSocket
  useEffect(() => {
    const safeRoomId = encodeURIComponent(roomId);
    const setup = (ws: WebSocket) => {
      socketRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "ROOM_STATE") {
            setConnected(true);
            setListeners(data.listeners || []);
            setHost(data.host || "");
            setMe(data.you || "");
            const nextName = data.name || initialRoomNameRef.current;
            setRoomName(nextName);
            setRoomNameDraft(nextName);
            setIsPrivate(Boolean(data.is_private));
            setPrivateDraft(Boolean(data.is_private));
            if (data.current_track) {
              setTrack({
                ...data.current_track,
                cover_url: sanitizeImageUrl(data.current_track.cover_url) || "",
              });
            }
            if (data.chat_history) setChatMessages(data.chat_history);
          } else if (data.type === "USER_JOINED" || data.type === "USER_LEFT") {
            setListeners(data.listeners || []);
          } else if (data.type === "TRACK_SYNC") {
            if (data.track) {
              setTrack({
                ...data.track,
                cover_url: sanitizeImageUrl(data.track.cover_url) || "",
              });
            }
          } else if (data.type === "PLAYBACK_CONTROL") {
            setTrack((prev) => ({
              ...prev,
              is_playing: data.is_playing,
              progress_sec: data.progress_sec,
              updated_at: Date.now() / 1000,
            }));
          } else if (data.type === "CHAT_MESSAGE") {
            setChatMessages((prev) => [
              ...prev,
              { from: data.from, text: data.text, timestamp: data.timestamp },
            ]);
          } else if (data.type === "ROOM_SETTINGS") {
            setRoomName(data.name);
            setRoomNameDraft(data.name);
            setIsPrivate(Boolean(data.is_private));
            setPrivateDraft(Boolean(data.is_private));
            setRoomNotice(t("Настройки комнаты сохранены"));
          } else if (data.type === "ROOM_DELETED") {
            router.replace("/together");
          }
        } catch (e) {
          console.warn("WS error:", e);
        }
      };

      ws.onclose = () => setConnected(false);
    };
    // Signed-in listeners are identified by name; guests join anonymously
    const initialName = encodeURIComponent(initialRoomNameRef.current);
    return openSocket(
      `/ws/together/${safeRoomId}?name=${initialName}`,
      setup,
      { authed: isValidUser(localStorage.getItem("username")) },
    );
  }, [roomId, router, t]);

  // Smooth progress bar calculation
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      if (track.is_playing) {
        const nowSec = Date.now() / 1000;
        const elapsed = Math.max(0, nowSec - (track.updated_at || nowSec));
        const calc = Math.min(
          Math.max(0, track.progress_sec || 0) + elapsed,
          track.duration || 180,
        );
        setCurrentProgress(calc);
      } else {
        setCurrentProgress(track.progress_sec || 0);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [track, connected]);

  // Scroll only the chat box: scrollIntoView also scrolled the page, so on
  // phones opening a room jumped past the player down to the chat
  useEffect(() => {
    const box = chatBoxRef.current;
    box?.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [chatMessages]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || socketRef.current?.readyState !== WebSocket.OPEN)
      return;

    socketRef.current.send(
      JSON.stringify({
        type: "CHAT_MESSAGE",
        text: chatInput,
      }),
    );
    setChatInput("");
  };

  const isHost = !!me && me === host;

  const sendPlayback = (isPlaying: boolean, progressSec: number) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN || !isHost) return;
    socketRef.current.send(
      JSON.stringify({
        type: "PLAYBACK_CONTROL",
        is_playing: isPlaying,
        progress_sec: progressSec,
      }),
    );
  };

  const handleTogglePlay = () =>
    sendPlayback(!track.is_playing, currentProgress);

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const position = Number(event.target.value);
    setCurrentProgress(position);
    setTrack((previous) => ({
      ...previous,
      progress_sec: position,
      updated_at: Date.now() / 1000,
    }));
    sendPlayback(track.is_playing, position);
  };

  const handleSaveRoom = () => {
    const name = roomNameDraft.trim();
    if (!name || socketRef.current?.readyState !== WebSocket.OPEN || !isHost)
      return;
    setRoomNotice("");
    socketRef.current.send(
      JSON.stringify({
        type: "ROOM_SETTINGS",
        name,
        is_private: privateDraft,
      }),
    );
  };

  const handleDeleteRoom = () => {
    if (
      !isHost ||
      socketRef.current?.readyState !== WebSocket.OPEN ||
      !window.confirm(t("Удалить комнату для всех участников?"))
    )
      return;
    socketRef.current.send(JSON.stringify({ type: "DELETE_ROOM" }));
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPct = Math.min(
    100,
    Math.max(0, (currentProgress / (track.duration || 180)) * 100),
  );

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 py-8 sm:px-8 lg:px-12 lg:py-8">
      <header className="flex flex-col gap-2.5">
        <Link
          href="/library/discover"
          className="text-xs text-fg-2 hover:text-fg"
        >
          {t("Подборка для двоих")}
        </Link>
        <Link
          href="/together"
          className="self-start text-[13px] text-fg-2 hover:text-fg"
        >
          {t("← Все комнаты")}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">
            {roomName}
          </h1>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line px-2 font-mono text-[11px] text-fg-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-ok" : "bg-danger"}`}
            />
            {connected ? t("синхронно") : t("подключение…")}
          </span>
          <span className="font-mono text-xs text-fg-3">
            {listeners.length}{" "}
            {plural(listeners.length, "слушатель", "слушателя", "слушателей")}
          </span>
        </div>
        {isPrivate && (
          <span className="inline-flex w-fit items-center gap-1.5 text-xs text-fg-2">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Приватная комната — доступ по ссылке")}
          </span>
        )}
      </header>

      {isHost && (
        <section
          aria-label={t("Настройки комнаты")}
          className="grid gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-[minmax(0,1fr)_auto_auto]"
        >
          <input
            type="text"
            value={roomNameDraft}
            onChange={(event) => setRoomNameDraft(event.target.value)}
            maxLength={60}
            aria-label={t("Название комнаты")}
            className={inputOnCard}
          />
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm">
            <input
              type="checkbox"
              checked={privateDraft}
              onChange={(event) => setPrivateDraft(event.target.checked)}
            />
            {t("Приватная")}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveRoom}
              disabled={!connected || !roomNameDraft.trim()}
              className={`${btn.primary} ${btn.md}`}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {t("Сохранить")}
            </button>
            <button
              type="button"
              onClick={handleDeleteRoom}
              disabled={!connected}
              className={`${btn.secondary} ${btn.md} text-danger`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t("Удалить")}
            </button>
          </div>
          {roomNotice && (
            <p className="text-xs text-ok md:col-span-3">{roomNotice}</p>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-label={t("Сейчас играет")}
            className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-6 md:p-7"
          >
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-7">
              {sanitizeImageUrl(track.cover_url) ? (
                <img
                  src={sanitizeImageUrl(track.cover_url)}
                  alt=""
                  className="h-44 w-44 shrink-0 rounded-lg object-cover md:h-[200px] md:w-[200px]"
                />
              ) : (
                <span className="h-44 w-44 shrink-0 rounded-lg bg-surface-2 md:h-[200px] md:w-[200px]" />
              )}
              <div className="flex min-w-0 flex-col gap-2 text-center sm:text-left">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">
                  {t("ставит DJ {host}", { host: host ? `@${host}` : "—" })}
                </span>
                <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-[30px]">
                  {/* The server's placeholder before the DJ plays anything */}
                  {track.title === "Ожидание трека от DJ..."
                    ? t(track.title)
                    : track.title}
                </h2>
                <span className="text-base text-fg-2">
                  {track.artist}
                  {track.album ? ` · ${track.album}` : ""}
                </span>
                <span
                  aria-hidden="true"
                  className="mt-2 flex h-[22px] items-end justify-center gap-1 sm:justify-start"
                >
                  {[8, 16, 22, 14, 10, 18, 12].map((h, idx) => (
                    <span
                      key={idx}
                      className={`w-1 rounded-full bg-accent ${track.is_playing && connected ? "eq-bar" : ""}`}
                      style={{
                        height: track.is_playing && connected ? h : 3,
                        animationDelay: `${idx * 0.12}s`,
                      }}
                    />
                  ))}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {isHost ? (
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, track.duration || 180)}
                  step={1}
                  value={Math.min(currentProgress, track.duration || 180)}
                  onChange={handleSeek}
                  disabled={!connected}
                  aria-label={t("Перемотка")}
                  className="music-progress block h-2 w-full cursor-pointer"
                />
              ) : (
                <Meter value={progressPct} height={4} />
              )}
              <div className="flex justify-between font-mono text-xs text-fg-3">
                <span>{formatTime(currentProgress)}</span>
                <span>{formatTime(track.duration || 180)}</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleTogglePlay}
                disabled={!isHost || !connected}
                aria-label={track.is_playing ? t("Пауза") : t("Играть")}
                className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full transition-colors ${
                  isHost
                    ? "bg-accent text-on-accent hover:brightness-110"
                    : "cursor-not-allowed bg-line text-fg-3"
                }`}
              >
                {track.is_playing ? (
                  <Pause className="h-5 w-5 fill-current" aria-hidden="true" />
                ) : (
                  <Play
                    className="ml-0.5 h-5 w-5 fill-current"
                    aria-hidden="true"
                  />
                )}
              </button>
              <span className="text-[13px] text-fg-3">
                {isHost
                  ? t("Вы DJ — пауза и перемотка идут у всех")
                  : t("Управлять воспроизведением может только DJ")}
              </span>
            </div>
          </section>

          <section
            aria-labelledby="people-title"
            className="flex flex-col gap-3.5"
          >
            <h2 id="people-title" className="text-sm font-semibold">
              {t("В комнате ({n})", { n: listeners.length })}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {listeners.map((user) => (
                <li
                  key={user}
                  className="inline-flex h-[34px] items-center gap-2 rounded-full border border-line pl-1 pr-3 text-[13px]"
                >
                  <Avatar seed={user} size={26} />
                  {user}
                  {user === host && (
                    <span className="font-mono text-[10px] text-accent">
                      DJ
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section
          aria-labelledby="chat-title"
          className="flex h-[560px] flex-col rounded-xl border border-line bg-surface"
        >
          <h2
            id="chat-title"
            className="border-b border-line px-5 py-4 text-sm font-semibold"
          >
            {t("Чат комнаты")}
          </h2>
          <div
            ref={chatBoxRef}
            aria-live="polite"
            className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4"
          >
            {chatMessages.length === 0 ? (
              <p className="m-auto text-center text-[13px] text-fg-3">
                {t("Здесь пока тихо. Напишите первое сообщение!")}
              </p>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={`${msg.from}-${msg.timestamp}-${msg.text.slice(0, 15)}`}
                  className="flex flex-col gap-0.5"
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`text-[13px] font-medium ${msg.from === host ? "text-accent" : "text-fg"}`}
                    >
                      {msg.from}
                    </span>
                    <span className="font-mono text-[10px] text-fg-3">
                      {new Date(msg.timestamp * 1000).toLocaleTimeString(
                        t.locale,
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </span>
                  </span>
                  <p className="break-words text-sm leading-snug text-fg-2">
                    {msg.text}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Signed-in listeners only; guests just listen */}
          {isGuest ? (
            <p className="border-t border-line px-5 py-4 text-[13px] text-fg-2">
              {t("Чтобы писать в чат,")}{" "}
              <Link
                href="/auth"
                className="text-accent underline underline-offset-2"
              >
                {t("войдите")}
              </Link>
              .
            </p>
          ) : (
            <form
              onSubmit={handleSendChat}
              className="flex gap-2 border-t border-line p-3"
            >
              <input
                autoComplete="off"
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={t("Написать в чат…")}
                aria-label={t("Сообщение в чат")}
                maxLength={300}
                className={inputOnCard}
              />
              <button
                type="submit"
                aria-label={t("Отправить")}
                className={`${btn.primary} h-10 w-10 shrink-0`}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
