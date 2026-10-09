"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Area } from "react-easy-crop";
import { API_URL } from "@/app/lib/api";
import {
  DEFAULT_PREFERENCES,
  applyAppearance,
  storePreferences,
} from "@/app/lib/preferences";
import type { UserInfo, UserPreferences } from "@/app/lib/types";
import {
  EMPTY_SETTINGS,
  settingsFromProfile,
  type ImageField,
  type SettingsData,
  type SocialLink,
  type UpdateData,
  type UpdatePreference,
} from "./types";
import { SOCIAL_NETWORKS } from "@/app/lib/socialNetworks";
import { useLocationSuggestions } from "@/app/lib/geo";
import { fixImageUrl, getCroppedImg } from "./utils";

export type SettingsTab =
  | "general"
  | "showcase"
  | "theme"
  | "profile-layout"
  | "listening"
  | "feed"
  | "notifications"
  | "privacy"
  | "wrapped"
  | "security"
  | "integrations"
  | "export"
  | "experiments";

export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "Общие данные" },
  { id: "showcase", label: "Витрина профиля" },
  { id: "theme", label: "Оформление" },
  { id: "profile-layout", label: "Конструктор профиля" },
  { id: "listening", label: "Прослушивания" },
  { id: "feed", label: "Лента и общение" },
  { id: "notifications", label: "Уведомления" },
  { id: "privacy", label: "Приватность" },
  { id: "wrapped", label: "Настройки Wrapped" },
  { id: "security", label: "Безопасность и данные" },
  { id: "integrations", label: "Интеграции" },
  { id: "export", label: "Экспорт и вебхуки" },
  { id: "experiments", label: "Экспериментальное" },
];

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Ошибка";
}

