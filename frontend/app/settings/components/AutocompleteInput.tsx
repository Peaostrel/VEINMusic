"use client";
import React, { useState, useEffect, useRef } from "react";

interface AutocompleteInputProps {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  entityType: "artist" | "track" | "album";
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function AutocompleteInput({
  id,
  value,
  onChange,
  entityType,
  placeholder,
  disabled,
  className,
}: Readonly<AutocompleteInputProps>) {
  const [suggestions, setSuggestions] = useState<
    { title: string; image: string }[]
  >([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isFocused || !value || value.length < 2) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        const res = await fetch(
          `${apiUrl}/api/search-suggestions?q=${encodeURIComponent(value)}&type=${entityType}`,
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.results || []);
        }
      } catch (err) {
        console.error("Failed to fetch suggestions", err);
      } finally {
        setIsLoading(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, isFocused, entityType]);

  return (
    <div className="relative w-full">
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 200)}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {isFocused && (suggestions.length > 0 || isLoading) && (
        <ul className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl shadow-black/50 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {isLoading && suggestions.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500 text-center">
              Загрузка...
            </li>
          ) : (
            suggestions.map((suggestion) => (
              <li
                key={suggestion.title}
                className="border-b border-white/5 last:border-0"
              >
                <button
                  type="button"
                  className="w-full px-4 py-3 hover:bg-white/5 cursor-pointer text-sm text-gray-200 transition-colors flex items-center gap-3 text-left"
                  onMouseDown={(e) => {
                    // Use onMouseDown instead of onClick to prevent onBlur from firing before this
                    e.preventDefault();
                    onChange(suggestion.title);
                    setIsFocused(false);
                    setSuggestions([]);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onChange(suggestion.title);
                      setIsFocused(false);
                      setSuggestions([]);
                    }
                  }}
                >
                  {suggestion.image ? (
                    <img
                      src={suggestion.image}
                      alt={suggestion.title}
                      className="w-8 h-8 rounded-full object-cover bg-black/50"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs">
                      🎵
                    </div>
                  )}
                  <span className="truncate">{suggestion.title}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
