"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { API_URL } from "@/app/lib/api";

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
    const API_BASE = API_URL;
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
    <div className="flex flex-col">
      {activeItems.map((ann) => {
        let iconClass = "text-danger";
        let Icon = AlertCircle;
        if (ann.type === "info") {
          iconClass = "text-fg-2";
          Icon = Info;
        } else if (ann.type === "warning") {
          iconClass = "text-accent";
          Icon = AlertTriangle;
        }

        return (
          <aside
            key={ann.id}
            aria-label="Системное оповещение"
            className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5 sm:px-6"
          >
            <Icon
              className={`h-4 w-4 shrink-0 ${iconClass}`}
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 text-[13px] text-fg-2">
              <strong className="mr-2 font-medium text-fg">{ann.title}</strong>
              {ann.message}
            </p>
            <button
              type="button"
              onClick={() => setDismissed((prev) => [...prev, ann.id])}
              className="rounded p-1 text-fg-3 transition-colors hover:text-fg"
              aria-label="Закрыть оповещение"
              title="Закрыть"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </aside>
        );
      })}
    </div>
  );
}
