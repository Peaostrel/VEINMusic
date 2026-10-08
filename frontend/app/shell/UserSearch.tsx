"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Disc3, Music2, Search, UserRound } from "lucide-react";
import { API_URL } from "@/app/lib/api";
import { Avatar } from "@/components/ui";
import { VerifiedBadge } from "@/components/UserBadges";
import type { NavUser } from "./types";

interface SearchTrack {
  id: number;
  title: string;
  artist: string;
  cover_url?: string | null;
  plays: number;
}

interface SearchArtist {
  name: string;
  cover_url?: string | null;
  tracks: number;
  plays: number;
}

interface SearchResults {
  users: NavUser[];
  artists: SearchArtist[];
  tracks: SearchTrack[];
}

const EMPTY: SearchResults = { users: [], artists: [], tracks: [] };

/** Global search for people, artists and tracks. */
export default function UserSearch({
  className = "",
  id = "vein-search",
}: Readonly<{ className?: string; id?: string }>) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        setIsOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const delay = setTimeout(() => {
      fetch(`${API_URL}/api/search?q=${encodeURIComponent(query.trim())}`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : EMPTY))
        .then((data: Partial<SearchResults>) => {
          setResults({
            users: Array.isArray(data.users) ? data.users : [],
            artists: Array.isArray(data.artists) ? data.artists : [],
            tracks: Array.isArray(data.tracks) ? data.tracks : [],
          });
          setIsOpen(true);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(delay);
      controller.abort();
    };
  }, [query]);

  const hasResults = Boolean(
    results.users.length || results.artists.length || results.tracks.length,
  );
  const showPanel = isOpen && query.trim().length >= 2;
  const listId = `${id}-results`;
  const go = (path: string) => {
    setIsOpen(false);
    setQuery("");
    router.push(path);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <label className="flex h-9 items-center gap-2 rounded-lg border border-line px-2.5 text-fg-3 transition-colors focus-within:border-fg-3">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          type="search"
          id={id}
          name={id}
          placeholder="Люди, артисты, треки"
          aria-label="Поиск людей, артистов и треков"
          aria-controls={showPanel ? listId : undefined}
          aria-expanded={showPanel}
          role="combobox"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          onKeyDown={(event) => event.key === "Escape" && setIsOpen(false)}
          autoComplete="off"
          spellCheck="false"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-3 outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </label>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Результаты поиска"
          className="absolute left-0 top-full z-50 mt-1.5 max-h-[70vh] w-full min-w-[320px] overflow-y-auto rounded-lg border border-line bg-surface-2 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          {loading && !hasResults && (
            <p className="px-3 py-5 text-center text-xs text-fg-3">Ищем…</p>
          )}
          {!loading && !hasResults && (
            <p className="px-3 py-5 text-center text-xs text-fg-3">
              Ничего не найдено
            </p>
          )}
          {results.users.length > 0 && (
            <SearchSection
              title="Люди"
              icon={<UserRound className="h-3 w-3" />}
            >
              {results.users.map((user) => (
                <ResultButton
                  key={user.username}
                  image={
                    <Avatar
                      src={user.avatar_url}
                      seed={user.username}
                      size={30}
                    />
                  }
                  title={
                    <span className="flex items-center gap-1">
                      <span className="truncate">
                        {user.display_name || user.username}
                      </span>
                      <VerifiedBadge
                        role={user.role}
                        isVerified={user.is_verified}
                        sizeClass="h-3.5 w-3.5"
                      />
                    </span>
                  }
                  subtitle={`@${user.username}`}
                  onClick={() => go(`/user/${user.username}`)}
                />
              ))}
            </SearchSection>
          )}
          {results.artists.length > 0 && (
            <SearchSection title="Артисты" icon={<Disc3 className="h-3 w-3" />}>
              {results.artists.map((artist) => (
                <ResultButton
                  key={artist.name}
                  image={<SearchCover src={artist.cover_url} />}
                  title={artist.name}
                  subtitle={`${artist.tracks} треков · ${artist.plays} прослушиваний`}
                  onClick={() =>
                    go(`/artist/${encodeURIComponent(artist.name)}`)
                  }
                />
              ))}
            </SearchSection>
          )}
          {results.tracks.length > 0 && (
            <SearchSection title="Треки" icon={<Music2 className="h-3 w-3" />}>
              {results.tracks.map((track) => (
                <ResultButton
                  key={track.id}
                  image={<SearchCover src={track.cover_url} />}
                  title={track.title}
                  subtitle={`${track.artist} · ${track.plays} прослушиваний`}
                  onClick={() => go(`/track/${track.id}`)}
                />
              ))}
            </SearchSection>
          )}
        </div>
      )}
    </div>
  );
}

function SearchSection({
  title,
  icon,
  children,
}: Readonly<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <section className="border-b border-line-soft py-1 last:border-0">
      <h2 className="flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-3">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function SearchCover({ src }: Readonly<{ src?: string | null }>) {
  return src ? (
    <img src={src} alt="" className="h-[30px] w-[30px] rounded object-cover" />
  ) : (
    <span className="h-[30px] w-[30px] rounded bg-line" />
  );
}

function ResultButton({
  image,
  title,
  subtitle,
  onClick,
}: Readonly<{
  image: React.ReactNode;
  title: React.ReactNode;
  subtitle: string;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      role="option"
      aria-selected="false"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-line"
    >
      {image}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-fg">
          {title}
        </span>
        <span className="block truncate font-mono text-[11px] text-fg-3">
          {subtitle}
        </span>
      </span>
    </button>
  );
}
