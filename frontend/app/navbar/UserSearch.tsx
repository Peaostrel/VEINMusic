"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/app/lib/api";
import { LvlBadge, VerifiedBadge } from "@/components/UserBadges";
import type { NavUser } from "./types";

/** Profile search box with a results dropdown. */
export default function UserSearch() {
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

  return (
    <div className="flex-grow max-w-md relative" ref={ref}>
      <div className="relative">
        <span
          className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400"
          aria-hidden="true"
        >
          🔍
        </span>
        {/* Dummy inputs to trick Firefox/Chrome autofill */}
        <input
          type="text"
          style={{ display: "none" }}
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          type="password"
          style={{ display: "none" }}
          tabIndex={-1}
          aria-hidden="true"
        />

        <input
          type="search"
          id="vein_music_search_v2"
          name="vein_music_search_v2"
          placeholder="Поиск профилей..."
          aria-label="Поиск профилей"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={(e) => {
            e.target.removeAttribute("readonly");
            if (results.length > 0 || query.length >= 2) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setIsOpen(false);
          }}
          readOnly
          autoComplete="off"
          spellCheck="false"
          autoCorrect="off"
          autoCapitalize="none"
          className="w-full bg-[#1a1a1a]/80 border border-white/10 text-white text-sm rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-[var(--accent)] transition-colors backdrop-blur-md"
        />
      </div>
      {showResults && (
        <ul
          id="navbar-search-results"
          aria-label="Результаты поиска"
          className="absolute top-full left-0 right-0 mt-2 bg-[#1e1e1e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
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
                className="w-full flex items-center gap-3 p-3 hover:bg-white/10 focus:bg-white/10 cursor-pointer transition-colors border-b border-white/5 last:border-0 text-left font-normal bg-transparent outline-none"
              >
                <div className="w-9 h-9 rounded-full overflow-hidden bg-black shrink-0">
                  <img
                    src={
                      u.avatar_url ||
                      `https://api.dicebear.com/9.x/micah/svg?seed=${u.username}&backgroundColor=transparent`
                    }
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="truncate flex-grow">
                  <div className="font-bold text-white text-sm truncate flex items-center gap-1">
                    {u.display_name}{" "}
                    <VerifiedBadge
                      role={u.role}
                      isVerified={u.is_verified}
                      sizeClass="w-3.5 h-3.5"
                    />
                    <LvlBadge level={u.level || 1} />
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    @{u.username}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