/** State, data loading and actions of the settings page. */
export function useSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<SettingsData>(EMPTY_SETTINGS);
  const [userProfile, setUserProfile] = useState<UserInfo | null>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [level, setLevel] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [importRefresh, setImportRefresh] = useState(0);
  const [copied, setCopied] = useState(false);
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
  const [isCityInputFocused, setIsCityInputFocused] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Image cropping (avatar / cover upload)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropFieldTarget, setCropFieldTarget] = useState<ImageField | null>(
    null,
  );

  const { countries, cities } = useLocationSuggestions(data.country, data.city);

  const updateData: UpdateData = (key, value) => {
    setData((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };
  const updatePreference: UpdatePreference = (section, value) => {
    setData((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, [section]: value },
    }));
    if (section === "appearance")
      applyAppearance(value as UserPreferences["appearance"]);
    setIsDirty(true);
  };

  /** Load the profile into the form. Resolves false when it isn't available. */
  const loadProfile = async (username: string): Promise<boolean> => {
    const [userRes, statsRes, preferencesRes] = await Promise.all([
      fetch(`${API_URL}/api/user/${username}`, { credentials: "include" }),
      fetch(`${API_URL}/api/stats/${username}`, { credentials: "include" }),
      fetch(`${API_URL}/api/profile/preferences`, { credentials: "include" }),
    ]);
    if (!userRes.ok || !statsRes.ok || !preferencesRes.ok) return false;
    const u: UserInfo = await userRes.json();
    const preferences: UserPreferences = await preferencesRes.json();
    const s: { total_xp?: number; total_scrobbles?: number } =
      await statsRes.json();
    setUserProfile(u);
    setLevel(Math.floor((s.total_xp || s.total_scrobbles || 0) / 100) + 1);
    setData(settingsFromProfile(u, preferences));
    storePreferences(preferences);
    try {
      setSocialLinks(JSON.parse(u.social_links || "[]"));
    } catch (e) {
      console.error(e);
    }
    setIsDirty(false);
    return true;
  };

  useEffect(() => {
    if (searchParams.get("spotify") === "success") {
      setStatus("✅ Spotify успешно привязан!");
      setActiveTab("integrations");
    }
    const soundcloudResult = searchParams.get("soundcloud");
    if (soundcloudResult === "success") {
      setStatus("✅ SoundCloud подключён! Включите следующий трек.");
      setActiveTab("integrations");
    } else if (soundcloudResult === "error") {
      setStatus("❌ Не удалось подключить SoundCloud");
      setActiveTab("integrations");
    }
    const tabParam = searchParams.get("tab");
    const linkedTab = SETTINGS_TABS.find((t) => t.id === tabParam);
    if (linkedTab) setActiveTab(linkedTab.id);
    if (tabParam === "export") {
      const result = searchParams.get("status");
      if (result === "lastfm_connected") setStatus("✅ Last.fm подключён");
      else if (result === "lastfm_error")
        setStatus("❌ Не удалось подключить Last.fm");
    }

    const username = localStorage.getItem("username");
    if (!username) {
      router.push("/auth");
      return;
    }
    loadProfile(username)
      .then((ok) => {
        if (!ok) {
          localStorage.removeItem("username");
          router.push("/auth");
        }
      })
      .catch((error) => console.error(error))
      .finally(() => setLoading(false));
  }, [router, searchParams]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    globalThis.addEventListener("beforeunload", warn);
    return () => globalThis.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const onSelectFile = (
    event: React.ChangeEvent<HTMLInputElement>,
    field: ImageField,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setCropImageSrc((reader.result as string) ?? null);
      setCropFieldTarget(field);
    });
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleCropSave = async () => {
    if (!cropImageSrc || !croppedAreaPixels || !cropFieldTarget) return;
    setStatus("Обрезаем...");
    try {
      const croppedFile = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      if (croppedFile) {
        const formData = new FormData();
        formData.append("file", croppedFile);
        const res = await fetch(`${API_URL}/api/upload`, {
          credentials: "include",
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const { url } = (await res.json()) as { url: string };
          updateData(cropFieldTarget, url);
          setStatus("✅ Картинка успешно загружена!");
          setTimeout(() => setStatus(""), 2000);
        } else setStatus("❌ Ошибка на сервере");
      }
    } catch (e) {
      console.error(e);
      setStatus("❌ Ошибка сети");
    }
    setCropImageSrc(null);
  };

  const addSocialLink = () => {
    const usedNetworks = new Set(socialLinks.map((link) => link.network));
    const nextNetwork = SOCIAL_NETWORKS.find(
      (network) => !usedNetworks.has(network.id),
    );
    if (!nextNetwork) return;
    setSocialLinks([
      ...socialLinks,
      { id: Date.now(), network: nextNetwork.id, username: "" },
    ]);
    setIsDirty(true);
  };
  const updateSocialLink = (
    id: SocialLink["id"],
    field: "network" | "username",
    value: string,
  ) => {
    setSocialLinks(
      socialLinks.map((l) => (l.id === id ? { ...l, [field]: value } : l)),
    );
    setIsDirty(true);
  };
  const removeSocialLink = (id: SocialLink["id"]) => {
    setSocialLinks(socialLinks.filter((l) => l.id !== id));
    setIsDirty(true);
  };

  const handleGenerateApiKey = async () => {
    if (
      !confirm(
        "Вы уверены, что хотите сбросить текущий API ключ? Все ваши сторонние приложения/расширения перестанут работать, пока вы не обновите в них ключ.",
      )
    )
      return;
    setStatus("Генерация...");
    try {
      const res = await fetch(`${API_URL}/api/profile/apikey/generate`, {
        credentials: "include",
        method: "POST",
      });
      if (res.ok) {
        const d = (await res.json()) as { api_key?: string };
        const safeKey = String.fromCodePoint(
          ...Array.from(String(d?.api_key || "")).map(
            (c) => c.codePointAt(0) as number,
          ),
        );
        setGeneratedApiKey(safeKey);
        // Send the key to the browser extension (if installed) without
        // persisting it in localStorage, where any XSS could read it.
        globalThis.postMessage(
          {
            type: "VEIN_EXTENSION_SYNC_KEYS",
            username: localStorage.getItem("username") || "",
            apiKey: safeKey,
          },
          globalThis.location.origin,
        );
        setStatus("✅ Новый API ключ успешно сгенерирован!");
        setTimeout(() => setStatus(""), 5000);
      } else {
        setStatus("❌ Ошибка при генерации");
      }
    } catch (e) {
      console.error("API key generation failed:", e);
      setStatus("❌ Ошибка сети");
    }
  };

  const handleCopyKey = () => {
    if (generatedApiKey) {
      navigator.clipboard.writeText(generatedApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setStatus("✅ API ключ скопирован в буфер обмена");
      setTimeout(() => setStatus(""), 3000);
    } else {
      setStatus("⚠️ API-ключ не найден");
      setTimeout(() => setStatus(""), 2000);
    }
  };

  const executeSave = async () => {
    setStatus("Сохраняем...");
    setShowConfirmModal(false);
    const finalLocation =
      data.country && data.city
        ? `${data.country}, ${data.city}`
        : data.country || data.city || "";
    // Showcase favorites give bonus XP and change at most once in 30 days
    // (per field). Send only the ones actually edited, so saving the other
    // settings never touches them.
    const showcase: Record<string, string> = {};
    if (data.favArtist !== (userProfile?.favorite_artist || ""))
      showcase.favorite_artist = data.favArtist;
    if (data.favTrack !== (userProfile?.favorite_track || ""))
      showcase.favorite_track = data.favTrack;
    if (data.favAlbum !== (userProfile?.favorite_album || ""))
      showcase.favorite_album = data.favAlbum;

    try {
      const res = await fetch(`${API_URL}/api/profile/update`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: data.displayName || localStorage.getItem("username"),
          bio: data.bio,
          avatar_url: fixImageUrl(data.avatarUrl),
          cover_url: fixImageUrl(data.coverUrl),
          location: finalLocation,
          favorite_genre: data.favoriteGenre,
          equipment: data.equipment,
          theme: data.theme,
          ...showcase,
          avatar_frame: data.avatarFrame,
          is_private: data.isPrivate,
          hidden_artists: data.hiddenArtists,
          sync_privacy: data.syncPrivacy,
          lastfm_username: data.lastfmUsername,
          social_links: JSON.stringify(
            socialLinks.filter((l) => l.username.trim() !== ""),
          ),
        }),
      });
      if (!res.ok) {
        let detail = "Ошибка при сохранении";
        try {
          const body = (await res.json()) as { detail?: unknown };
          if (typeof body.detail === "string") detail = body.detail;
        } catch {
          // not JSON
        }
        throw new Error(detail);
      }
      const preferencesRes = await fetch(`${API_URL}/api/profile/preferences`, {
        credentials: "include",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.preferences),
      });
      if (!preferencesRes.ok) {
        let detail = "Не удалось сохранить дополнительные настройки";
        try {
          const body = (await preferencesRes.json()) as { detail?: unknown };
          if (typeof body.detail === "string") detail = body.detail;
        } catch {
          // not JSON
        }
        throw new Error(detail);
      }
      const savedPreferences = (await preferencesRes.json()) as UserPreferences;
      storePreferences(savedPreferences);
      localStorage.setItem("site_theme", data.theme);
      globalThis.dispatchEvent(new Event("theme_update"));
      // Refresh the form from the server (showcase locks, cleaned values)
      // and tell the navbar to reload the avatar and name
      const username = localStorage.getItem("username");
      if (username) await loadProfile(username);
      globalThis.dispatchEvent(new Event("profile_update"));
      setStatus("✅ Успешно!");
      setTimeout(() => setStatus(""), 3000);
    } catch (err) {
      setStatus("❌ " + errorMessage(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const showcaseChanged =
      data.favArtist !== (userProfile?.favorite_artist || "") ||
      data.favTrack !== (userProfile?.favorite_track || "") ||
      data.favAlbum !== (userProfile?.favorite_album || "");
    if (showcaseChanged) {
      setShowConfirmModal(true);
      return;
    }
    executeSave();
  };

  const resetPreferences = () => {
    if (!confirm("Вернуть дополнительные настройки к значениям по умолчанию?"))
      return;
    const defaults = structuredClone(DEFAULT_PREFERENCES);
    applyAppearance(defaults.appearance);
    updateData("preferences", defaults);
  };

  const saveYandexToken = async () => {
    setStatus("Сохраняем токен Яндекса...");
    try {
      const res = await fetch(`${API_URL}/api/integrations/yandex`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: data.yandexToken }),
      });
      if (res.ok) {
        setStatus("✅ Токен Яндекса сохранен!");
        setUserProfile((prev) => prev && { ...prev, yandex_linked: true });
      } else setStatus("❌ Ошибка сохранения");
    } catch (e) {
      console.error(e);
      setStatus("❌ Ошибка сети");
    }
  };

  const handleDisconnect = async (service: string) => {
    if (!confirm(`Отключить ${service}?`)) return;
    setStatus(`Отключаем ${service}...`);
    try {
      const res = await fetch(
        `${API_URL}/api/integrations/${service}/disconnect`,
        {
          credentials: "include",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (res.ok) {
        setStatus(`✅ ${service} отключен`);
        if (service === "spotify")
          setUserProfile((prev) => prev && { ...prev, spotify_linked: false });
        if (service === "soundcloud")
          setUserProfile(
            (prev) => prev && { ...prev, soundcloud_linked: false },
          );
        if (service === "yandex") {
          setUserProfile((prev) => prev && { ...prev, yandex_linked: false });
          updateData("yandexToken", "");
        }
        if (service === "lastfm") updateData("lastfmUsername", "");
      }
    } catch (e) {
      console.error(e);
      setStatus("❌ Ошибка сети");
    }
  };

  const startLastfmImport = async () => {
    if (!data.lastfmUsername) return alert("Введите никнейм Last.fm");
    setStatus("Запускаем импорт...");
    try {
      const updateRes = await fetch(`${API_URL}/api/profile/update`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastfm_username: data.lastfmUsername }),
      });
      if (!updateRes.ok) {
        setStatus("❌ Ошибка сохранения профиля");
        return;
      }

      const res = await fetch(`${API_URL}/api/import/lastfm`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const started = (await res.json()) as { status: string };
        setStatus(
          started.status === "already_running"
            ? "⏳ Импорт уже идёт"
            : "✅ Импорт запущен",
        );
        setImportRefresh((n) => n + 1);
      } else {
        let message = "Не удалось запустить импорт";
        try {
          const errData = (await res.json()) as { detail?: string };
          message = errData.detail || message;
        } catch (e) {
          console.error(e);
          message = `Ошибка сервера (${res.status})`;
        }
        setStatus(`❌ Ошибка: ${message}`);
      }
    } catch (e) {
      console.error(e);
      setStatus("❌ Ошибка сети");
    }
  };

  return {
    data,
    updateData,
    updatePreference,
    userProfile,
    socialLinks,
    addSocialLink,
    updateSocialLink,
    removeSocialLink,
    level,
    status,
    loading,
    activeTab,
    setActiveTab,
    isDirty,
    importRefresh,
    copied,
    generatedApiKey,
    countries,
    cities,
    isCityInputFocused,
    setIsCityInputFocused,
    showConfirmModal,
    setShowConfirmModal,
    cropImageSrc,
    setCropImageSrc,
    crop,
    setCrop,
    zoom,
    setZoom,
    setCroppedAreaPixels,
    cropFieldTarget,
    onSelectFile,
    handleCropSave,
    handleGenerateApiKey,
    handleCopyKey,
    executeSave,
    handleSubmit,
    resetPreferences,
    saveYandexToken,
    handleDisconnect,
    startLastfmImport,
  };
}
