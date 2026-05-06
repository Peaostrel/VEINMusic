'use client';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export const THEMES = {
  classic: { main: '#ffcc00', hover: '#ffaa00', glow: 'rgba(255,204,0,0.3)', glowStrong: 'rgba(255,204,0,0.6)' },
  green: { main: '#1DB954', hover: '#16a34a', glow: 'rgba(29,185,84,0.3)', glowStrong: 'rgba(29,185,84,0.6)' },
  orange: { main: '#ff4500', hover: '#dc2626', glow: 'rgba(255,69,0,0.3)', glowStrong: 'rgba(255,69,0,0.6)' },
  purple: { main: '#a855f7', hover: '#7e22ce', glow: 'rgba(168,85,247,0.3)', glowStrong: 'rgba(168,85,247,0.6)' },
  red: { main: '#ef4444', hover: '#b91c1c', glow: 'rgba(239,68,68,0.3)', glowStrong: 'rgba(239,68,68,0.6)' },
  cyan: { main: '#00ffff', hover: '#0088ff', glow: 'rgba(0,255,255,0.3)', glowStrong: 'rgba(0,255,255,0.6)' },
};

const isValidUser = (u: any) => {
    if (!u) return false;
    const s = String(u).trim().toLowerCase();
    return s !== '' && s !== 'null' && s !== 'undefined' && s !== 'false' && s !== '[]' && s !== '{}';
};

export const VerifiedBadge = ({ role, isVerified, sizeClass = "w-5 h-5" }: { role?: string; isVerified?: boolean; sizeClass?: string }) => {
  if (role === 'developer') return (
      <div className="inline-flex items-center justify-center ml-1" title="Разработчик VEIN">
          <svg viewBox="0 0 24 24" className={`${sizeClass} drop-shadow-[0_0_8px_var(--accent-glow-strong)] shrink-0`}><path fill="#1a1a1a" stroke="var(--accent)" strokeWidth="1.2" d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.918-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.337 2.25c-.416-.165-.866-.25-1.336-.25-2.21 0-3.918 1.79-3.918 4 0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.46.74 2.746 1.846 3.45-.05.22-.077.447-.077.68 0 2.21 1.71 3.998 3.918 3.998.47 0 .92-.084 1.336-.25C8.49 21.585 9.796 22.5 11.25 22.5c1.455 0 2.76-.915 3.338-2.25.416.166.866.25 1.336.25 2.21 0 3.918-1.79 3.918-4 0-.233-.026-.46-.077-.68 1.106-.704 1.846-1.99 1.846-3.45z"></path><path fill="var(--accent)" d="M10.25 16.5l-3.5-3.5 1.414-1.414 2.086 2.086 5.586-5.586 1.414 1.414-7 7z"></path></svg>
      </div>
  );
  if (role === 'tester' || isVerified) return (
      <div className="inline-flex items-center justify-center ml-1" title={role === 'tester' ? "Тестировщик" : "Верифицирован"}>
          <svg viewBox="0 0 24 24" className={`${sizeClass} drop-shadow-[0_0_8px_rgba(29,155,240,0.6)] shrink-0`}><path fill="#1D9BF0" d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.918-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.337 2.25c-.416-.165-.866-.25-1.336-.25-2.21 0-3.918 1.79-3.918 4 0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.46.74 2.746 1.846 3.45-.05.22-.077.447-.077.68 0 2.21 1.71 3.998 3.918 3.998.47 0 .92-.084 1.336-.25C8.49 21.585 9.796 22.5 11.25 22.5c1.455 0 2.76-.915 3.338-2.25.416.166.866.25 1.336.25 2.21 0 3.918-1.79 3.918-4 0-.233-.026-.46-.077-.68 1.106-.704 1.846-1.99 1.846-3.45z"></path><path fill="#ffffff" d="M10.25 16.5l-3.5-3.5 1.414-1.414 2.086 2.086 5.586-5.586 1.414 1.414-7 7z"></path></svg>
      </div>
  );
  return null;
};

export const getRankInfo = (level: number) => {
    if (level >= 100) return { title: "Божество" };
    if (level >= 50) return { title: "Легенда" };
    if (level >= 30) return { title: "Маньяк" };
    if (level >= 15) return { title: "Аудиофил" };
    if (level >= 5) return { title: "Меломан" };
    return { title: "Турист" };
};

export const getNextRankInfo = (level: number) => {
  if (level < 5) return { name: "Меломан", target: 5 };
  if (level < 15) return { name: "Аудиофил", target: 15 };
  if (level < 30) return { name: "Маньяк", target: 30 };
  if (level < 50) return { name: "Легенда", target: 50 };
  if (level < 100) return { name: "Божество", target: 100 };
  return null;
};

