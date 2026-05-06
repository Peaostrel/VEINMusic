'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function About() {
  const [stats, setStats] = useState({ total_users: 0, total_scrobbles: 0, total_tracks: 0, online: 0 });
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    setUsername(localStorage.getItem('username'));

    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/public-stats`)
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 relative flex flex-col items-center">
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes rotateGlow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-fade-up { animation: fadeInUp 0.8s ease-out forwards; }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .animate-float { animation: float 4s ease-in-out infinite; }
      `}</style>

      {/* Фрагмент заднего фона с крутящимися аурами */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-[var(--accent)]/10 rounded-full blur-[120px] filter mix-blend-screen opacity-50 z-0 pointer-events-none animate-pulse"></div>

      {/* HERO Section */}
      <div className="text-center py-20 relative z-10 w-full flex flex-col items-center">
        <div className="w-20 h-20 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] rounded-3xl flex items-center justify-center text-white font-black text-4xl shadow-[0_0_40px_var(--accent-glow-strong)] mb-8 animate-float">
          V
        </div>
        
        <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-500 tracking-tight mb-4 drop-shadow-2xl animate-fade-up">
          ТВОЯ МУЗЫКА. <br /> ТВОЯ <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)]">ИСТОРИЯ.</span>
        </h1>
        
        <p className="text-gray-400 text-lg md:text-xl max-w-xl mx-auto mb-10 font-medium animate-fade-up delay-100 opacity-0" style={{ animationFillMode: 'forwards' }}>
          VEIN Music — это умный скроблер, который собирает твою музыкальную жизнь в один красивый дашборд. Забудь о границах между плеерами.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 animate-fade-up delay-200 opacity-0" style={{ animationFillMode: 'forwards' }}>
          <Link href={username ? `/user/${username}` : "/auth"} className="w-full sm:w-auto bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] font-black px-8 py-4 rounded-2xl hover:scale-105 transition-all shadow-[0_0_20px_var(--accent-glow-strong)] text-lg flex items-center justify-center">
            {username ? 'В мой профиль' : 'Начать скроблить'}
          </Link>
          <a href="#features" className="w-full sm:w-auto bg-white/5 border border-white/10 text-white font-bold px-8 py-4 rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all backdrop-blur-sm text-lg flex items-center justify-center">
            Узнать больше
          </a>
        </div>
      </div>

      {/* STATS Section */}
      <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4 px-4 mb-24 relative z-10 animate-fade-up delay-300 opacity-0" style={{ animationFillMode: 'forwards' }}>
        {[
          { label: 'Скроблено', value: stats.total_scrobbles.toLocaleString() + ' 🎵' },
          { label: 'Треков в базе', value: stats.total_tracks.toLocaleString() + ' 💿' },
          { label: 'Слушателей', value: stats.total_users.toLocaleString() + ' 👥' },
          { label: 'Онлайн', value: stats.online + ' 🔥' }
        ].map((item, idx) => (
          <div key={idx} className="bg-[#121212]/60 backdrop-blur-md border border-white/5 p-6 rounded-2xl text-center shadow-lg hover:border-[var(--accent)]/30 transition-all group">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1 group-hover:text-[var(--accent)] transition-colors">{item.label}</p>
            <p className="text-xl md:text-3xl font-black text-white">{item.value}</p>
          </div>
        ))}
      </div>

      {/* FEATURES Section */}
      <div id="features" className="w-full mb-24 relative z-10">
        <h2 className="text-3xl font-black text-center text-white mb-12 flex items-center justify-center gap-2">
          <span className="w-8 h-1 bg-[var(--accent)] rounded-full"></span>
          Возможности
          <span className="w-8 h-1 bg-[var(--accent)] rounded-full"></span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: '⚡',
              title: 'Скроблинг (Почти умный)',
              desc: 'Расширение считывает треки из Яндекс Музыки, Spotify, VK и Soundcloud. Иногда думает пару секунд, пока сохраняет в базу, но забирает всё честно.'
            },
            {
              icon: '📊',
              title: 'Простая Статистика',
              desc: 'Почасовая история, топы артистов и прослушиваний. Показываем ровно то, что пришло из плеера, без скрытых алгоритмов.'
            },
            {
              icon: '🏆',
              title: 'Ачивки и LVL (Для фана)',
              desc: 'Получай XP за прослушивание 85% длины трека. Прокачивай LVL и собирай достижения. Стрик сгорает, если пропустить день.'
            }
          ].map((feat, idx) => (
            <div key={idx} className="bg-[#1a1a1a]/80 backdrop-blur-md border border-white/5 p-8 rounded-3xl hover:bg-[#1f1f1f] hover:border-[var(--accent)]/40 hover:-translate-y-2 transition-all duration-300 shadow-xl group">
              <div className="text-4xl mb-4 bg-[var(--accent)]/10 w-14 h-14 rounded-2xl flex items-center justify-center shadow-[0_0_15px_var(--accent-glow)] group-hover:scale-110 transition-transform">
                {feat.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-[var(--accent)] transition-colors">{feat.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS Section */}
      <div className="w-full mb-32 relative z-10 flex flex-col items-center">
        <h2 className="text-3xl font-black text-center text-white mb-12">Как это работает на самом деле? 🛠️</h2>
        <div className="max-w-3xl w-full space-y-4">
          {[
            { step: '1', title: 'Установи Расширение (Обязательно)', desc: 'Без него мы считывать музыку не умеем. Расширение зацепит плеер во вкладке в фоне.' },
            { step: '2', title: 'Врубай Музыку и Слушай', desc: 'Плееру нужна буквально 1 секунда, чтобы расширение поняло, что трек запустился. Оно следит мгновенно.' },
            { step: '3', title: 'Смотри Стату. Молимся на базу данных', desc: 'Каждая сессия сохраняется. Если база не занята — она появится в профиле за пару секунд.' }
          ].map((item, idx) => (
            <div key={idx} className="bg-[#121212]/60 p-5 rounded-2xl border border-white/5 flex items-center gap-4 hover:bg-black/40 transition-colors shadow-md">
              <div className="w-12 h-12 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] font-black text-xl rounded-xl flex items-center justify-center shadow-lg shrink-0">
                {item.step}
              </div>
              <div>
                <h4 className="font-bold text-white text-base">{item.title}</h4>
                <p className="text-gray-400 text-xs">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FOOTER CTA */}
      <div className="w-full bg-[#121212]/80 border border-white/5 rounded-3xl p-12 text-center relative overflow-hidden backdrop-blur-md mb-20">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[var(--accent)]/10 via-transparent to-transparent z-0"></div>
        <div className="relative z-10 flex flex-col items-center">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Готов увидеть свою музыку?</h2>
          <p className="text-gray-400 mb-8 max-w-sm">Регистрация займет 10 секунд. Треки полетят в базу (если расширение на месте).</p>
          <Link href={username ? `/user/${username}` : "/auth"} className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] font-black px-8 py-4 rounded-xl hover:scale-105 transition-all shadow-[0_0_20px_var(--accent-glow-strong)] text-lg">
            {username ? 'В мой профиль' : 'Создать мой профиль'}
          </Link>
        </div>
      </div>

    </div>
  );
}
