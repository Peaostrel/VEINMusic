"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Radio,
  Sparkles,
  Trophy,
  Zap,
  ArrowRight,
} from "lucide-react";

export default function About() {
  const [stats, setStats] = useState({
    total_users: 0,
    total_scrobbles: 0,
    total_tracks: 0,
    online: 0,
  });
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    setUsername(localStorage.getItem("username"));

    fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/public-stats`,
      { credentials: "include" },
    )
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 pt-10 pb-24 relative flex flex-col items-center">
      {/* Ambient Lighting */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[var(--accent)]/15 rounded-full blur-[140px] pointer-events-none" />

      {/* HERO Section */}
      <div className="text-center py-16 md:py-24 relative z-10 w-full flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-xs font-semibold text-gray-300 mb-6 tracking-wide backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
          Новое поколение музыкального скробблинга
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold text-white tracking-tight mb-6 leading-[1.1] max-w-4xl">
          Твоя музыка. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] via-rose-400 to-amber-400">
            Единая история и статус.
          </span>
        </h1>

        <p className="text-gray-400 text-sm sm:text-lg max-w-2xl mx-auto mb-10 font-normal leading-relaxed">
          VEIN Music бесшовно объединяет прослушивания из Яндекс Музыки,
          Spotify, VK, десктопных плееров и браузеров в единый интерактивный
          профиль с детальной аналитикой и синхронным прослушиванием.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <Link
            href={username ? `/user/${username}` : "/auth"}
            className="w-full sm:w-auto bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-white font-bold px-8 py-3.5 rounded-2xl hover:scale-105 transition-all shadow-[0_0_30px_var(--accent-glow)] text-sm sm:text-base flex items-center justify-center gap-2"
          >
            {username ? "Перейти в мой профиль" : "Начать слушать"}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#features"
            className="w-full sm:w-auto bg-white/[0.05] border border-white/10 text-gray-300 hover:text-white font-bold px-8 py-3.5 rounded-2xl hover:bg-white/10 transition-all text-sm sm:text-base flex items-center justify-center"
          >
            Возможности платформы
          </a>
        </div>
      </div>

      {/* STATS Section */}
      <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4 mb-24 relative z-10">
        {[
          {
            label: "Заскробблено треков",
            value: (stats?.total_scrobbles || 0).toLocaleString(),
            icon: "🎵",
          },
          {
            label: "Треков в каталоге",
            value: (stats?.total_tracks || 0).toLocaleString(),
            icon: "💿",
          },
          {
            label: "Слушателей",
            value: (stats?.total_users || 0).toLocaleString(),
            icon: "👥",
          },
          {
            label: "Онлайн сейчас",
            value: (stats?.online || 0).toLocaleString(),
            icon: "🔥",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="glass-card p-6 rounded-3xl text-center flex flex-col items-center justify-center"
          >
            <div className="text-2xl mb-2">{item.icon}</div>
            <p className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-1">
              {item.value}
            </p>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
              {item.label}
            </p>
          </div>
        ))}
      </div>

      {/* FEATURES Section */}
      <div id="features" className="w-full mb-28 relative z-10">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
            Всё, что нужно настоящему меломану
          </h2>
          <p className="text-gray-400 text-xs sm:text-sm max-w-lg mx-auto">
            Мощные инструменты сбора статистики, геймификации и социального
            взаимодействия.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: <Zap className="w-6 h-6 text-amber-400" />,
              title: "Мультиплатформенный сбор",
              desc: "Браузерное расширение с оффлайн-буферизацией и нативный десктопный клиент с поддержкой Windows SMTC, Linux MPRIS и Discord RPC.",
            },
            {
              icon: <Radio className="w-6 h-6 text-rose-400" />,
              title: "Слушать вместе (Together)",
              desc: "Создавай синхронные музыкальные комнаты в реальном времени, становись DJ для друзей и делись треками в живом чате.",
            },
            {
              icon: <Trophy className="w-6 h-6 text-emerald-400" />,
              title: "RPG-геймификация и рамки",
              desc: "Зарабатывай XP за прослушивания, открывай эксклюзивные анимированные рамки профиля и уникальные достижения.",
            },
          ].map((feat) => (
            <div
              key={feat.title}
              className="glass-card p-8 rounded-3xl flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center mb-6">
                  {feat.icon}
                </div>
                <h3 className="text-lg font-bold text-white mb-3">
                  {feat.title}
                </h3>
                <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
                  {feat.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Footer */}
      <div className="w-full relative rounded-3xl bg-gradient-to-b from-[#141724] to-[#0d0f17] border border-white/[0.08] p-8 md:p-14 text-center overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[var(--accent)]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center">
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
            Готов собрать всю свою музыку воедино?
          </h2>
          <p className="text-gray-400 text-xs sm:text-sm mb-8 max-w-md">
            Присоединяйся к сообществу VEIN Music. Быстрая регистрация и
            моментальный старт скроблинга.
          </p>
          <Link
            href={username ? `/user/${username}` : "/auth"}
            className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-white font-bold px-8 py-3.5 rounded-2xl hover:scale-105 transition-all shadow-[0_0_25px_var(--accent-glow)] text-sm sm:text-base flex items-center gap-2"
          >
            {username ? "В мой профиль" : "Создать аккаунт бесплатно"}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
