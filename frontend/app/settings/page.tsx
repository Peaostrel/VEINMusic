/**
 * Settings Page
 * -------------
 * Страница настроек профиля и интеграций.
 */
"use client";
import { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
const Cropper = dynamic(() => import("react-easy-crop"), { ssr: false }) as any;
import { getCroppedImg, fixImageUrl } from "./utils";

// Import Tabs
import GeneralTab from "./tabs/GeneralTab";
import ShowcaseTab from "./tabs/ShowcaseTab";
import ThemeTab from "./tabs/ThemeTab";
import PrivacyTab from "./tabs/PrivacyTab";
import IntegrationsTab from "./tabs/IntegrationsTab";

const LOCAL_COUNTRIES = [
  { name: "Россия", code: "RU", flag: "🇷🇺" },
  { name: "Беларусь", code: "BY", flag: "🇧🇾" },
  { name: "Казахстан", code: "KZ", flag: "🇰🇿" },
  { name: "Украина", code: "UA", flag: "🇺🇦" },
  { name: "Германия", code: "DE", flag: "🇩🇪" },
  { name: "США", code: "US", flag: "🇺🇸" },
  { name: "Великобритания", code: "GB", flag: "🇬🇧" },
  { name: "Франция", code: "FR", flag: "🇫🇷" },
  { name: "Италия", code: "IT", flag: "🇮🇹" },
  { name: "Испания", code: "ES", flag: "🇪🇸" },
  { name: "Нидерланды", code: "NL", flag: "🇳🇱" },
  { name: "Польша", code: "PL", flag: "🇵🇱" },
  { name: "Финляндия", code: "FI", flag: "🇫🇮" },
  { name: "Швеция", code: "SE", flag: "🇸🇪" },
  { name: "Норвегия", code: "NO", flag: "🇳🇴" },
  { name: "Грузия", code: "GE", flag: "🇬🇪" },
  { name: "Армения", code: "AM", flag: "🇦🇲" },
  { name: "Азербайджан", code: "AZ", flag: "🇦🇿" },
  { name: "Латвия", code: "LV", flag: "🇱🇻" },
  { name: "Литва", code: "LT", flag: "🇱🇹" },
  { name: "Эстония", code: "EE", flag: "🇪🇪" },
  { name: "Молдова", code: "MD", flag: "🇲🇩" },
  { name: "Узбекистан", code: "UZ", flag: "🇺🇿" },
  { name: "Киргизия", code: "KG", flag: "🇰🇬" },
  { name: "Таджикистан", code: "TJ", flag: "🇹🇯" },
  { name: "Туркменистан", code: "TM", flag: "🇹🇲" },
  { name: "Турция", code: "TR", flag: "🇹🇷" },
  { name: "Китай", code: "CN", flag: "🇨🇳" },
  { name: "Япония", code: "JP", flag: "🇯🇵" },
  { name: "Южная Корея", code: "KR", flag: "🇰🇷" },
  { name: "Канада", code: "CA", flag: "🇨🇦" },
  { name: "Австралия", code: "AU", flag: "🇦🇺" },
];

// Helper: extract city name from nominatim address item
function extractCityName(item: any): string {
  const addr = item.address || {};
  const name = addr.city || addr.town || addr.village || item.name || "";
  return name
    .split(",")[0]
    .replace(
      /(сельсовет|городское поселение|муниципальное образование|район|станция|платформа|парк)/gi,
      "",
    )
    .trim();
}

// Helper: filter city names by query
function filterCityName(n: string, cityQuery: string): boolean {
  if (!n || n.length < 2) return false;
  const q = cityQuery.toLowerCase();
  const res = n.toLowerCase();
  return res.includes(q) || q.includes(res);
}

function processCities(d: any[], query: string): string[] {
  const sorted = [...d].toSorted(
    (a, b) => (b.importance || 0) - (a.importance || 0),
  );
  return Array.from(
    new Set(
      sorted
        .map((item: any) => extractCityName(item))
        .filter((n: string) => filterCityName(n, query)),
    ),
  ).slice(0, 10);
}

const processCountries = (d: any) => {
  if (!Array.isArray(d)) return [];
  return d
    .map((c: any) => ({
      name: c.translations?.rus?.common || c.name.common,
      code: c.cca2,
      flag: c.flag,
    }))
    .toSorted((a: any, b: any) => a.name.localeCompare(b.name));
};

function SettingsContent() {
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [cropFieldTarget, setCropFieldTarget] = useState<string | null>(null);
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);

  const [data, setData] = useState({
    displayName: "",
    bio: "",
    avatarUrl: "",
    coverUrl: "",
    location: "",
    favoriteGenre: "",
    equipment: "",
    favArtist: "",
    favArtistUpdatedAt: null,
    favTrack: "",
    favTrackUpdatedAt: null,
    favAlbum: "",
    favAlbumUpdatedAt: null,
    avatarFrame: "",
    theme: "classic",
    country: "",
    city: "",
    isPrivate: false,
    hiddenArtists: "",
    syncPrivacy: "all",
    yandexToken: "",
    lastfmUsername: "",
  });

  const [countries, setCountries] =
    useState<{ name: string; code: string; flag: string }[]>(LOCAL_COUNTRIES);
  const [cities, setCities] = useState<string[]>([]);
  const [countryCode, setCountryCode] = useState("");
  const [isCityInputFocused, setIsCityInputFocused] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  useEffect(() => {
    fetch(
      "https://restcountries.com/v3.1/all?fields=name,translations,cca2,flag",
    )
      .then((r) => r.json())
      .then((d) => {
        setCountries(processCountries(d));
      })
      .catch((error) => console.error(error));
  }, []);

  useEffect(() => {
    if (!data.country || countries.length === 0) return;
    const found = countries.find(
      (c) => c.name.toLowerCase().trim() === data.country.toLowerCase().trim(),
    );
    if (found) setCountryCode(found.code);
  }, [data.country, countries]);

  useEffect(() => {
    if (!countryCode || data.city.length < 2) {
      setCities([]);
      return;
    }
    let active = true;
    setCities([]);
    const delay = setTimeout(() => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(data.city)}&format=json&accept-language=ru&addressdetails=1&countrycodes=${countryCode.toLowerCase()}&limit=20`;
      fetch(url)
        .then((r) => r.json())
        .then((d) => {
          if (!active) return;
          if (Array.isArray(d)) {
            setCities(processCities(d, data.city));
          }
        })
        .catch((error) => {
          console.error(error);
          if (active) setCities([]);
        });
    }, 500);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [data.city, countryCode]);

  const [socialLinks, setSocialLinks] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [level, setLevel] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("general");
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("spotify") === "success") {
      setStatus("✅ Spotify успешно привязан!");
      setActiveTab("integrations");
    }

    const username = localStorage.getItem("username");
    if (!username) {
      router.push("/auth");
      return;
    }

    Promise.all([
      fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/user/${username}`,
        { credentials: "include" },
      ),
      fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/stats/${username}`,
        { credentials: "include" },
      ),
    ])
      .then(async ([userRes, statsRes]) => {
        if (!userRes.ok || !statsRes.ok) {
          localStorage.removeItem("username");
          router.push("/auth");
          return;
        }
        const u = await userRes.json();
        const s = await statsRes.json();
        setUserProfile(u);
        setLevel(Math.floor((s.total_xp || s.total_scrobbles || 0) / 100) + 1);
        const loc = u.location || "";
        const locParts = loc.split(",").map((s: string) => s.trim());

        try {
          setSocialLinks(JSON.parse(u.social_links || "[]"));
        } catch (e) {
          console.error(e);
        }

        setData({
          displayName: u.display_name === u.username ? "" : u.display_name,
          bio:
            u.bio === "Этот пользователь пока ничего о себе не рассказал."
              ? ""
              : u.bio,
          avatarUrl: u.avatar_url || "",
          coverUrl: u.cover_url || "",
          location: loc,
          country: locParts[0] || "",
          city: locParts[1] || "",
          favoriteGenre: u.favorite_genre || "",
          equipment: u.equipment || "",
          favArtist: u.favorite_artist || "",
          favArtistUpdatedAt: u.favorite_artist_updated_at || null,
          favTrack: u.favorite_track || "",
          favTrackUpdatedAt: u.favorite_track_updated_at || null,
          favAlbum: u.favorite_album || "",
          favAlbumUpdatedAt: u.favorite_album_updated_at || null,
          avatarFrame: u.avatar_frame || "",
          theme: u.theme || "classic",
          isPrivate: u.is_private || false,
          hiddenArtists: u.hidden_artists || "",
          syncPrivacy: u.sync_privacy || "all",
          yandexToken: u.yandex_token || "",
          lastfmUsername: u.lastfm_username || "",
        });
        try {
          setSocialLinks(JSON.parse(u.social_links || "[]"));
        } catch (e) {
          console.error(e);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });
  }, [router, searchParams]);

  const updateData = (k: string, v: any) =>
    setData((prev) => ({ ...prev, [k]: v }));

  const onSelectFile = (event: any, field: string) => {
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
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/upload`,
          { credentials: "include", method: "POST", body: formData },
        );
        if (res.ok) {
          const { url } = await res.json();
          updateData(cropFieldTarget, url);
          setStatus("✅ Картинка успешно загружена!");
          setTimeout(() => setStatus(""), 2000);
        } else setStatus("❌ Ошибка на сервере");
      }
    } catch (e: any) {
      console.error(e);
      setStatus("❌ Ошибка сети");
    }
    setCropImageSrc(null);
  };

  const addSocialLink = () =>
    setSocialLinks([
      ...socialLinks,
      { id: Date.now(), network: "telegram", username: "" },
    ]);
  const updateSocialLink = (id: number, field: string, value: string) =>
    setSocialLinks(
      socialLinks.map((l) => (l.id === id ? { ...l, [field]: value } : l)),
    );
  const removeSocialLink = (id: number) =>
    setSocialLinks(socialLinks.filter((l) => l.id !== id));

  const handleGenerateApiKey = async () => {
    if (
      !confirm(
        "Вы уверены, что хотите сбросить текущий API ключ? Все ваши сторонние приложения/расширения перестанут работать, пока вы не обновите в них ключ.",
      )
    )
      return;
    setStatus("Генерация...");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/profile/apikey/generate`,
        {
          credentials: "include",
          method: "POST",
        },
      );
      if (res.ok) {
        const d = await res.json();
        const safeKey = String.fromCodePoint(
          ...Array.from(String(d?.api_key || "")).map(
            (c) => c.codePointAt(0) as number,
          ),
        );
        setGeneratedApiKey(safeKey);
        localStorage.setItem("apiKey", safeKey);
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
    const keyToCopy = generatedApiKey || userProfile?.api_key;
    if (keyToCopy) {
      navigator.clipboard.writeText(keyToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setStatus("✅ API ключ скопирован в буфер обмена");
      setTimeout(() => setStatus(""), 3000);
    } else {
      setStatus("⚠️ API ключ не найден!");
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

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/profile/update`,
        {
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
            favorite_artist: data.favArtist,
            favorite_track: data.favTrack,
            favorite_album: data.favAlbum,
            avatar_frame: data.avatarFrame,
            is_private: data.isPrivate,
            hidden_artists: data.hiddenArtists,
            sync_privacy: data.syncPrivacy,
            lastfm_username: data.lastfmUsername,
            social_links: JSON.stringify(
              socialLinks.filter((l) => l.username.trim() !== ""),
            ),
          }),
        },
      );
      if (!res.ok) throw new Error("Ошибка при сохранении");
      localStorage.setItem("site_theme", data.theme);
      globalThis.dispatchEvent(new Event("theme_update"));
      setStatus("✅ Успешно!");
      setTimeout(() => {
        setStatus("");
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      setStatus("❌ " + err.message);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    // Check if showcase favorites changed
    const favArtistChanged =
      data.favArtist !== (userProfile?.favorite_artist || "");
    const favTrackChanged =
      data.favTrack !== (userProfile?.favorite_track || "");
    const favAlbumChanged =
      data.favAlbum !== (userProfile?.favorite_album || "");

    if (favArtistChanged || favTrackChanged || favAlbumChanged) {
      setShowConfirmModal(true);
      return;
    }

    executeSave();
  };

  const saveYandexToken = async () => {
    setStatus("Сохраняем токен Яндекса...");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/integrations/yandex`,
        {
          credentials: "include",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: data.yandexToken }),
        },
      );
      if (res.ok) {
        setStatus("✅ Токен Яндекса сохранен!");
        setUserProfile({ ...userProfile, yandex_linked: true });
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
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/integrations/${service}/disconnect`,
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
          setUserProfile({ ...userProfile, spotify_linked: false });
        if (service === "yandex") {
          setUserProfile({ ...userProfile, yandex_linked: false });
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
      const updateRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/profile/update`,
        {
          credentials: "include",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastfm_username: data.lastfmUsername }),
        },
      );

      if (!updateRes.ok) {
        setStatus("❌ Ошибка сохранения профиля");
        return;
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/import/lastfm`,
        {
          credentials: "include",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (res.ok) {
        setStatus("🚀 Импорт запущен!");
      } else {
        let errorMessage = "Не удалось запустить импорт";
        try {
          const errData = await res.json();
          errorMessage = errData.detail || errorMessage;
        } catch (e) {
          console.error(e);
          errorMessage = `Ошибка сервера (${res.status})`;
        }
        setStatus(`❌ Ошибка: ${errorMessage}`);
      }
    } catch (e) {
      console.error(e);
      setStatus("❌ Ошибка сети");
    }
  };

  const tabLabel = (tab: string) => {
    if (tab === "general") return "Общие данные";
    if (tab === "showcase") return "Витрина профиля";
    if (tab === "theme") return "Оформление";
    if (tab === "privacy") return "Приватность";
    return "Интеграции";
  };

  const isFieldLocked = (updatedAtStr: string | null) => {
    if (!updatedAtStr) return false;
    const unlockDate = new Date(
      new Date(updatedAtStr).getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    return new Date() < unlockDate;
  };
  const isShowcaseLocked =
    isFieldLocked(data.favArtistUpdatedAt) ||
    isFieldLocked(data.favTrackUpdatedAt) ||
    isFieldLocked(data.favAlbumUpdatedAt);
  const isSaveDisabled = activeTab === "showcase" && isShowcaseLocked;

  if (loading)
    return (
      <div className="min-h-screen text-[var(--accent-text)] flex flex-col items-center justify-center gap-4 font-bold text-xl animate-pulse">
        <div className="animate-spin border-4 border-[var(--accent-text)] border-t-transparent rounded-full w-12 h-12"></div>
        Загрузка настроек...
      </div>
    );

  return (
    <>
      {cropImageSrc && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-4xl h-[50vh] md:h-[70vh] bg-[#121212] rounded-xl overflow-hidden shadow-2xl border border-white/10">
            <Cropper
              image={cropImageSrc}
              crop={crop}
              zoom={zoom}
              aspect={cropFieldTarget === "coverUrl" ? 3 : 1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_: any, cp: any) => setCroppedAreaPixels(cp)}
            />
          </div>
          <div className="flex gap-4 mt-6">
            <button
              type="button"
              onClick={() => setCropImageSrc(null)}
              className="px-6 py-3 rounded-lg font-bold text-white bg-white/10 hover:bg-white/20 transition-all border border-white/10"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleCropSave}
              className="px-8 py-3 rounded-lg font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all drop-shadow-[0_0_15px_var(--accent-glow)]"
            >
              Сохранить
            </button>
          </div>
        </div>
      )}
      <div className="min-h-screen text-white p-4 md:p-8 max-w-6xl mx-auto flex flex-col md:flex-row gap-8 pt-24">
        <aside className="w-full md:w-64 shrink-0 flex flex-col gap-2">
          <a
            href="/feed"
            className="text-sm font-bold text-gray-400 hover:text-white mb-4 block px-4"
          >
            ← Глобальная лента
          </a>
          {["general", "showcase", "theme", "privacy", "integrations"].map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`text-left px-4 py-3 rounded-lg font-bold transition-all ${activeTab === tab ? "bg-[var(--accent)] text-[var(--text-on-accent)]" : "text-gray-400 hover:bg-[#1e1e1e]"}`}
              >
                {tabLabel(tab)}
              </button>
            ),
          )}
        </aside>

        <main className="flex-grow bg-[#1e1e1e]/60 backdrop-blur-md rounded-xl border border-white/5 shadow-lg relative overflow-hidden mb-20">
          {activeTab === "integrations" ? (
            <IntegrationsTab
              data={data}
              updateData={updateData}
              userProfile={userProfile}
              handleDisconnect={handleDisconnect}
              saveYandexToken={saveYandexToken}
              startLastfmImport={startLastfmImport}
              userApiKey={userProfile?.api_key || ""}
              generatedApiKey={generatedApiKey}
              handleGenerateApiKey={handleGenerateApiKey}
              handleCopyKey={handleCopyKey}
              copied={copied}
              API_URL={
                process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
              }
            />
          ) : (
            <form onSubmit={handleSubmit}>
              {activeTab === "general" && (
                <GeneralTab
                  data={data}
                  updateData={updateData}
                  countries={countries}
                  cities={cities}
                  isCityInputFocused={isCityInputFocused}
                  setIsCityInputFocused={setIsCityInputFocused}
                  onSelectFile={onSelectFile}
                  username={userProfile?.username || ""}
                  socialLinks={socialLinks}
                  addSocialLink={addSocialLink}
                  updateSocialLink={updateSocialLink}
                  removeSocialLink={removeSocialLink}
                />
              )}

              {activeTab === "showcase" && (
                <ShowcaseTab data={data} updateData={updateData} />
              )}

              {activeTab === "theme" && (
                <ThemeTab data={data} updateData={updateData} level={level} />
              )}

              {activeTab === "privacy" && (
                <PrivacyTab data={data} updateData={updateData} />
              )}

              <div className="p-6 bg-black/20 flex justify-between items-center border-t border-white/5">
                <span className="text-[var(--accent-text)] font-bold">
                  {status}
                </span>
                <button
                  type="submit"
                  disabled={isSaveDisabled}
                  className={`font-black px-8 py-3 rounded-lg transition-all ${
                    isSaveDisabled
                      ? "bg-white/10 text-gray-500 cursor-not-allowed"
                      : "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] hover:scale-105"
                  }`}
                >
                  {isSaveDisabled ? "Заблокировано" : "Сохранить всё"}
                </button>
              </div>
            </form>
          )}
        </main>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#121212] p-8 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/10 text-center space-y-6 transform animate-in fade-in zoom-in duration-200">
            <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-10 h-10 text-yellow-500" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Подтверждение
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Вы изменили витрину профиля! Вы точно хотите утвердить этих
              любимых исполнителей, треки или альбомы? <br />
              <br />
              <strong className="text-yellow-500">
                Они будут заблокированы на 30 дней.
              </strong>
            </p>
            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-300 bg-white/5 hover:bg-white/10 transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={executeSave}
                className="flex-1 px-6 py-3 rounded-xl font-black text-black bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] hover:scale-105 transition-all shadow-lg shadow-[var(--accent)]/20"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Settings() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-white">
          Загрузка...
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
