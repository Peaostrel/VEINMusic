'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Footer() {
  const [stats, setStats] = useState({ users: 1, scrobbles: '185', uniqueTracks: '709', status: 'Online' });

  useEffect(() => {
    const fetchStats = () => {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/public-stats`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setStats({
              users: data.online,
              scrobbles: String(data.total_scrobbles),
              uniqueTracks: String(data.total_tracks),
              status: 'Online'
            });
          }
        }).catch(() => {});
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000); // Полллинг каждые 10 секунд
    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="w-full bg-[#090909] border-t border-white/5 pt-12 pb-8 mt-auto z-10 relative">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Колонка 1: Описание */}
          <div className="flex flex-col gap-2">
            <Link href="/" className="flex items-center gap-2 font-black text-xl tracking-tight text-white group w-fit">
              <div className="w-7 h-7 bg-[var(--accent)] rounded-lg flex items-center justify-center text-white font-black text-base group-hover:scale-105 transition-transform">V</div>
              <span>VEIN<span className="text-[var(--accent)]">Music</span></span>
            </Link>
            <p className="text-gray-500 text-xs mt-1 leading-relaxed max-w-xs">
              Автоматический трекинг прослушиваний. Твоя музыкальная жизнь в одном дашборде.
            </p>
          </div>

          {/* Колонка 2: Ресурсы */}
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-3">Ресурсы</h4>
            <ul className="space-y-2 text-gray-400 text-xs">
              <li><Link href="/developers" className="hover:text-[var(--accent-text)] transition-colors">Для разработчиков (API)</Link></li>
              <li><a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-[var(--accent-text)] transition-colors">GitHub</a></li>
            </ul>
          </div>

          {/* Колонка 3: Юридические ссылки */}
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-3">Информация</h4>
            <ul className="space-y-2 text-gray-400 text-xs">
              <li><Link href="/about" className="hover:text-[var(--accent-text)] transition-colors">О проекте ✨</Link></li>
              <li><Link href="/privacy" className="hover:text-[var(--accent-text)] transition-colors">Конфиденциальность</Link></li>
              <li><Link href="/terms" className="hover:text-[var(--accent-text)] transition-colors">Условия использования</Link></li>
            </ul>
          </div>
        </div>

        {/* Разделитель */}
        <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-gray-500 font-medium">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_#34d399]"></span> {stats.status}</span>
            <span className="opacity-30">|</span>
            <span>🔥 {stats.users} онлайн</span>
            <span className="opacity-30">|</span>
            <span>📊 {stats.scrobbles} скрорбблов</span>
            <span className="opacity-30">|</span>
            <span>🎵 {stats.uniqueTracks} в базе</span>
          </div>
          <div className="tracking-widest uppercase text-[10px] opacity-70 flex items-center gap-1">
            VEIN Music © {new Date().getFullYear()} <span className="opacity-40">|</span> Разработано с <span className="text-red-500 animate-pulse text-xs">❤️</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
