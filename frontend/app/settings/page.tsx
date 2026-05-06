/**
 * Settings Page
 * -------------
 * Страница настроек профиля и интеграций.
 */
'use client';
import { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
const Cropper = dynamic(() => import('react-easy-crop'), { ssr: false }) as any;
import { createImage, getCroppedImg, fixImageUrl, THEMES } from './utils';

function SettingsContent() {
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [cropFieldTarget, setCropFieldTarget] = useState<string | null>(null);

  const [data, setData] = useState({
      displayName: '', bio: '', avatarUrl: '', coverUrl: '', location: '', favoriteGenre: '', equipment: '',
      favArtistUrl: '', favArtist: '', favTrackUrl: '', favTrack: '', favAlbumUrl: '', favAlbum: '', theme: 'classic',
      country: '', city: '', isPrivate: false, hiddenArtists: '', yandexToken: '', lastfmUsername: ''
  });

  const [countries, setCountries] = useState<{name: string, code: string, flag: string}[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [countryCode, setCountryCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isCityInputFocused, setIsCityInputFocused] = useState(false);

  useEffect(() => {
    fetch('https://restcountries.com/v3.1/all?fields=name,translations,cca2,flag')
      .then(r => r.json())
      .then(d => { 
          if (Array.isArray(d)) {
              const list = d.map((c: any) => ({
                  name: c.translations?.rus?.common || c.name.common,
                  code: c.cca2,
                  flag: c.flag
              })).sort((a,b) => a.name.localeCompare(b.name));
              setCountries(list as any);
          }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!data.country || countries.length === 0) return;
    const found = countries.find(c => c.name.toLowerCase().trim() === data.country.toLowerCase().trim());
    if (found) setCountryCode(found.code);
  }, [data.country, countries]);

  useEffect(() => {
    if (!countryCode || data.city.length < 2) { setCities([]); return; }
    let active = true; 
    setCities([]);
    setIsSearching(true);
    const delay = setTimeout(() => {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(data.city)}&format=json&accept-language=ru&addressdetails=1&countrycodes=${countryCode.toLowerCase()}&limit=20`;
        fetch(url)
          .then(r => r.json())
          .then(d => { 
              if (!active) return;
              setIsSearching(false);
              if (Array.isArray(d)) {
                  const sorted = d.sort((a,b) => (b.importance || 0) - (a.importance || 0));
                  const names = Array.from(new Set(sorted.map((item: any) => {
                      const addr = item.address || {};
                      const name = addr.city || addr.town || addr.village || item.name || '';
                      return name.split(',')[0].replace(/(сельсовет|городское поселение|муниципальное образование|район|станция|платформа|парк)/gi, '').trim();
                  }).filter(n => {
                      if (!n || n.length < 2) return false;
                      const q = data.city.toLowerCase();
                      const res = n.toLowerCase();
                      return res.includes(q) || q.includes(res);
                  })));
                  setCities(names.slice(0, 10) as string[]);
              }
          })
          .catch(() => { if (active) setIsSearching(false); });
    }, 500);
    return () => { active = false; clearTimeout(delay); };
  }, [data.city, countryCode]);

  const [socialLinks, setSocialLinks] = useState<any[]>([]);
  const [userAchievements, setUserAchievements] = useState<any[]>([]); 
  const [userApiKey, setUserApiKey] = useState('');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [level, setLevel] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('spotify') === 'success') { 
        setStatus('✅ Spotify успешно привязан!'); 
        setActiveTab('integrations'); 
    }

    const username = localStorage.getItem('username');
    const apiKey = localStorage.getItem('apiKey');
    if (!username || !apiKey) { router.push('/auth'); return; }
    setUserApiKey(apiKey);

    Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/user/${username}`), 
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/stats/${username}`)
    ])
      .then(async ([userRes, statsRes]) => {
        const u = await userRes.json();
        const s = await statsRes.json();
        setUserProfile(u);
        setLevel(Math.floor((s.total_xp || s.total_scrobbles || 0) / 100) + 1);
        setUserAchievements(u.achievements || []);
        const loc = u.location || '';
        const locParts = loc.split(',').map((s: string) => s.trim());
        setData({
            displayName: u.display_name === u.username ? '' : u.display_name, 
            bio: u.bio === "Этот пользователь пока ничего о себе не рассказал." ? '' : u.bio,
            avatarUrl: u.avatar_url || '', coverUrl: u.cover_url || '', location: loc, 
            country: locParts[0] || '', city: locParts[1] || '', favoriteGenre: u.favorite_genre || '', equipment: u.equipment || '',
            favArtistUrl: u.favorite_artist_url || '', favArtist: u.favorite_artist || '',
            favTrackUrl: u.favorite_track_url || '', favTrack: u.favorite_track || '', 
            favAlbumUrl: u.favorite_album_url || '', favAlbum: u.favorite_album || '', 
            theme: u.theme || 'classic', isPrivate: u.is_private || false, hiddenArtists: u.hidden_artists || '',
            yandexToken: u.yandex_token || '', lastfmUsername: u.lastfm_username || ''
        });
        try { setSocialLinks(JSON.parse(u.social_links || "[]")); } catch(e) {}
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [router, searchParams]);

  const updateData = (k: string, v: any) => setData(prev => ({ ...prev, [k]: v }));

  const onSelectFile = (event: any, field: string) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setCropImageSrc(reader.result?.toString() || null);
      setCropFieldTarget(field);
    });
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleCropSave = async () => {
    if (!cropImageSrc || !croppedAreaPixels || !cropFieldTarget) return;
    setStatus('Обрезаем...');
    try {
      const croppedFile = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      if (croppedFile) {
        const formData = new FormData();
        formData.append('file', croppedFile);
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/upload`, { method: 'POST', body: formData });
        if (res.ok) {
          const { url } = await res.json();
          updateData(cropFieldTarget, url);
          setStatus('✅ Картинка успешно загружена!');
          setTimeout(() => setStatus(''), 2000);
        } else setStatus('❌ Ошибка на сервере');
      }
    } catch (e: any) { setStatus('❌ Ошибка сети'); }
    setCropImageSrc(null);
  };
  
  const addSocialLink = () => setSocialLinks([...socialLinks, { id: Date.now(), network: 'telegram', username: '' }]);
  const updateSocialLink = (id: number, field: string, value: string) => setSocialLinks(socialLinks.map(l => l.id === id ? { ...l, [field]: value } : l));
  const removeSocialLink = (id: number) => setSocialLinks(socialLinks.filter(l => l.id !== id));

  const handleCopyKey = () => {
    navigator.clipboard.writeText(userApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setStatus('Сохраняем...');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/profile/update`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: userApiKey, display_name: data.displayName || localStorage.getItem('username'), bio: data.bio,
          avatar_url: fixImageUrl(data.avatarUrl), cover_url: fixImageUrl(data.coverUrl), 
          location: data.country && data.city ? `${data.country}, ${data.city}` : data.country || data.city || '', 
          favorite_genre: data.favoriteGenre, equipment: data.equipment, theme: data.theme,
          favorite_artist: data.favArtist, favorite_artist_url: data.favArtistUrl, 
          favorite_track: data.favTrack, favorite_track_url: data.favTrackUrl, 
          favorite_album_url: data.favAlbumUrl, is_private: data.isPrivate,
          hidden_artists: data.hiddenArtists, lastfm_username: data.lastfmUsername,
          social_links: JSON.stringify(socialLinks.filter(l => l.username.trim() !== ''))
        })
      });
      if (!res.ok) throw new Error('Ошибка при сохранении');
      setStatus('✅ Успешно!'); 
      setTimeout(() => setStatus(''), 2000);
    } catch (err: any) { setStatus('❌ ' + err.message); }
  };

  const saveYandexToken = async () => {
    setStatus('Сохраняем токен Яндекса...');
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/integrations/yandex`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: userApiKey, token: data.yandexToken })
        });
        if (res.ok) { setStatus('✅ Токен Яндекса сохранен!'); setUserProfile({...userProfile, yandex_linked: true}); }
        else setStatus('❌ Ошибка сохранения');
    } catch (e) { setStatus('❌ Ошибка сети'); }
  };

  const handleDisconnect = async (service: string) => {
    if (!confirm(`Отключить ${service}?`)) return;
    setStatus(`Отключаем ${service}...`);
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/integrations/${service}/disconnect`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: userApiKey })
        });
        if (res.ok) {
            setStatus(`✅ ${service} отключен`);
            if (service === 'spotify') setUserProfile({ ...userProfile, spotify_linked: false });
            if (service === 'yandex') { setUserProfile({ ...userProfile, yandex_linked: false }); updateData('yandexToken', ''); }
            if (service === 'lastfm') updateData('lastfmUsername', '');
        }
    } catch (e) { setStatus('❌ Ошибка сети'); }
  };

  const startLastfmImport = async () => {
    if (!data.lastfmUsername) return alert('Введите никнейм Last.fm');
    setStatus('Запускаем импорт...');
    try {
        // First update the profile to save the username
        const updateRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/profile/update`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: userApiKey, lastfm_username: data.lastfmUsername })
        });
        
        if (!updateRes.ok) {
            setStatus('❌ Ошибка сохранения профиля');
            return;
        }

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/import/lastfm`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: userApiKey })
        });
        
        if (res.ok) {
            setStatus('🚀 Импорт запущен!');
        } else {
            let errorMessage = 'Не удалось запустить импорт';
            try {
                const errData = await res.json();
                errorMessage = errData.detail || errorMessage;
            } catch (e) {
                errorMessage = `Ошибка сервера (${res.status})`;
            }
            setStatus(`❌ Ошибка: ${errorMessage}`);
        }
    } catch (e) { 
        setStatus('❌ Ошибка сети'); 
    }
  };

  if (loading) return <div className="min-h-screen text-[var(--accent-text)] flex items-center justify-center font-bold text-xl">Загрузка...</div>;

  return (
    <>
      {cropImageSrc && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-4xl h-[50vh] md:h-[70vh] bg-[#121212] rounded-xl overflow-hidden shadow-2xl border border-white/10">
            <Cropper image={cropImageSrc} crop={crop} zoom={zoom} aspect={cropFieldTarget === 'coverUrl' ? 3 / 1 : 1 / 1} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_: any, cp: any) => setCroppedAreaPixels(cp)} />
          </div>
          <div className="flex gap-4 mt-6">
            <button type="button" onClick={() => setCropImageSrc(null)} className="px-6 py-3 rounded-lg font-bold text-white bg-white/10 hover:bg-white/20 transition-all border border-white/10">Отмена</button>
            <button type="button" onClick={handleCropSave} className="px-8 py-3 rounded-lg font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all drop-shadow-[0_0_15px_var(--accent-glow)]">Сохранить</button>
          </div>
        </div>
      )}
      <div className="min-h-screen text-white p-4 md:p-8 max-w-6xl mx-auto flex flex-col md:flex-row gap-8 pt-24">
          <aside className="w-full md:w-64 shrink-0 flex flex-col gap-2">
              <a href="/feed" className="text-sm font-bold text-gray-400 hover:text-white mb-4 block px-4">← Глобальная лента</a>
              {['general', 'showcase', 'theme', 'privacy', 'integrations'].map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`text-left px-4 py-3 rounded-lg font-bold transition-all ${activeTab === tab ? 'bg-[var(--accent)] text-[var(--text-on-accent)]' : 'text-gray-400 hover:bg-[#1e1e1e]'}`}>
                      {tab === 'general' ? 'Общие данные' : tab === 'showcase' ? 'Витрина профиля' : tab === 'theme' ? 'Оформление' : tab === 'privacy' ? 'Приватность' : 'Интеграции'}
                  </button>
              ))}
              {userProfile?.role === 'developer' && (
                <button onClick={() => setActiveTab('admin')} className={`text-left px-4 py-3 rounded-lg font-bold transition-all ${activeTab === 'admin' ? 'bg-red-600 text-white' : 'text-red-400 hover:bg-red-900/20'}`}>🛡️ Админ-панель</button>
              )}
          </aside>

          <main className="flex-grow bg-[#1e1e1e]/60 backdrop-blur-md rounded-xl border border-white/5 shadow-lg relative overflow-hidden mb-20">
              {activeTab !== 'integrations' ? (
              <form onSubmit={handleSubmit}>
                  {activeTab === 'general' && (
                      <div className="p-6 md:p-8 space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="col-span-1 md:col-span-2 mb-4">
                                  <label className="block text-sm font-bold text-gray-300 mb-2">Визуальное оформление</label>
                                  <div className="relative w-full rounded-xl bg-[#282828]/30 border-2 border-dashed border-white/10 hover:border-[var(--accent)] transition-colors group mb-10">
                                      <label className="block w-full h-32 md:h-48 cursor-pointer overflow-hidden rounded-xl relative">
                                          {data.coverUrl ? <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{backgroundImage: `url(${data.coverUrl})`}}></div> : <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 group-hover:text-[var(--accent-text)] transition-colors"><span className="text-4xl mb-2">🏞️</span><span className="font-bold">Загрузить обложку</span></div>}
                                          <input type="file" accept="image/*" className="hidden" onChange={(e) => onSelectFile(e, 'coverUrl')} />
                                      </label>
                                      <label className="absolute -bottom-8 left-6 md:left-10 w-24 h-24 md:w-28 md:h-28 rounded-full bg-[#1e1e1e] border-4 border-[#1e1e1e] cursor-pointer overflow-hidden shadow-2xl group/avatar z-10 hover:border-[var(--accent)]">
                                          {data.avatarUrl ? <img src={data.avatarUrl} alt="Аватар" className="w-full h-full object-cover group-hover/avatar:scale-110 transition-transform" /> : <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-[#282828] group-hover/avatar:text-[var(--accent-text)]">👤</div>}
                                          <input type="file" accept="image/*" className="hidden" onChange={(e) => onSelectFile(e, 'avatarUrl')} />
                                      </label>
                                  </div>
                              </div>
                              <div><label className="block text-sm font-bold text-gray-300 mb-2">Отображаемое Имя</label><input value={data.displayName} onChange={e=>updateData('displayName', e.target.value)} className="w-full p-3 rounded bg-[#282828]/50 border border-white/10 focus:border-[var(--accent)] text-white focus:outline-none transition-colors" /></div>
                              <div>
                                  <label className="block text-sm font-bold text-gray-300 mb-2">Страна</label>
                                  <select value={data.country} onChange={e => updateData('country', e.target.value)} className="w-full p-3 rounded bg-[#282828]/50 border border-white/10 focus:border-[var(--accent)] text-white outline-none appearance-none cursor-pointer">
                                      <option value="">Выберите страну...</option>
                                      {countries.map(c => <option key={c.code} value={c.name}>{c.flag} {c.name}</option>)}
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-sm font-bold text-gray-300 mb-2">Город</label>
                                  <div className="relative">
                                      <input value={data.city} onChange={e=>updateData('city', e.target.value)} onFocus={() => setIsCityInputFocused(true)} onBlur={() => setTimeout(() => setIsCityInputFocused(false), 200)} placeholder="Введите название..." className="w-full p-3 rounded bg-[#282828]/50 border border-white/10 focus:border-[var(--accent)] text-white focus:outline-none" />
                                      {isCityInputFocused && cities.length > 0 && (
                                          <div className="absolute top-full left-0 right-0 bg-[#121212] border border-[var(--accent)]/50 rounded-lg mt-1 z-[100] max-h-60 overflow-y-auto shadow-2xl">
                                              {cities.map(c => <div key={c} onClick={() => { updateData('city', c); setCities([]); }} className="p-4 hover:bg-[var(--accent)] hover:text-white cursor-pointer text-sm border-b border-white/5 last:border-none transition-all">{c}</div>)}
                                          </div>
                                      )}
                                  </div>
                              </div>
                          </div>
                          <div><label className="block text-sm font-bold text-gray-300 mb-2">О себе</label><textarea value={data.bio} onChange={e=>updateData('bio', e.target.value)} rows={3} className="w-full p-3 rounded bg-[#282828]/50 border border-white/10 focus:border-[var(--accent)] text-white focus:outline-none resize-none transition-colors"></textarea></div>
                      </div>
                  )}

                  {activeTab === 'showcase' && (
                      <div className="p-6 md:p-8 space-y-6">
                          <h2 className="text-xl font-bold mb-4 text-[var(--accent-text)]">Витрина профиля</h2>
                          <div className="bg-[#121212]/50 p-5 rounded-xl border border-white/5 space-y-4">
                              <div><label className="block text-xs text-gray-400 mb-1">🎤 Любимый артист (Ссылка)</label><input value={data.favArtistUrl} onChange={e=>updateData('favArtistUrl', e.target.value)} className="w-full p-2.5 rounded bg-[#282828]/80 text-white border border-white/5" /></div>
                              <div><label className="block text-xs text-gray-400 mb-1">🎵 Любимый трек (Ссылка)</label><input value={data.favTrackUrl} onChange={e=>updateData('favTrackUrl', e.target.value)} className="w-full p-2.5 rounded bg-[#282828]/80 text-white border border-white/5" /></div>
                              <div><label className="block text-xs text-gray-400 mb-1">💿 Любимый альбом (Ссылка)</label><input value={data.favAlbumUrl} onChange={e=>updateData('favAlbumUrl', e.target.value)} className="w-full p-2.5 rounded bg-[#282828]/80 text-white border border-white/5" /></div>
                          </div>
                      </div>
                  )}

                  {activeTab === 'theme' && (
                      <div className="p-6 md:p-8">
                          <h2 className="text-xl font-bold mb-6 text-[var(--accent-text)]">Выбор цветовой темы</h2>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {THEMES.map(opt => {
                                  const isLocked = level < opt.req; 
                                  const isSelected = opt.isCustom ? data.theme.startsWith('#') : data.theme === opt.id;
                                  return (
                                      <div key={opt.id} onClick={() => !isLocked && updateData('theme', opt.id)} className={`p-4 rounded-xl border-2 transition-all flex items-center justify-between cursor-pointer ${isLocked ? 'opacity-50 grayscale' : isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_15px_var(--accent-glow)]' : 'border-white/10 hover:border-white/30'}`}>
                                          <div className="flex items-center gap-4"><div className="w-8 h-8 rounded-full shadow-lg" style={{background: opt.color}}></div><div><div className="font-bold text-white">{opt.name}</div><div className="text-xs text-gray-400">LVL {opt.req}</div></div></div>
                                          {isLocked ? '🔒' : isSelected ? '✅' : null}
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  )}

                  {activeTab === 'privacy' && (
                      <div className="p-6 md:p-8 space-y-8">
                          <h2 className="text-xl font-bold mb-4 text-[var(--accent-text)]">Приватность</h2>
                          <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex items-center justify-between">
                              <div><p className="font-bold text-white">Приватный профиль</p><p className="text-xs text-gray-400">Скрыть историю от всех, кроме подписчиков.</p></div>
                              <button type="button" onClick={() => updateData('isPrivate', !data.isPrivate)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${data.isPrivate ? 'bg-[var(--accent)]' : 'bg-gray-700'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${data.isPrivate ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                          </div>
                      </div>
                  )}

                  {activeTab === 'admin' && <AdminPanel api_key={userApiKey} />}

                  <div className="p-6 bg-black/20 flex justify-between items-center border-t border-white/5">
                      <span className="text-[var(--accent-text)] font-bold">{status}</span>
                      <button type="submit" className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] font-black px-8 py-3 rounded-lg hover:scale-105 transition-all">Сохранить всё</button>
                  </div>
              </form>
              ) : (
                  <div className="p-6 md:p-8 space-y-6">
                      <h2 className="text-2xl font-bold text-white">Интеграции</h2>
                      
                      {/* Spotify */}
                      <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-4 relative overflow-hidden shadow-md">
                          <div className="absolute top-0 left-0 w-1 h-full bg-[#1DB954]"></div>
                          <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4">
                                  <img src="https://www.svgrepo.com/show/475684/spotify-color.svg" className="w-12 h-12" alt="Spotify" />
                                  <div><div className="flex items-center gap-2"><h3 className="font-bold text-lg text-white">Spotify Cloud</h3>{userProfile?.spotify_linked && <span className="bg-[#1DB954]/20 text-[#1DB954] text-[10px] px-2 py-0.5 rounded font-bold border border-[#1DB954]/30">ACTIVE</span>}</div><p className="text-sm text-gray-400">Скробблинг напрямую через сервер.</p></div>
                              </div>
                              <div className="flex gap-2">
                                  {userProfile?.spotify_linked && <button onClick={() => handleDisconnect('spotify')} className="bg-red-900/20 text-red-400 border border-red-900/30 font-bold px-4 py-2 rounded-xl text-sm">Отключить</button>}
                                  <button onClick={() => window.location.href = `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/auth/spotify/login?api_key=${userApiKey}`} className="bg-[#1DB954] text-black font-black px-6 py-2 rounded-xl text-sm hover:scale-105 transition-all">🔗 {userProfile?.spotify_linked ? 'Обновить' : 'Привязать'}</button>
                              </div>
                          </div>
                          {userProfile?.last_sync && userProfile?.spotify_linked && <div className="text-[10px] text-gray-500 uppercase flex items-center gap-2 mt-2"><span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-pulse"></span>Последняя синхронизация: {new Date(userProfile.last_sync).toLocaleString()}</div>}
                      </div>

                      {/* Yandex */}
                      <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-4 relative overflow-hidden shadow-md">
                          {/* Dummy inputs for Firefox/Chrome */}
                          <input type="text" style={{display: 'none'}} aria-hidden="true" />
                          <input type="password" style={{display: 'none'}} aria-hidden="true" />
                          
                          <div className="absolute top-0 left-0 w-1 h-full bg-[#ffcc00]"></div>
                          <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 bg-[#ffcc00] rounded-xl flex items-center justify-center text-black font-black text-xl">Y</div>
                                  <div><div className="flex items-center gap-2"><h3 className="font-bold text-lg text-white">Yandex Cloud</h3>{userProfile?.yandex_linked && <span className="bg-[#ffcc00]/20 text-[#ffcc00] text-[10px] px-2 py-0.5 rounded font-bold border border-[#ffcc00]/30">ACTIVE</span>}</div><p className="text-sm text-gray-400">Требуется OAuth токен.</p></div>
                              </div>
                              <div className="flex flex-col gap-2 w-64">
                                  <input 
                                    type="password" 
                                    value={data.yandexToken} 
                                    onChange={e=>updateData('yandexToken', e.target.value)} 
                                    placeholder="y0_AgAAA..." 
                                    autoComplete="new-password"
                                    readOnly
                                    onFocus={(e) => e.target.removeAttribute('readonly')}
                                    className="bg-black/50 border border-white/10 p-2.5 rounded-lg text-sm text-white outline-none focus:border-[#ffcc00]" 
                                  />
                                  <div className="flex gap-2">
                                      {userProfile?.yandex_linked && <button onClick={() => handleDisconnect('yandex')} className="flex-1 bg-red-900/20 text-red-400 border border-red-900/30 font-bold py-2 rounded-lg text-xs">Удалить</button>}
                                      <button onClick={saveYandexToken} className="flex-1 bg-[#ffcc00] text-black font-bold py-2 rounded-lg text-xs">Сохранить</button>
                                  </div>
                              </div>
                          </div>
                          {userProfile?.last_sync && userProfile?.yandex_linked && <div className="text-[10px] text-gray-500 uppercase flex items-center gap-2 mt-2"><span className="w-1.5 h-1.5 rounded-full bg-[#ffcc00] animate-pulse"></span>Последняя синхронизация: {new Date(userProfile.last_sync).toLocaleString()}</div>}
                      </div>

                      {/* Last.fm */}
                      <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-4 relative overflow-hidden shadow-md">
                          <div className="absolute top-0 left-0 w-1 h-full bg-[#D51007]"></div>
                          <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4">
                                  <img src="https://www.svgrepo.com/show/331464/lastfm.svg" className="w-12 h-12" alt="Last.fm" />
                                  <div><h3 className="font-bold text-lg text-white">Last.fm Import</h3><p className="text-sm text-gray-400">Импорт истории прослушиваний.</p></div>
                              </div>
                              <div className="flex flex-col gap-2 w-64">
                                  <input 
                                    value={data.lastfmUsername} 
                                    onChange={e=>updateData('lastfmUsername', e.target.value)} 
                                    placeholder="Username" 
                                    autoComplete="off"
                                    readOnly
                                    onFocus={(e) => e.target.removeAttribute('readonly')}
                                    className="bg-black/50 border border-white/10 p-2.5 rounded-lg text-sm text-white outline-none focus:border-[#D51007]" 
                                  />
                                  <div className="flex gap-2">
                                      {data.lastfmUsername && <button onClick={() => handleDisconnect('lastfm')} className="flex-1 bg-red-900/20 text-red-400 border border-red-900/30 font-bold py-2 rounded-lg text-xs">Очистить</button>}
                                      <button onClick={startLastfmImport} className="flex-1 bg-[#D51007] text-white font-bold py-2 rounded-lg text-xs">Импорт</button>
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Apple Music */}
                      <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-4 relative overflow-hidden shadow-md opacity-60 grayscale hover:grayscale-0 transition-all cursor-not-allowed group">
                          <div className="absolute top-0 left-0 w-1 h-full bg-[#fa243c]"></div>
                          <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4">
                                  <img src="https://www.svgrepo.com/show/475631/apple-music.svg" className="w-12 h-12" alt="Apple Music" />
                                  <div><h3 className="font-bold text-lg text-white">Apple Music</h3><p className="text-sm text-gray-400">В разработке (Beta скоро)</p></div>
                              </div>
                              <span className="text-[10px] font-bold text-[#fa243c] border border-[#fa243c]/30 px-2 py-1 rounded bg-[#fa243c]/10">COMING SOON</span>
                          </div>
                      </div>

                      {/* YouTube Music */}
                      <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-4 relative overflow-hidden shadow-md opacity-60 grayscale hover:grayscale-0 transition-all cursor-not-allowed group">
                          <div className="absolute top-0 left-0 w-1 h-full bg-[#FF0000]"></div>
                          <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4">
                                  <img src="https://www.svgrepo.com/show/475701/youtube-music.svg" className="w-12 h-12" alt="YouTube Music" />
                                  <div><h3 className="font-bold text-lg text-white">YouTube Music</h3><p className="text-sm text-gray-400">Планируется интеграция</p></div>
                              </div>
                              <span className="text-[10px] font-bold text-white/30 border border-white/10 px-2 py-1 rounded">PLANNED</span>
                          </div>
                      </div>

                      {/* Zvuk */}
                      <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-4 relative overflow-hidden shadow-md opacity-60 grayscale hover:grayscale-0 transition-all cursor-not-allowed group">
                          <div className="absolute top-0 left-0 w-1 h-full bg-[#00FF00]"></div>
                          <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-blue-500 rounded-xl flex items-center justify-center text-black font-black text-xl">З</div>
                                  <div><h3 className="font-bold text-lg text-white">Звук (Zvuk)</h3><p className="text-sm text-gray-400">В очереди на реализацию</p></div>
                              </div>
                              <span className="text-[10px] font-bold text-white/30 border border-white/10 px-2 py-1 rounded">PLANNED</span>
                          </div>
                      </div>

                      {/* Extension */}
                      <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-4 relative overflow-hidden shadow-md">
                          <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent)]"></div>
                          <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] rounded-xl flex items-center justify-center text-black font-black text-2xl shadow-lg shrink-0">V</div><div><h3 className="font-bold text-lg text-white">Расширение VEIN</h3><p className="text-sm text-gray-400">Ключ для браузерного скробблера.</p></div></div>
                              <div className="flex items-center gap-3 bg-[#1a1a1a] p-2 rounded-lg border border-white/5"><code className="text-[var(--accent-text)] px-3 font-mono text-sm">{userApiKey}</code><button onClick={handleCopyKey} className="bg-white/5 border border-white/10 text-white hover:text-[var(--accent-text)] px-3 py-1.5 rounded font-bold text-xs">{copied ? 'OK!' : 'Copy'}</button></div>
                          </div>
                      </div>
                  </div>
              )}
          </main>
      </div>
    </>
  );
}