export const LvlBadge = ({ level }: { level: number }) => {
    const rank = getRankInfo(level || 1);
    return (
        <span className={`ml-2 inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-[var(--accent)] text-[var(--accent)] bg-[#121212] shadow-[0_0_5px_var(--accent-glow)] shrink-0`}>
            LVL {level || 1}
        </span>
    );
};

export default function Navbar() {
  const [username, setUsername] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
      const uname = localStorage.getItem('username');
      const key = localStorage.getItem('apiKey');
      if (!uname || !key) return;
      // Блокировка расширением временно отключена
  }, [pathname]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hexToRgbVals = (hex: string) => {
      hex = hex.replace('#', '');
      if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      return {
          r: parseInt(hex.substring(0, 2), 16) || 0,
          g: parseInt(hex.substring(2, 4), 16) || 0,
          b: parseInt(hex.substring(4, 6), 16) || 0
      };
  };

  const applyTheme = (themeKey: string) => {
      if (typeof document === 'undefined') return;
      const root = document.documentElement;
      let r = 0, g = 0, b = 0;
      let isRainbow = themeKey === 'rainbow';
      if (!isRainbow) {
          if (themeKey && themeKey.startsWith('#')) {
              const vals = hexToRgbVals(themeKey);
              r = vals.r; g = vals.g; b = vals.b;
          } else {
              const t = THEMES[themeKey as keyof typeof THEMES] || THEMES.classic;
              const vals = hexToRgbVals(t.main);
              r = vals.r; g = vals.g; b = vals.b;
          }
      }
      const lum = (r * 299 + g * 587 + b * 114) / 1000;
      const textOnAccent = lum < 150 || isRainbow ? '#ffffff' : '#121212';
      const accentText = lum < 60 && !isRainbow ? '#ffffff' : 'var(--accent)';
      root.style.setProperty('--text-on-accent', textOnAccent);
      root.style.setProperty('--accent-text', accentText);
      if (isRainbow) { 
          root.classList.add('theme-rainbow'); 
          root.style.removeProperty('--accent');
          root.style.removeProperty('--accent-hover');
          root.style.removeProperty('--accent-glow');
          root.style.removeProperty('--accent-glow-strong');
      } 
      else if (themeKey && themeKey.startsWith('#')) {
          root.classList.remove('theme-rainbow');
          root.style.setProperty('--accent', themeKey);
          root.style.setProperty('--accent-hover', themeKey);
          root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.3)`);
          root.style.setProperty('--accent-glow-strong', `rgba(${r}, ${g}, ${b}, 0.6)`);
      } else {
          root.classList.remove('theme-rainbow');
          const t = THEMES[themeKey as keyof typeof THEMES] || THEMES.classic;
          root.style.setProperty('--accent', t.main);
          root.style.setProperty('--accent-hover', t.hover);
          root.style.setProperty('--accent-glow', t.glow);
          root.style.setProperty('--accent-glow-strong', t.glowStrong);
      }
  };

  const [currentTheme, setCurrentTheme] = useState('classic');

  useEffect(() => {
      const handleThemeUpdate = () => {
          let t = 'classic';
          if (window.location.pathname.toLowerCase().includes('/auth')) { t = 'classic'; }
          else if (window.location.pathname.toLowerCase().startsWith('/user/') && (window as any).__ACTIVE_PROFILE_THEME__) { t = (window as any).__ACTIVE_PROFILE_THEME__; } 
          else { 
              const storedUser = localStorage.getItem('username');
              if (isValidUser(storedUser)) {
                  t = localStorage.getItem('site_theme') || 'classic'; 
              } else {
                  t = 'classic'; 
              }
          }
          setCurrentTheme(t);
          applyTheme(t);
      };
      handleThemeUpdate();
      window.addEventListener('theme_update', handleThemeUpdate);
      return () => window.removeEventListener('theme_update', handleThemeUpdate);
  }, [pathname]);

  useEffect(() => {
    if (currentTheme !== 'rainbow') return;
    const root = document.documentElement;
    let hue = 0;
    const interval = setInterval(() => {
        hue = (hue + 2) % 360;
        root.style.setProperty('--accent', `hsl(${hue}, 100%, 50%)`);
        root.style.setProperty('--accent-hover', `hsl(${hue}, 100%, 50%)`);
        root.style.setProperty('--accent-glow', `hsla(${hue}, 100%, 100%, 0.3)`);
        root.style.setProperty('--accent-glow-strong', `hsla(${hue}, 100%, 100%, 0.6)`);
    }, 40);
    return () => {
        clearInterval(interval);
        // Безопасный возврат
        if (typeof document !== 'undefined') {
            document.documentElement.style.removeProperty('--accent');
            document.documentElement.style.removeProperty('--accent-hover');
            document.documentElement.style.removeProperty('--accent-glow');
            document.documentElement.style.removeProperty('--accent-glow-strong');
        }
    };
  }, [currentTheme]);

  useEffect(() => {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const storedUser = localStorage.getItem('username');
      if (isValidUser(storedUser)) {
        setUsername(storedUser);
        fetch(`${API_URL}/api/user/${storedUser}`).then(res => res.json()).then(data => { 
                setUserProfile(data);
                if (data.theme) { localStorage.setItem('site_theme', data.theme); window.dispatchEvent(new Event('theme_update')); }
        }).catch(() => {});
      }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: any) => { 
        if (searchRef.current && !searchRef.current.contains(e.target)) setIsSearchOpen(false); 
        if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    const delay = setTimeout(() => {
      fetch(`${API_URL}/api/search/users?q=${searchQuery}`).then(res => res.json()).then(data => { setSearchResults(data); setIsSearchOpen(true); }).catch(()=>{});
    }, 300);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  const handleLogout = () => {
      localStorage.removeItem('username'); localStorage.removeItem('apiKey');
      localStorage.setItem('site_theme', 'classic'); setUsername(null); setUserProfile(null);
      delete (window as any).__ACTIVE_PROFILE_THEME__; window.dispatchEvent(new Event('theme_update'));
      setIsDropdownOpen(false); window.location.href = '/auth'; 
  };

  const avatar = userProfile?.avatar_url || (isValidUser(username) ? `https://api.dicebear.com/9.x/micah/svg?seed=${username}&backgroundColor=transparent` : '');


  return (
    <>
      <style>{`
        @property --accent { syntax: '<color>'; inherits: true; initial-value: #ffcc00; }
        @property --accent-glow { syntax: '<color>'; inherits: true; initial-value: rgba(255,204,0,0.3); }
        .theme-rainbow { animation: rainbow-anim 4s linear infinite !important; --accent-hover: var(--accent) !important; --accent-glow-strong: var(--accent-glow) !important; }
        @keyframes rainbow-anim {
            0% { --accent: #ff0044; --accent-glow: rgba(255,0,68,0.3); }
            25% { --accent: #aa00ff; --accent-glow: rgba(170,0,255,0.3); }
            50% { --accent: #00eeff; --accent-glow: rgba(0,238,255,0.3); }
            75% { --accent: #00ffaa; --accent-glow: rgba(0,255,170,0.3); }
            100% { --accent: #ff0044; --accent-glow: rgba(255,0,68,0.3); }
        }
        ::selection { background-color: var(--accent) !important; color: #000 !important; }
      `}</style>
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 w-[95%] max-w-6xl z-50">
        <div className="bg-[#121212]/70 backdrop-blur-xl border border-white/5 rounded-2xl px-4 py-3 flex items-center justify-between shadow-[0_8px_30px_rgb(0,0,0,0.4)] gap-4">
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <div className="w-10 h-10 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] rounded-xl flex items-center justify-center text-[var(--text-on-accent)] font-black text-2xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-[0_0_15px_var(--accent-glow)]">V</div>
            <span className="font-black text-2xl tracking-tight hidden lg:block text-white">
                VEIN
                <span className="text-[var(--accent)] drop-shadow-[0_0_10px_var(--accent-glow-strong)] transition-colors duration-500">Music</span>
            </span>
          </Link>
          <div className="flex-grow max-w-md relative" ref={searchRef}>
              <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">🔍</span>
                  {/* Dummy inputs to trick Firefox/Chrome autofill */}
                  <input type="text" style={{display: 'none'}} aria-hidden="true" />
                  <input type="password" style={{display: 'none'}} aria-hidden="true" />
                  
                  <input 
                      type="search" 
                      id="vein_music_search_v2"
                      name="vein_music_search_v2"
                      placeholder="Поиск профилей..." 
                      value={searchQuery} 
                      onChange={(e) => { setSearchQuery(e.target.value); setIsSearchOpen(true); }} 
                      onFocus={(e) => { 
                          e.target.removeAttribute('readonly');
                          if(searchResults.length > 0 || searchQuery.length >= 2) setIsSearchOpen(true); 
                      }}
                      readOnly
                      autoComplete="off"
                      spellCheck="false"
                      autoCorrect="off"
                      autoCapitalize="none"
                      className="w-full bg-[#1a1a1a]/80 border border-white/10 text-white text-sm rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-[var(--accent)] transition-colors backdrop-blur-md"
                  />
              </div>
              {isSearchOpen && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#1e1e1e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                      {searchResults.map((u) => (
                          <div key={u.username} onClick={() => { setIsSearchOpen(false); setSearchQuery(''); router.push(`/user/${u.username}`); }} className="flex items-center gap-3 p-3 hover:bg-white/10 cursor-pointer transition-colors border-b border-white/5 last:border-0">
                              <div className="w-9 h-9 rounded-full overflow-hidden bg-black shrink-0"><img src={u.avatar_url || `https://api.dicebear.com/9.x/micah/svg?seed=${u.username}&backgroundColor=transparent`} alt="Avatar" className="w-full h-full object-cover" /></div>
                              <div className="truncate flex-grow">
                                  <div className="font-bold text-white text-sm truncate flex items-center gap-1">
                                      {u.display_name} <VerifiedBadge role={u.role} isVerified={u.is_verified} sizeClass="w-3.5 h-3.5" /><LvlBadge level={u.level} />
                                  </div>
                                  <div className="text-xs text-gray-500 truncate">@{u.username}</div>
                                  </div>
                          </div>
                      ))}
                  </div>
              )}
          </div>
          <div className="flex items-center gap-2 sm:gap-4 font-bold text-sm shrink-0">
            <Link href="/feed" className="text-gray-400 hover:text-[var(--accent-text)] transition p-2 rounded-lg hover:bg-white/5"><span className="text-lg">📡</span> <span className="hidden md:inline ml-1">Лента</span></Link>
            <Link href="/leaderboard" className="text-gray-400 hover:text-[var(--accent-text)] transition p-2 rounded-lg hover:bg-white/5"><span className="text-lg">🏆</span> <span className="hidden md:inline ml-1">Топ</span></Link>
            {isValidUser(username) ? (
              <div className="relative" ref={dropdownRef}>
                  <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="w-10 h-10 rounded-full border-2 border-transparent hover:border-[var(--accent)] transition-all overflow-hidden bg-[#1a1a1a] shadow-md flex items-center justify-center shrink-0 ml-2">
                       <img src={avatar} className="w-full h-full object-cover" alt="Avatar" />
                  </button>
                  {isDropdownOpen && (
                      <div className="absolute right-0 top-[calc(100%+12px)] w-[300px] bg-[#222222] border border-white/5 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.6)] overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                          <div className="p-5 flex flex-col items-center border-b border-white/5 bg-[#1e1e1e]">
                               <img src={avatar} className="w-16 h-16 rounded-full object-cover border border-white/10 bg-[#121212] mb-3" alt="Avatar" />
                              <div className="text-white font-bold text-lg flex items-center justify-center w-full truncate">
                                  <span className="truncate">{userProfile?.display_name || username}</span>
                                  {userProfile && <VerifiedBadge role={userProfile.role} isVerified={userProfile.is_verified} sizeClass="w-5 h-5" />}
                              </div>
                              <div className="text-gray-400 text-xs mt-0.5">@{username}</div>
                              <Link href={`/user/${username}`} onClick={() => setIsDropdownOpen(false)} className="mt-4 w-full bg-white/5 hover:bg-white/10 text-white font-bold py-2 rounded-lg text-center transition-colors border border-white/5">Мой профиль</Link>
                          </div>
                          <div className="p-2 flex flex-col gap-0.5">
                              <Link href={`/user/${username}/stats`} onClick={() => setIsDropdownOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors"><span className="text-lg opacity-80">📊</span><span className="font-medium">Статистика</span></Link>
                              <Link href={`/user/${username}/achievements`} onClick={() => setIsDropdownOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors"><span className="text-lg opacity-80">🏆</span><span className="font-medium">Достижения</span></Link>
                              <Link href="/settings" onClick={() => setIsDropdownOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors"><span className="text-lg opacity-80">⚙️</span><span className="font-medium">Настройки</span></Link>
                              {userProfile?.role === 'developer' && (
                                  <Link href="/admin" onClick={() => setIsDropdownOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors border border-transparent border-t-white/5">
                                      <span className="text-lg opacity-80">🛡️</span>
                                      <span className="font-medium">Админка</span>
                                  </Link>
                              )}
                          </div>
                          <div className="p-2 border-t border-white/5 bg-[#1a1a1a]">
                              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors text-left"><span className="text-lg opacity-80">🚪</span><span className="font-medium">Выход</span></button>
                          </div>
                      </div>
                  )}
              </div>
            ) : <Link href="/auth" className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] px-5 py-2 rounded-xl transition-all duration-300 shadow-[0_0_15px_var(--accent-glow)] hover:scale-105 shrink-0 ml-2">Войти</Link>}
          </div>
        </div>
      </nav>
    </>
  );
}
