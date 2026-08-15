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
        let bgStyle = "bg-rose-950/80 border-rose-500/30 text-rose-200";
        let Icon = AlertCircle;
        if (ann.type === "info") {
          bgStyle = "bg-blue-950/80 border-blue-500/30 text-blue-200";
          Icon = Info;
        } else if (ann.type === "warning") {
          bgStyle = "bg-amber-950/80 border-amber-500/30 text-amber-200";
          Icon = AlertTriangle;
        }

        return (
          <aside
            key={ann.id}
            aria-label="Системное оповещение"
            className={`w-full px-4 py-2.5 border-b backdrop-blur-md flex items-center justify-between shadow-lg transition-all ${bgStyle}`}
          >
            <div className="flex items-center gap-3 max-w-6xl mx-auto flex-1">
              <Icon className="w-5 h-5 shrink-0" />
              <div className="text-xs sm:text-sm font-medium">
                <strong className="font-bold mr-2">{ann.title}:</strong>
                {ann.message}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDismissed((prev) => [...prev, ann.id])}
              className="p-1 hover:opacity-80 transition cursor-pointer text-inherit"
              aria-label="Закрыть оповещение"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </aside>
        );
      })}
    </div>
  );
}
