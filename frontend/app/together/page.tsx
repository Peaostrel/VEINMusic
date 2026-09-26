"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import { API_URL } from "@/app/lib/api";
import Dialog from "@/components/Dialog";
import { useFeature } from "@/app/lib/featureFlags";
import { plural } from "@/app/lib/plural";
import { useVisiblePolling } from "@/app/lib/usePolling";
import {
  Avatar,
  EmptyState,
  Loading,
  PageHeader,
  PlayingBars,
  btn,
  inputOnCard,
  label,
} from "@/components/ui";

interface RoomInfo {
  room_id: string;
  name: string;
  host_username: string;
  listeners_count: number;
  listeners: string[];
  current_track?: {
    title: string;
    artist: string;
    album?: string;
    cover_url?: string;
    is_playing: boolean;
  };
}

function RoomCard({ room }: Readonly<{ room: RoomInfo }>) {
  const track = room.current_track;
  const playing = Boolean(track?.is_playing);
  return (
    <Link
      href={`/together/${room.room_id}`}
      className="flex h-full flex-col gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:bg-surface-2"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-base font-semibold">{room.name}</span>
        <span
          className={`flex shrink-0 items-center gap-1.5 font-mono text-[11px] ${playing ? "text-accent" : "text-fg-3"}`}
        >
          {playing && <PlayingBars />}
          {playing ? "играет" : "пауза"}
        </span>
      </div>
      <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3.5">
        {track?.cover_url ? (
          <img
            src={track.cover_url}
            alt=""
            className="h-14 w-14 rounded-md object-cover"
          />
        ) : (
          <span className="h-14 w-14 rounded-md bg-surface-2" />
        )}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">
            {track?.title || "Ожидание трека"}
          </span>
          <span className="truncate text-[13px] text-fg-2">
            {track?.artist || "DJ пока выбирает"}
          </span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-fg-2">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar seed={room.host_username} size={22} />
          <span className="truncate">DJ @{room.host_username}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 font-mono">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {room.listeners_count}
        </span>
      </div>
    </Link>
  );
}

export default function ListenTogetherLobby() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRoomName, setNewRoomName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const enabled = useFeature("listen_together");

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/together/rooms`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setRooms(
          (data.rooms || []).map((r: RoomInfo) => ({
            ...r,
            current_track: r.current_track
              ? {
                  ...r.current_track,
                  cover_url: sanitizeImageUrl(r.current_track.cover_url),
                }
              : undefined,
          })),
        );
      }
    } catch (e) {
      console.warn("Error fetching rooms:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useVisiblePolling(fetchRooms, 10000);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const roomId = `room-${Date.now().toString(36)}`;
    router.push(
      `/together/${roomId}?name=${encodeURIComponent(newRoomName || "Музыкальная комната")}`,
    );
  };

  let content: React.ReactNode;
  if (!enabled) {
    content = (
      <EmptyState title="«Слушать вместе» временно отключено">
        Администратор выключил эту функцию. Загляните позже.
      </EmptyState>
    );
  } else if (loading) {
    content = <Loading label="Ищем активные комнаты…" />;
  } else if (rooms.length === 0) {
    content = (
      <EmptyState
        title="Сейчас нет активных комнат"
        action={
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className={`${btn.secondary} ${btn.md}`}
          >
            Создать первую комнату
          </button>
        }
      >
        Станьте первым DJ — создайте комнату и включите музыку.
      </EmptyState>
    );
  } else {
    const listeners = rooms.reduce((n, r) => n + (r.listeners_count || 0), 0);
    content = (
      <>
        <p className="flex items-center gap-2.5 font-mono text-xs text-fg-3">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          {rooms.length} {plural(rooms.length, "комната", "комнаты", "комнат")}{" "}
          · {listeners}{" "}
          {plural(
            listeners,
            "человек слушает",
            "человека слушают",
            "человек слушают",
          )}
        </p>
        <ul
          aria-label="Активные комнаты"
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {rooms.map((room) => (
            <li key={room.room_id}>
              <RoomCard room={room} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
      <PageHeader
        title="Слушать вместе"
        subtitle="Комнаты, где музыка играет у всех одновременно. DJ ставит треки, остальные слушают и болтают в чате."
        actions={
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            disabled={!enabled}
            className={`${btn.primary} ${btn.md}`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Создать комнату
          </button>
        }
      />

      {showCreateModal && (
        <Dialog label="Новая комната" onClose={() => setShowCreateModal(false)}>
          <div className="flex w-full max-w-[440px] flex-col gap-5 rounded-2xl border border-line bg-surface p-7">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-lg font-semibold">Новая комната</h2>
              <p className="text-[13px] leading-normal text-fg-2">
                Вы будете DJ: что играет у вас — то слышат все, кто зайдёт.
              </p>
            </div>
            <form onSubmit={handleCreateRoom} className="flex flex-col gap-5">
              <div>
                <label htmlFor="room-name" className={label}>
                  Название комнаты
                </label>
                <input
                  id="room-name"
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Например: пост-панк по пятницам"
                  maxLength={60}
                  className={inputOnCard}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className={`${btn.secondary} ${btn.md}`}
                >
                  Отмена
                </button>
                <button type="submit" className={`${btn.primary} ${btn.md}`}>
                  Создать и стать DJ
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {content}
    </div>
  );
}
