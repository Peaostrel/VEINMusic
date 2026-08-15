"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Info, AlertTriangle, X } from "lucide-react";

interface Announcement {
  id: number;
  title: string;
  message: string;
  type: string;
  created_at?: string;
}

export default function GlobalAnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<number[]>([]);

  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    fetch(`${API_BASE}/api/announcements/active`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.announcements)) {
          setAnnouncements(d.announcements);
        }
      })
      .catch(() => {});
  }, []);

  const activeItems = announcements.filter((a) => !dismissed.includes(a.id));

  if (activeItems.length === 0) return null;

  return (
    <div className="relative z-50 w-full flex flex-col gap-1 pointer-events-auto">
      {activeItems.map((ann) => {
        let borderStyle = "border-rose-500/20 bg-rose-950/40 text-rose-200";
        let dotStyle = "bg-rose-500";
        let Icon = AlertCircle;
        if (ann.type === "info") {
          borderStyle = "border-blue-500/20 bg-blue-950/40 text-blue-200";
          dotStyle = "bg-blue-400";
          Icon = Info;
        } else if (ann.type === "warning") {
          borderStyle = "border-amber-500/25 bg-amber-950/40 text-amber-200";
          dotStyle = "bg-amber-400";
          Icon = AlertTriangle;
        }

        return (
          <aside
            key={ann.id}
            aria-label="Системное оповещение"
            className={`w-full px-4 py-2 border-b backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all ${borderStyle}`}
          >
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${dotStyle}`} />
                <Icon className="w-4 h-4 shrink-0 opacity-80" />
                <div className="text-xs sm:text-sm truncate">
                  <strong className="font-bold mr-1.5 uppercase tracking-wide text-[11px] sm:text-xs opacity-90">
                    {ann.title}:
                  </strong>
                  <span className="opacity-95">{ann.message}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDismissed((prev) => [...prev, ann.id])}
                className="p-1 rounded-lg hover:bg-white/10 transition cursor-pointer text-inherit shrink-0 opacity-70 hover:opacity-100"
                aria-label="Закрыть оповещение"
                title="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </aside>
        );
      })}
    </div>
  );
}
