"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { API_URL } from "@/app/lib/api";
import { Avatar } from "@/components/ui";
import { VerifiedBadge } from "@/components/UserBadges";
import type { NavUser } from "./types";

/** Profile search box with a results dropdown. */
export default function UserSearch({
  className = "",
  id = "vein-search",
}: Readonly<{ className?: string; id?: string }>) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NavUser[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setIsOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const delay = setTimeout(() => {
      fetch(`${API_URL}/api/search/users?q=${encodeURIComponent(query)}`, {
        credentials: "include",
      })
        .then((res) => res.json())
        .then((data) => {
          setResults(Array.isArray(data) ? data : []);
          setIsOpen(true);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(delay);
  }, [query]);

  const showResults = isOpen && results.length > 0;
  const listId = `${id}-results`;

  return (
    <div className={`relative ${className}`} ref={ref}>
      <label className="flex h-9 items-center gap-2 rounded-lg border border-line px-2.5 text-fg-3 transition-colors focus-within:border-fg-3">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          type="search"
          id={id}
          name={id}
          placeholder="Поиск людей"
          aria-label="Поиск профилей"
          aria-controls={showResults ? listId : undefined}
          aria-expanded={showResults}
          role="combobox"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (results.length > 0 || query.length >= 2) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setIsOpen(false);
          }}
          autoComplete="off"
          spellCheck="false"
          autoCorrect="off"
          autoCapitalize="none"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-3 outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </label>
      {showResults && (
        <ul
          id={listId}
          aria-label="Результаты поиска"
          className="absolute left-0 top-full z-50 mt-1.5 w-full min-w-[260px] overflow-hidden rounded-lg border border-line bg-surface-2 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          {results.map((u) => (
            <li key={u.username}>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setQuery("");
                  router.push(`/user/${u.username}`);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-line"
              >
                <Avatar src={u.avatar_url} seed={u.username} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 truncate text-[13px] font-medium text-fg">
                    <span className="truncate">
                      {u.display_name || u.username}
                    </span>
                    <VerifiedBadge
                      role={u.role}
                      isVerified={u.is_verified}
                      sizeClass="w-3.5 h-3.5"
                    />
                  </span>
                  <span className="block truncate font-mono text-[11px] text-fg-3">
                    @{u.username} · ур. {u.level || 1}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
