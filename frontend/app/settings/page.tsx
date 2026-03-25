/**
 * Settings Page
 * -------------
 * Страница настроек профиля и интеграций.
 * Логика: выбор страны/города (Nominatim API), управление API-ключом,
 * подключение расширения и информация о скроблинге.
 */
'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

import { useRouter, useSearchParams } from 'next/navigation';
const Cropper = dynamic(() => import('react-easy-crop'), { ssr: false }) as any;
import { createImage, getCroppedImg, fixImageUrl, THEMES } from './utils';


export default function Settings() {
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [cropFieldTarget, setCropFieldTarget] = useState<string | null>(null);

  const [data, setData] = useState({
      displayName: '', bio: '', avatarUrl: '', coverUrl: '', location: '', favoriteGenre: '', equipment: '',
      favArtistUrl: '', favArtist: '', favTrackUrl: '', favTrack: '', favAlbumUrl: '', favAlbum: '', theme: 'classic',
      country: '', city: ''
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

  // Синхронизация кода страны при загрузке или смене названия
  useEffect(() => {
    if (!data.country || countries.length === 0) return;
    const found = countries.find(c => c.name.toLowerCase().trim() === data.country.toLowerCase().trim());
    if (found) {
        setCountryCode(found.code);
    }
  }, [data.country, countries]);

  useEffect(() => {
    if (!countryCode || data.city.length < 2) { setCities([]); return; }
    
    console.log(`[NOMINATIM] Вызов эффекта для: "${data.city}", код страны: "${countryCode}"`);
    
    // Флаг для игнорирования результатов старых (медленных) запросов
    let active = true; 
    
    // Очищаем старый список сразу при начале нового ввода
    setCities([]);
    setIsSearching(true);
    
    const delay = setTimeout(() => {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(data.city)}&format=json&accept-language=ru&addressdetails=1&countrycodes=${countryCode.toLowerCase()}&limit=20`;
        console.log(`[NOMINATIM] Отправка запроса: ${url}`);
        
        fetch(url)
          .then(r => r.json())
          .then(d => { 
              if (!active) {
                console.log(`[NOMINATIM] Игнорируем ответ для "${data.city}", так как запрос устарел.`);
                return;
              }
              
              console.log(`[NOMINATIM] Получен ответ (строк: ${d.length || 0})`, d);
              setIsSearching(false);
              
              if (Array.isArray(d)) {
                  const sorted = d.sort((a,b) => (b.importance || 0) - (a.importance || 0));
                  const names = Array.from(new Set(sorted.map((item: any) => {
                      const addr = item.address || {};
                      
                      // Стараемся вытащить максимальный смысл
                      const name = addr.city || addr.town || addr.village || item.name || '';
                      let cleanName = name.split(',')[0].replace(/(сельсовет|городское поселение|муниципальное образование|район|станция|платформа|парк)/gi, '').trim();
                      
                      console.log(`[NOMINATIM] Обработка: "${item.display_name}" ---> "${cleanName}"`);
                      return cleanName;
                  }).filter(n => {
                      if (!n || n.length < 2) return false;
                      const q = data.city.toLowerCase();
                      const res = n.toLowerCase();
                      
                      // СМЯГЧЕНИЕ ФИЛЬТРА: разрешаем partial match в обе стороны
                      const match = res.includes(q) || q.includes(res);
                      
                      if (!match) console.log(`[NOMINATIM] Отфильтровано: "${n}" не совпадает с "${data.city}"`);
                      return match;
                  })));
                  
                  console.log(`[NOMINATIM] Итоговый список городов:`, names);
                  setCities(names.slice(0, 10) as string[]);
              }
          })
          .catch(e => {
              console.error(`[NOMINATIM] Ошибка запроса:`, e);
              if (active) setIsSearching(false);
          });
    }, 500);

    return () => {
        active = false;
        clearTimeout(delay);
    };
  }, [data.city, countryCode]);
  const [socialLinks, setSocialLinks] = useState<any[]>([]);
  const [userAchievements, setUserAchievements] = useState<any[]>([]); 
  const [userApiKey, setUserApiKey] = useState('');
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
        fetch(`http://127.0.0.1:8000/api/user/${username}`), 
        fetch(`http://127.0.0.1:8000/api/stats/${username}`)
    ])
      .then(async ([userRes, statsRes]) => {
        const u = await userRes.json();
        const s = await statsRes.json();
        
        setLevel(Math.floor((s.total_xp || s.total_scrobbles || 0) / 100) + 1);
        setUserAchievements(u.achievements || []);
        
        const loc = u.location || '';
        const locParts = loc.split(',').map((s: string) => s.trim());
        
        setData({
            displayName: u.display_name === u.username ? '' : u.display_name, 
            bio: u.bio === "Этот пользователь пока ничего о себе не рассказал." ? '' : u.bio,
            avatarUrl: u.avatar_url || '', 
            coverUrl: u.cover_url || '', 
            location: loc, 
            country: locParts[0] || '',
            city: locParts[1] || '',
            favoriteGenre: u.favorite_genre || '', 
            equipment: u.equipment || '',
            favArtistUrl: u.favorite_artist_url || '', 
            favArtist: u.favorite_artist || '',
            favTrackUrl: u.favorite_track_url || '', 
            favTrack: u.favorite_track || '', 
            favAlbumUrl: u.favorite_album_url || '', 
            favAlbum: u.favorite_album || '', 
            theme: u.theme || 'classic'
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
    setStatus('Обрезаем и загружаем...');
    try {
      const croppedFile = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      if (croppedFile) {
        const formData = new FormData();
        formData.append('file', croppedFile);
        const res = await fetch('http://127.0.0.1:8000/api/upload', {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          const { url } = await res.json();
          updateData(cropFieldTarget, url);
          setStatus('✅ Картинка успешно загружена!');
          setTimeout(() => setStatus(''), 2000);
        } else setStatus('❌ Ошибка на сервере');
      }
    } catch (e: any) {
      setStatus('❌ Ошибка сети');
    }
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

  const toggleAchievementDisplay = async (achievementId: number) => {
      try {
          const res = await fetch(`http://127.0.0.1:8000/api/profile/achievements/toggle`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ api_key: userApiKey, achievement_id: achievementId })
          });
          if (res.ok) {
              const result = await res.json();
              setUserAchievements(prev => prev.map(a => a.id === achievementId ? { ...a, is_displayed: result.is_displayed } : a));
          }
      } catch (e) {
          console.error("Ошибка переключения видимости ачивки", e);
      }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setStatus('Сохраняем...');
    try {
      const res = await fetch('http://127.0.0.1:8000/api/profile/update', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: userApiKey, 
          display_name: data.displayName || localStorage.getItem('username'), 
          bio: data.bio || "Этот пользователь пока ничего о себе не рассказал.",
          avatar_url: fixImageUrl(data.avatarUrl), 
          cover_url: fixImageUrl(data.coverUrl), 
          location: data.country && data.city ? `${data.country}, ${data.city}` : data.country || data.city || '', 
          favorite_genre: data.favoriteGenre, 
          equipment: data.equipment, 
          theme: data.theme,
          favorite_artist: data.favArtist, 
          favorite_artist_url: data.favArtistUrl, 
          favorite_track: data.favTrack, 
          favorite_track_url: data.favTrackUrl, 
          favorite_album: data.favAlbum, 
          favorite_album_url: data.favAlbumUrl, 
          social_links: JSON.stringify(socialLinks.filter(l => l.username.trim() !== ''))
        })
      });
      
      if (!res.ok) throw new Error('Ошибка при сохранении');
      
      localStorage.setItem('site_theme', data.theme); 
      window.dispatchEvent(new Event('theme_update'));
      
      setStatus('✅ Успешно!'); 
      setTimeout(() => router.push(`/user/${localStorage.getItem('username')}`), 1000);
    } catch (err: any) { 
      setStatus('❌ ' + err.message); 
    }
  };

  if (loading) return <div className="min-h-screen text-[var(--accent-text)] flex items-center justify-center font-bold text-xl">Загрузка...</div>;

  return (
    <>
      {cropImageSrc && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-4xl h-[50vh] md:h-[70vh] bg-[#121212] rounded-xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/10">
            <Cropper
              image={cropImageSrc}
              crop={crop}
              zoom={zoom}
              aspect={cropFieldTarget === 'coverUrl' ? 3 / 1 : 1 / 1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_croppedArea: any, croppedAreaPix: any) => setCroppedAreaPixels(croppedAreaPix)}
            />
          </div>
          <div className="flex gap-4 mt-6">
            <button type="button" onClick={() => setCropImageSrc(null)} className="px-6 py-3 rounded-lg font-bold text-white bg-white/10 hover:bg-white/20 transition-all border border-white/10">
              Отмена
            </button>
            <button type="button" onClick={handleCropSave} className="px-8 py-3 rounded-lg font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all drop-shadow-[0_0_15px_var(--accent-glow)]">
              {cropFieldTarget === 'coverUrl' ? 'Установить обложку' : 'Установить аватарку'}
            </button>
          </div>
        </div>
      )}
      <div className="min-h-screen text-white p-4 md:p-8 max-w-6xl mx-auto flex flex-col md:flex-row gap-8 pt-24">
          <aside className="w-full md:w-64 shrink-0 flex flex-col gap-2">
              {['general', 'showcase', 'theme', 'integrations'].map(tab => (
                  <button 
                      key={tab} 
                      onClick={() => setActiveTab(tab)} 
                      className={`text-left px-4 py-3 rounded-lg font-bold transition-all ${activeTab === tab ? 'bg-[var(--accent)] text-[var(--text-on-accent)]' : 'text-gray-400 hover:bg-[#1e1e1e] hover:text-white'}`}
                  >
                      {tab === 'general' ? 'Общие данные' : tab === 'showcase' ? 'Витрина профиля' : tab === 'theme' ? 'Оформление' : 'Интеграции'}
                  </button>
              ))}
          </aside>

          <main className="flex-grow bg-[#1e1e1e]/60 backdrop-blur-md rounded-xl border border-white/5 shadow-lg relative overflow-hidden mb-20">
              {activeTab !== 'integrations' ? (
              <form onSubmit={handleSubmit}>
                  
                  {activeTab === 'general' && (
                      <div className="p-6 md:p-8 space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="col-span-1 md:col-span-2 mb-4">
                                  <label className="block text-sm font-bold text-gray-300 mb-2">Визуальное оформление профиля</label>
                                  <div className="relative w-full rounded-xl bg-[#282828]/30 border-2 border-dashed border-white/10 hover:border-[var(--accent)] transition-colors group mb-10">
                                      <label className="block w-full h-32 md:h-48 cursor-pointer overflow-hidden rounded-xl relative">
                                          {data.coverUrl ? (
                                              <>
                                                  <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{backgroundImage: `url(${data.coverUrl})`}}></div>
                                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center flex-col">
                                                      <span className="text-3xl mb-2">📸</span>
                                                      <span className="font-bold text-white shadow-sm">Изменить обложку</span>
                                                  </div>
                                              </>
                                          ) : (
                                              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 group-hover:text-[var(--accent-text)] transition-colors">
                                                  <span className="text-4xl mb-2">🏞️</span>
                                                  <span className="font-bold">Кликни, чтобы загрузить обложку</span>
                                                  <span className="text-xs mt-1 opacity-70">JPG, PNG, GIF</span>
                                              </div>
                                          )}
                                          <input type="file" accept="image/*" className="hidden" onChange={(e) => onSelectFile(e, 'coverUrl')} />
                                      </label>
                                      
                                      <label className="absolute -bottom-8 left-6 md:left-10 w-24 h-24 md:w-28 md:h-28 rounded-full bg-[#1e1e1e] border-4 border-[#1e1e1e] cursor-pointer overflow-hidden transition-all shadow-[0_4px_15px_rgba(0,0,0,0.5)] group/avatar z-10 hover:border-[var(--accent)]">
                                          {data.avatarUrl ? (
                                              <>
                                                  <img src={data.avatarUrl} alt="Аватар" className="w-full h-full object-cover transition-transform duration-500 group-hover/avatar:scale-110" />
                                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                      <span className="text-2xl drop-shadow-md">📸</span>
                                                  </div>
                                              </>
                                          ) : (
                                              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-[#282828] group-hover/avatar:text-[var(--accent-text)] transition-colors">
                                                  <span className="text-3xl drop-shadow-md">👤</span>
                                              </div>
                                          )}
                                          <input type="file" accept="image/*" className="hidden" onChange={(e) => onSelectFile(e, 'avatarUrl')} />
                                      </label>
                                  </div>
                              </div>
                              
                              <div>
                                  <label className="block text-sm font-bold text-gray-300 mb-2">Отображаемое Имя</label>
                                  <input value={data.displayName} onChange={e=>updateData('displayName', e.target.value)} className="w-full p-3 rounded bg-[#282828]/50 border border-white/10 focus:border-[var(--accent)] text-white focus:outline-none transition-colors" />
                              </div>
                              <div>
                                  <div>
                                      <label className="block text-sm font-bold text-gray-300 mb-2">Страна</label>
                                      <div className="relative">
                                          <select 
                                              value={data.country} 
                                              onChange={e => updateData('country', e.target.value)}
                                              className="w-full p-3 rounded bg-[#282828]/50 border border-white/10 focus:border-[var(--accent)] text-white focus:outline-none transition-colors appearance-none cursor-pointer"
                                          >
                                              <option value="">{countries.length > 0 ? 'Выберите страну...' : 'Загрузка стран...'}</option>
                                              {countries.map(c => (
                                                  <option key={c.code} value={c.name}>{c.flag} {c.name}</option>
                                              ))}
                                          </select>
                                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                                              ▼
                                          </div>
                                      </div>
                                  </div>
                              </div>
                              <div>
                                  <label className="block text-sm font-bold text-gray-300 mb-2">Город</label>
                                  <div className="relative">
                                      <input 
                                          id="unique_city_input_vein_v3"
                                          name="unique_city_v3"
                                          value={data.city} 
                                          onChange={e=>updateData('city', e.target.value)} 
                                          onFocus={() => setIsCityInputFocused(true)}
                                          onBlur={() => setTimeout(() => setIsCityInputFocused(false), 200)}
                                          placeholder="Введите название населенного пункта..."
                                          autoComplete="new-password"
                                          spellCheck={false}
                                          className="w-full p-3 rounded bg-[#282828]/50 border border-white/10 focus:border-[var(--accent)] text-white focus:outline-none transition-colors" 
                                      />
                                      {isCityInputFocused && (isSearching || cities.length > 0) && (
                                          <div className="absolute top-full left-0 right-0 bg-[#121212] border border-[var(--accent)]/50 rounded-lg mt-1 z-[100] max-h-60 overflow-y-auto shadow-[0_15px_60px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-top-2 duration-300">
                                              {isSearching && (
                                                  <div className="p-4 text-[10px] text-[var(--accent-text)] uppercase tracking-widest font-black italic flex items-center gap-3">
                                                      <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
                                                      Поиск в базе данных...
                                                  </div>
                                              )}
                                              {cities.map(c => (
                                                  <div 
                                                      key={c} 
                                                      onClick={() => { updateData('city', c); setCities([]); }}
                                                      className="p-4 hover:bg-[var(--accent)] hover:text-white cursor-pointer text-sm border-b border-white/5 last:border-none transition-all flex items-center justify-between group"
                                                  >
                                                      <span className="font-bold text-gray-100 group-hover:text-white transition-colors">{c}</span>
                                                      <span className="text-[10px] bg-[var(--accent)]/20 text-[var(--accent-text)] px-3 py-1.5 rounded font-black uppercase tracking-tighter group-hover:bg-white/20 group-hover:text-white transition-all shadow-sm">Выбрать</span>
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              </div>
                              <div>
                                  <label className="block text-sm font-bold text-gray-300 mb-2">Любимый жанр</label>
                                  <input value={data.favoriteGenre} onChange={e=>updateData('favoriteGenre', e.target.value)} className="w-full p-3 rounded bg-[#282828]/50 border border-white/10 focus:border-[var(--accent)] text-white focus:outline-none transition-colors" />
                              </div>
                              <div>
                                  <label className="block text-sm font-bold text-gray-300 mb-2">Аппаратура</label>
                                  <input value={data.equipment} onChange={e=>updateData('equipment', e.target.value)} className="w-full p-3 rounded bg-[#282828]/50 border border-white/10 focus:border-[var(--accent)] text-white focus:outline-none transition-colors" />
                              </div>
                          </div>
                          <div>
                              <label className="block text-sm font-bold text-gray-300 mb-2">О себе</label>
                              <textarea value={data.bio} onChange={e=>updateData('bio', e.target.value)} rows={3} className="w-full p-3 rounded bg-[#282828]/50 border border-white/10 focus:border-[var(--accent)] text-white focus:outline-none resize-none transition-colors"></textarea>
                          </div>
                          
                          <div className="pt-6 border-t border-white/5">
                              <h2 className="text-xl font-bold mb-4 text-[var(--accent-text)]">Социальные сети</h2>
                              {socialLinks.map(l => (
                                  <div key={l.id} className="flex flex-col md:flex-row gap-3 mb-3 bg-[#121212]/50 p-4 rounded-lg border border-white/5">
                                      <select value={l.network} onChange={e=>updateSocialLink(l.id, 'network', e.target.value)} className="w-full md:w-1/3 p-2.5 rounded bg-[#282828] text-white outline-none focus:border-[var(--accent)] border border-transparent">
                                          <option value="telegram">Telegram</option>
                                          <option value="vk">ВКонтакте</option>
                                          <option value="twitter">Twitter</option>
                                          <option value="steam">Steam</option>
                                          <option value="github">GitHub</option>
                                          <option value="instagram">Instagram</option>
                                      </select>
                                      <input value={l.username} onChange={e=>updateSocialLink(l.id, 'username', e.target.value)} placeholder="Никнейм или ID (без @)" className="flex-grow p-2.5 rounded bg-[#282828] text-white outline-none focus:border-[var(--accent)] border border-transparent" />
                                      <button type="button" onClick={()=>removeSocialLink(l.id)} className="px-4 py-2.5 bg-red-900/40 hover:bg-red-900/80 text-red-400 font-bold rounded transition-colors">Удалить</button>
                                  </div>
                              ))}
                              <button type="button" onClick={addSocialLink} className="text-[var(--accent-text)] text-sm font-bold hover:underline">+ Добавить соцсеть</button>
                          </div>
                      </div>
                  )}

                  {activeTab === 'showcase' && (
                      <div className="p-6 md:p-8 space-y-6">
                          <p className="text-sm text-gray-400 mb-4">Название и обложка подтянутся автоматически по ссылке (Яндекс, Spotify, VK, Apple Music, SoundCloud...). Указывай данные внимательно, чтобы срабатывал бонус x2 XP!</p>
                          
                          <div className="bg-[#121212]/50 p-5 rounded-xl border border-white/5 shadow-md">
                              <div className="flex items-center gap-2 mb-4">
                                  <h3 className="font-bold text-[var(--accent-text)] text-lg">🎤 Любимый артист</h3>
                                  <span className="bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent-text)] text-[10px] px-2 py-0.5 rounded font-black animate-pulse">🔥 x2 XP</span>
                              </div>
                              <div className="space-y-4">
                                  <div><label className="block text-xs text-gray-400 mb-1">Ссылка</label><input value={data.favArtistUrl} onChange={e=>updateData('favArtistUrl', e.target.value)} className="w-full p-2.5 rounded bg-[#282828]/80 text-white outline-none focus:border-[var(--accent)] border border-white/5" /></div>
                                  <div><label className="block text-xs text-gray-400 mb-1">Имя (оставь пустым для автопоиска)</label><input value={data.favArtist} onChange={e=>updateData('favArtist', e.target.value)} className="w-full p-2.5 rounded bg-[#282828]/80 text-white outline-none focus:border-[var(--accent)] border border-white/5" /></div>
                              </div>
                          </div>

                          <div className="bg-[#121212]/50 p-5 rounded-xl border border-white/5 shadow-md">
                              <div className="flex items-center gap-2 mb-4">
                                  <h3 className="font-bold text-[var(--accent-text)] text-lg">🎵 Любимый трек</h3>
                                  <span className="bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent-text)] text-[10px] px-2 py-0.5 rounded font-black animate-pulse">🔥 x2 XP</span>
                              </div>
                              <div className="space-y-4">
                                  <div><label className="block text-xs text-gray-400 mb-1">Ссылка</label><input value={data.favTrackUrl} onChange={e=>updateData('favTrackUrl', e.target.value)} className="w-full p-2.5 rounded bg-[#282828]/80 text-white outline-none focus:border-[var(--accent)] border border-white/5" /></div>
                                  <div><label className="block text-xs text-gray-400 mb-1">Название (оставь пустым для автопоиска)</label><input value={data.favTrack} onChange={e=>updateData('favTrack', e.target.value)} className="w-full p-2.5 rounded bg-[#282828]/80 text-white outline-none focus:border-[var(--accent)] border border-white/5" /></div>
                              </div>
                          </div>

                          <div className="bg-[#121212]/50 p-5 rounded-xl border border-white/5 shadow-md">
                              <div className="flex items-center gap-2 mb-4">
                                  <h3 className="font-bold text-[var(--accent-text)] text-lg">💿 Любимый альбом</h3>
                                  <span className="bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent-text)] text-[10px] px-2 py-0.5 rounded font-black animate-pulse">🔥 x2 XP</span>
                              </div>
                              <div className="space-y-4">
                                  <div><label className="block text-xs text-gray-400 mb-1">Ссылка</label><input value={data.favAlbumUrl} onChange={e=>updateData('favAlbumUrl', e.target.value)} className="w-full p-2.5 rounded bg-[#282828]/80 text-white outline-none focus:border-[var(--accent)] border border-white/5" /></div>
                                  <div><label className="block text-xs text-gray-400 mb-1">Название (оставь пустым для автопоиска)</label><input value={data.favAlbum} onChange={e=>updateData('favAlbum', e.target.value)} className="w-full p-2.5 rounded bg-[#282828]/80 text-white outline-none focus:border-[var(--accent)] border border-white/5" /></div>
                              </div>
                          </div>

                          <div className="pt-6 border-t border-white/5 mt-6">
                              <h2 className="text-xl font-bold mb-2 text-[var(--accent-text)]">Отображение достижений</h2>
                              <p className="text-sm text-gray-400 mb-4">Выбери, какие из полученных достижений будут видны на твоей главной странице профиля.</p>
                              
                              {userAchievements.length === 0 ? (
                                  <p className="text-sm text-gray-500 italic">У тебя пока нет полученных достижений.</p>
                              ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {userAchievements.map(a => (
                                          <div key={a.id} className={`bg-[#121212]/50 p-4 rounded-xl border flex items-center justify-between shadow-md transition-all ${a.is_displayed ? 'border-white/10' : 'border-transparent opacity-60'}`}>
                                              <div className="flex items-center gap-3">
                                                  {a.target_image ? (
                                                      <img src={a.target_image} className="w-10 h-10 rounded object-cover border border-white/10 shadow-inner shrink-0" alt="ach" />
                                                  ) : (
                                                      <span className="w-10 h-10 flex items-center justify-center bg-[#1a1a1a] rounded border border-white/10 text-xl shadow-inner shrink-0">{a.icon}</span>
                                                  )}
                                                  <div>
                                                      <div className="font-bold text-white text-sm leading-tight">{a.name}</div>
                                                      <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">{a.is_displayed ? 'Отображается' : 'Скрыто'}</div>
                                                  </div>
                                              </div>
                                              <button 
                                                  type="button"
                                                  onClick={() => toggleAchievementDisplay(a.id)}
                                                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none shadow-inner ${a.is_displayed ? 'bg-[var(--accent)]' : 'bg-gray-700'}`}
                                              >
                                                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow ${a.is_displayed ? 'translate-x-6' : 'translate-x-1'}`} />
                                              </button>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      </div>
                  )}

                  {activeTab === 'theme' && (
                      <div className="p-6 md:p-8">
                          <h2 className="text-xl font-bold mb-6 text-[var(--accent-text)]">Выбор цветовой темы</h2>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {THEMES.map(opt => {
                                  const isLocked = level < opt.req; 
                                  
                                  const isSelected = opt.isCustom 
                                      ? data.theme.startsWith('#') 
                                      : data.theme === opt.id;

                                  return (
                                      <div 
                                          key={opt.id} 
                                          onClick={() => {
                                              if (isLocked) return;
                                              if (opt.isCustom) {
                                                  if (!data.theme.startsWith('#')) updateData('theme', '#ffffff');
                                              } else {
                                                  updateData('theme', opt.id);
                                              }
                                          }} 
                                          className={`p-4 rounded-xl border-2 transition-all flex items-center justify-between cursor-pointer ${isLocked ? 'border-white/5 bg-[#121212]/50 opacity-50' : isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_15px_var(--accent-glow)]' : 'border-white/10 bg-[#121212] hover:border-white/30'}`}
                                      >
                                          <div className="flex items-center gap-4">
                                              {opt.isRainbow ? (
                                                  <div className="w-8 h-8 rounded-full shadow-lg" style={{ background: 'linear-gradient(45deg, #ff0044, #aa00ff, #00eeff, #00ffaa)' }}></div>
                                              ) : opt.isCustom ? (
                                                  <div className="relative w-8 h-8 rounded-full shadow-lg overflow-hidden border border-white/20">
                                                      <input 
                                                          type="color" 
                                                          disabled={isLocked}
                                                          value={data.theme.startsWith('#') ? data.theme : '#ffffff'}
                                                          onChange={(e) => updateData('theme', e.target.value)}
                                                          onClick={(e) => e.stopPropagation()} 
                                                          className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer"
                                                      />
                                                  </div>
                                              ) : (
                                                  <div className="w-8 h-8 rounded-full shadow-lg" style={{background: opt.color}}></div>
                                              )}
                                              
                                              <div>
                                                  <div className="font-bold text-white text-lg">{opt.name}</div>
                                                  <div className="text-xs text-gray-400 uppercase tracking-wider">Требуется LVL {opt.req}</div>
                                              </div>
                                          </div>
                                          {isLocked ? <span className="text-2xl">🔒</span> : isSelected ? <span className="text-2xl">✅</span> : null}
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  )}

                  <div className="p-6 bg-black/20 flex justify-between items-center border-t border-white/5">
                      <span className="text-[var(--accent-text)] font-bold drop-shadow-md">{status}</span>
                      <button type="submit" className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] font-black px-8 py-3 rounded-lg hover:scale-105 shadow-[0_0_15px_var(--accent-glow)] transition-all">
                          Сохранить настройки
                      </button>
                  </div>
              </form>
              ) : (
                  <div className="p-6 md:p-8">
                      <h2 className="text-2xl font-bold mb-6 text-white">Интеграции</h2>
                      
                      <div className="flex flex-col gap-6">


                          <div className="bg-[#121212]/50 p-6 rounded-xl border border-white/5 flex flex-col gap-6 shadow-md mt-4 relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1 h-full bg-[var(--accent)]"></div>
                              
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                  <div className="flex items-center gap-4">
                                      <div className="w-12 h-12 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] rounded-xl flex items-center justify-center text-[var(--text-on-accent)] font-black text-2xl shadow-[0_0_10px_var(--accent-glow)] shrink-0">V</div>
                                      <div>
                                          <h3 className="font-bold text-lg text-white">Браузерное расширение VEIN</h3>
                                          <p className="text-sm text-gray-400">Требуется для Spotify, Яндекс Музыки, ВК, Apple Music, SoundCloud и YouTube</p>
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-3 bg-[#1a1a1a] p-2 rounded-lg border border-white/5 w-full md:w-auto">
                                      <code className="text-[var(--accent-text)] px-3 font-mono text-sm break-all max-w-[200px] truncate">{userApiKey}</code>
                                      <button onClick={handleCopyKey} className="bg-white/5 border border-white/10 text-white hover:text-[var(--accent-text)] transition px-4 py-2 rounded font-bold text-sm shrink-0">
                                          {copied ? 'Скопировано!' : 'Копировать'}
                                      </button>
                                  </div>
                              </div>

                              <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/20 p-5 rounded-xl">
                                  <h3 className="font-black text-white text-md mb-2">Почему мы используем расширение?</h3>
                                  <p className="text-gray-300 text-sm leading-relaxed space-y-2">
                                      <b>Яндекс Музыка</b> — закрытая экосистема, а <b>Spotify</b> ввел строгие ограничения на использование API (теперь требуется Premium) для стабильной трансляции прослушиваний в реальном времени.<br/><br/>
                                      Более того, мобильные ОС (особенно iOS) жестко блокируют фоновые процессы. Ни одно приложение не может легально висеть в фоне и читать плеер другого приложения без костылей.<br/><br/>
                                      Поэтому единственный честный и надежный способ собирать точную статистику — <b>локальный скроблинг через наше браузерное расширение.</b> Оно перехватывает треки напрямую из вашего браузера, не давая им потеряться.
                                  </p>
                              </div>
                          </div>
                          
                      </div>
                  </div>
              )}
          </main>
      </div>
    </>
  );
}