"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio, Users, Plus, Disc, ArrowRight } from "lucide-react";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";

interface RoomInfo {
  room_id: string;
  name: string;
  host_username: string;
  listeners_count: number;
  listeners: string[];
  current_track: {
    title: string;
    artist: string;
    album?: string;
    cover_url?: string;
    is_playing: boolean;
  };
}

export default function ListenTogetherLobby() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRoomName, setNewRoomName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchRooms = async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/together/rooms`,
        { credentials: "include" },
      );
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
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const roomId = `room-${Date.now().toString(36)}`;
    router.push(
      `/together/${roomId}?name=${encodeURIComponent(newRoomName || "Музыкальная комната")}`,
    );
  };

  const renderRoomsContent = () => {
    if (loading) {
      return (
        <div className="py-20 flex flex-col items-center justify-center gap-4 text-gray-400 font-bold">
          <div className="animate-spin border-4 border-red-500 border-t-transparent rounded-full w-10 h-10"></div>
          Поиск активных комнат...
        </div>
      );
    }

    if (rooms.length === 0) {
      return (
        <div className="bg-[#121214]/60 border border-white/5 rounded-3xl p-12 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-gray-500 mb-4">
            <Disc className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-1">
            Сейчас нет активных комнат
          </h3>
          <p className="text-gray-400 text-sm max-w-sm mb-6">
            Станьте первым DJ прямо сейчас — создайте комнату и включите музыку!
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="bg-white/10 hover:bg-white/15 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors cursor-pointer"
          >
            Создать первую комнату
          </button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rooms.map((room) => (
          <button
            key={room.room_id}
            type="button"
            onClick={() => router.push(`/together/${room.room_id}`)}
            className="w-full text-left bg-[#141418]/80 hover:bg-[#181820] border border-white/5 hover:border-red-500/30 p-5 rounded-3xl transition-all duration-200 group cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-4 mb-4 w-full">
              <div>
                <h3 className="text-lg font-black text-white group-hover:text-red-400 transition-colors">
                  {room.name}
                </h3>
                <p className="text-xs text-gray-400">
                  DJ: @{room.host_username}
                </p>
              </div>
              <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full text-xs font-bold text-gray-300 shrink-0">
                <Users className="w-3.5 h-3.5 text-red-400" />
                {room.listeners_count}
              </div>
            </div>

            <div className="bg-black/40 border border-white/5 rounded-2xl p-3 flex items-center gap-3 w-full">
              <div className="w-10 h-10 rounded-xl bg-[#222] overflow-hidden shrink-0 flex items-center justify-center">
                {room.current_track?.cover_url &&
                sanitizeImageUrl(room.current_track.cover_url) ? (
                  <img
                    src={sanitizeImageUrl(room.current_track.cover_url)}
                    alt="Cover"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Disc className="w-5 h-5 text-gray-500" />
                )}
              </div>
              <div className="min-w-0 flex-grow">
                <p className="text-white text-xs font-bold truncate">
                  {room.current_track?.title || "Ожидание трека"}
                </p>
                <p className="text-gray-400 text-[11px] truncate">
                  {room.current_track?.artist || "—"}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-red-500/10 group-hover:bg-red-500 text-red-400 group-hover:text-white flex items-center justify-center transition-colors shrink-0">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen pt-24 pb-20 px-4 md:px-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-500/10 rounded-2xl border border-red-500/20 text-red-500">
              <Radio className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                СЛУШАТЬ ВМЕСТЕ
              </h1>
              <p className="text-gray-400 text-sm font-medium">
                Синхронное прослушивание музыки в реальном времени с чатом
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black px-6 py-3.5 rounded-2xl shadow-lg shadow-red-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer text-sm"
        >
          <Plus className="w-5 h-5" />
          Создать комнату
        </button>
      </div>

      {/* Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-white/10 p-6 md:p-8 rounded-3xl max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-black text-white mb-2">
              Создание комнаты
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              Вы будете DJ комнаты — другие пользователи смогут подключиться и
              слушать музыку с вами.
            </p>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Название комнаты
                </span>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Например: Synthwave Chill & Coding"
                  className="w-full bg-[#1e1e24] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 font-medium text-sm"
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-3 rounded-xl transition-colors text-sm"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black py-3 rounded-xl transition-colors text-sm shadow-lg shadow-red-600/20"
                >
                  Войти как DJ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rooms Grid */}
      {renderRoomsContent()}
    </div>
  );
}
