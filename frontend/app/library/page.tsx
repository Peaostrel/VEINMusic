"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ListRestart,
  Sparkles,
  Target,
} from "lucide-react";
import { API_URL } from "@/app/lib/api";
import { EmptyState, Loading, PageHeader } from "@/components/ui";

interface MemoryTrack {
  id: number;
  title: string;
  artist: string;
  cover_url?: string | null;
  plays: number;
  played_at?: string;
  last_played?: string;
}
interface Memories {
  on_this_day: MemoryTrack[];
  forgotten: MemoryTrack[];
}

export default function LibraryPage() {
  const [data, setData] = useState<Memories | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API_URL}/api/me/memories`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <Loading label="Собираем библиотеку…" />;
  return (
    <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-4 py-8 sm:px-8 lg:py-10">
      <PageHeader
        title="Моя библиотека"
        subtitle="Воспоминания, забытая музыка и порядок в истории"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionCard
          href="/library/cleanup"
          icon={<ListRestart className="h-5 w-5" />}
          title="Навести порядок"
          text="Найти дубли, объединить версии и удалить ошибочные прослушивания."
        />
        <ActionCard
          href="/goals"
          icon={<Target className="h-5 w-5" />}
          title="Музыкальные цели"
          text="Поставить цель на неделю или месяц и отслеживать прогресс."
        />
      </div>
      <ActionCard
        href="/library/discover"
        icon={<Sparkles className="h-5 w-5" />}
        title="Открытия и ваш вкус"
        text="Рекомендации с обратной связью, музыка для двоих и итоги недели"
      />
      <MemorySection
        title="В этот день"
        subtitle="Что играло в эту дату в прошлые годы"
        icon={<CalendarClock className="h-4 w-4" />}
        tracks={data?.on_this_day ?? []}
        empty="Через год здесь появятся музыкальные воспоминания."
      />
      <MemorySection
        title="Давно не звучало"
        subtitle="Любимые треки, которые вы не включали больше 90 дней"
        icon={<Sparkles className="h-4 w-4" />}
        tracks={data?.forgotten ?? []}
        empty="Пока нет забытых треков — продолжайте слушать музыку."
      />
    </main>
  );
}

function ActionCard({
  href,
  icon,
  title,
  text,
}: Readonly<{
  href: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}>) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:bg-surface-2"
    >
      <span className="rounded-lg bg-accent/10 p-2 text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-fg-2">
          {text}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 text-fg-3 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function MemorySection({
  title,
  subtitle,
  icon,
  tracks,
  empty,
}: Readonly<{
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tracks: MemoryTrack[];
  empty: string;
}>) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {icon}
          {title}
        </h2>
        <p className="mt-1 text-xs text-fg-3">{subtitle}</p>
      </div>
      {tracks.length === 0 ? (
        <EmptyState title="Пока пусто">{empty}</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tracks.map((track) => (
            <Link
              key={`${track.id}-${track.played_at || track.last_played}`}
              href={`/track/${track.id}`}
              className="overflow-hidden rounded-xl border border-line bg-surface hover:bg-surface-2"
            >
              {track.cover_url ? (
                <img
                  src={track.cover_url}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <span className="block aspect-square w-full bg-surface-2" />
              )}
              <span className="block p-3">
                <span className="block truncate text-sm font-medium">
                  {track.title}
                </span>
                <span className="block truncate text-xs text-fg-3">
                  {track.artist}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