function AdminPanel({ api_key }: { api_key: string }) {
    const [stats, setStats] = useState<any>(null);
    useEffect(() => {
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/stats?api_key=${api_key}`).then(r => r.json()).then(setStats);
    }, [api_key]);
    if (!stats) return <div className="p-8 text-gray-400">Загрузка...</div>;
    return (
        <div className="p-8 space-y-6">
            <h2 className="text-2xl font-black text-red-500 mb-8 uppercase tracking-widest flex items-center gap-3"><span className="animate-pulse">🔴</span> Live Monitoring</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-black/40 p-4 rounded-xl border border-white/5"><p className="text-[10px] text-gray-500 font-bold uppercase">Users</p><p className="text-2xl font-black text-white">{stats.total_users}</p></div>
                <div className="bg-black/40 p-4 rounded-xl border border-white/5"><p className="text-[10px] text-gray-500 font-bold uppercase">Scrobbles</p><p className="text-2xl font-black text-white">{stats.total_scrobbles}</p></div>
                <div className="bg-black/40 p-4 rounded-xl border border-white/5"><p className="text-[10px] text-gray-500 font-bold uppercase">Cache</p><p className="text-2xl font-black text-white">{stats.cache_size} keys</p></div>
                <div className="bg-black/40 p-4 rounded-xl border border-white/5"><p className="text-[10px] text-gray-500 font-bold uppercase">Uptime</p><p className="text-2xl font-black text-white">{Math.floor(stats.uptime_sec / 3600)}h</p></div>
            </div>
            <div className="bg-black/40 p-6 rounded-xl border border-white/5"><h3 className="font-bold text-white mb-4">WebSocket Connections</h3><div className="space-y-2">{Object.entries(stats.active_websockets || {}).map(([u, count]: any) => (<div key={u} className="flex justify-between text-xs py-1 border-b border-white/5"><span className="text-gray-400">@{u}</span><span className="text-[var(--accent-text)] font-black">{count} device(s)</span></div>))}</div></div>
        </div>
    );
}

export default function Settings() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Загрузка...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
