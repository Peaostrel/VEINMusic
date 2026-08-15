"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Users,
  Play,
  Pause,
  Send,
  MessageSquare,
  ArrowLeft,
  Disc,
  Sparkles,
} from "lucide-react";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";

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
  const { roomId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomNameParam = searchParams.get("name") || "Музыкальная комната";

  const [connected, setConnected] = useState(false);
  const [listeners, setListeners] = useState<string[]>([]);
  const [host, setHost] = useState("");
  const [track, setTrack] = useState<TrackState>({
    title: "Ожидание трека от DJ...",
    artist: "VEIN Music",
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
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Connect to WebSocket
  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostUrl = process.env.NEXT_PUBLIC_WS_URL || "127.0.0.1:8000";
    const safeRoomId = encodeURIComponent(roomId);
    const wsUrl = `${wsProtocol}//${hostUrl}/ws/together/${safeRoomId}`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ROOM_STATE") {
          setListeners(data.listeners || []);
          setHost(data.host || "");
          if (data.current_track) setTrack(data.current_track);
          if (data.chat_history) setChatMessages(data.chat_history);
        } else if (data.type === "USER_JOINED" || data.type === "USER_LEFT") {
          setListeners(data.listeners || []);
        } else if (data.type === "TRACK_SYNC") {
          setTrack(data.track);
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
        }
      } catch (e) {
        console.warn("WS error:", e);
      }
    };

    ws.onclose = () => setConnected(false);

    return () => {
      ws.close();
    };
  }, [roomId]);

  // Smooth progress bar calculation
  useEffect(() => {
    const interval = setInterval(() => {
      if (track.is_playing) {
        const nowSec = Date.now() / 1000;
        const elapsed = nowSec - (track.updated_at || nowSec);
        const calc = Math.min(
          (track.progress_sec || 0) + elapsed,
          track.duration || 180,
        );
        setCurrentProgress(calc);
      } else {
        setCurrentProgress(track.progress_sec || 0);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [track]);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current) return;

    socketRef.current.send(
      JSON.stringify({
        type: "CHAT_MESSAGE",
        text: chatInput,
      }),
    );
    setChatInput("");
  };

  const handleTogglePlay = () => {
    if (!socketRef.current) return;
    const nextPlay = !track.is_playing;
    socketRef.current.send(
      JSON.stringify({
        type: "PLAYBACK_CONTROL",
        is_playing: nextPlay,
        progress_sec: currentProgress,
      }),
    );
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
    <div className="min-h-screen pt-20 pb-16 px-4 md:px-8 max-w-6xl mx-auto">
      {/* Top Navigation */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          type="button"
          onClick={() => router.push("/together")}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors font-bold text-sm bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Все комнаты
        </button>

        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
            }`}
          ></span>
          <span className="text-xs font-bold text-gray-400">
            {connected ? "LIVE SYNC" : "ПОДКЛЮЧЕНИЕ..."}
          </span>
        </div>
      </div>

      {/* Main Grid: Player + Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Synchronized Player Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#141418]/90 border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none"></div>

            {/* Room Title */}
            <div className="flex items-center justify-between gap-4 mb-8">
              <div>
                <span className="text-[10px] font-black text-red-400 uppercase tracking-widest bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
                  LIVE ROOM
                </span>
                <h2 className="text-2xl md:text-3xl font-black text-white mt-2">
                  {roomNameParam}
                </h2>
                <p className="text-xs text-gray-400 font-medium">
                  DJ: @{host || "VEIN DJ"}
                </p>
              </div>

              <div className="flex items-center gap-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-2xl">
                <Users className="w-4 h-4 text-red-400" />
                <span className="text-xs font-bold text-white">
                  {listeners.length} слушателей
                </span>
              </div>
            </div>

            {/* Vinyl & Artwork Display */}
            <div className="flex flex-col sm:flex-row items-center gap-6 mb-8">
              <div className="relative group">
                <div
                  className={`w-40 h-40 md:w-48 md:h-48 rounded-2xl overflow-hidden bg-[#1f1f24] shadow-2xl border border-white/10 flex items-center justify-center shrink-0 ${
                    track.is_playing ? "shadow-red-600/20" : ""
                  }`}
                >
                  {sanitizeImageUrl(track.cover_url) ? (
                    <img
                      src={sanitizeImageUrl(track.cover_url)}
                      alt="Cover"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Disc className="w-16 h-16 text-gray-600 animate-spin-slow" />
                  )}
                </div>
              </div>

              <div className="text-center sm:text-left min-w-0 flex-grow">
                <h3 className="text-xl md:text-2xl font-black text-white truncate mb-1">
                  {track.title}
                </h3>
                <p className="text-gray-400 font-bold text-base truncate mb-3">
                  {track.artist}
                </p>
                {track.album && (
                  <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold truncate mb-4">
                    {track.album}
                  </p>
                )}

                {/* Animated Equalizer */}
                {track.is_playing && (
                  <div className="flex items-end gap-1 h-5 justify-center sm:justify-start">
                    {[6, 12, 18, 14, 8, 16, 10].map((h, idx) => (
                      <div
                        key={idx}
                        className="w-1 bg-red-500 rounded-full animate-pulse"
                        style={{
                          height: `${h}px`,
                          animationDelay: `${idx * 150}ms`,
                        }}
                      ></div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2 mb-6">
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-red-600 to-orange-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPct}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs font-bold text-gray-400">
                <span>{formatTime(currentProgress)}</span>
                <span>{formatTime(track.duration || 180)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={handleTogglePlay}
                className="w-14 h-14 rounded-full bg-gradient-to-tr from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white flex items-center justify-center shadow-lg shadow-red-600/30 transition-transform active:scale-95 cursor-pointer"
              >
                {track.is_playing ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6 ml-0.5" />
                )}
              </button>
            </div>
          </div>

          {/* Listeners List */}
          <div className="bg-[#141418]/60 border border-white/5 rounded-3xl p-5">
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
              Участники в комнате ({listeners.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {listeners.map((user) => (
                <div
                  key={user}
                  className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/5 text-xs font-bold text-gray-200"
                >
                  <div className="w-4 h-4 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-[10px]">
                    {user[0]?.toUpperCase()}
                  </div>
                  @{user}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Real-time Room Chat */}
        <div className="bg-[#141418]/90 border border-white/10 rounded-3xl p-5 flex flex-col h-[520px] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-4">
            <MessageSquare className="w-4 h-4 text-red-400" />
            <h4 className="text-sm font-black text-white">Чат комнаты</h4>
          </div>

          {/* Chat Messages Log */}
          <div className="flex-grow overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs text-center">
                <Sparkles className="w-6 h-6 mb-2 text-gray-600" />
                Здесь пока тихо. Напишите первое сообщение!
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={`${msg.from}-${msg.timestamp}-${msg.text.slice(0, 15)}`}
                  className="bg-white/5 rounded-2xl p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-red-400">@{msg.from}</span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(msg.timestamp * 1000).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-gray-200 break-words">{msg.text}</p>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <form
            onSubmit={handleSendChat}
            className="mt-4 flex gap-2 pt-2 border-t border-white/5"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Написать в чат..."
              className="flex-grow bg-[#1e1e24] border border-white/10 rounded-xl px-3 py-2 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-red-500"
            />
            <button
              type="submit"
              className="bg-red-600 hover:bg-red-500 text-white p-2.5 rounded-xl transition-colors shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
