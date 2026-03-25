'use client';
import Link from 'next/link';

export default function Terms() {
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 pt-24 min-h-screen text-white pb-32">
       <div className="mb-12">
          <h1 className="text-5xl font-black text-white mb-4 drop-shadow-xl tracking-tight">Условия использования</h1>
          <p className="text-gray-400">Правила и отказ от ответственности при использовании VEIN Music.</p>
       </div>
       <div className="bg-[#121212]/60 backdrop-blur-md p-6 md:p-8 rounded-2xl border border-white/5 shadow-2xl space-y-8 text-sm text-gray-300 leading-relaxed">
          <section>
             <h2 className="text-xl font-bold text-white mb-3">1. Статус проекта</h2>
             <p>VEIN Music является независимым любительским проектом. Мы не связаны напрямую с компаниями Spotify, Yandex или другими музыкальными сервисами. Инструмент предоставляется «как есть» (As Is) без гарантии 100% времени непрерывной работы.</p>
          </section>

          <section>
             <h2 className="text-xl font-bold text-white mb-3">2. Правила поведения</h2>
             <p>При использовании API и расширений VEIN Music запрещено:</p>
             <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Спамить ложными данными (накручивать прослушивания).</li>
                <li>Пытаться взломать бэкенд или дестабилизировать работу серверов.</li>
                <li>Использовать баги системы в корыстных целях.</li>
             </ul>
          </section>

          <section>
             <h2 className="text-xl font-bold text-white mb-3">3. Ответственность</h2>
             <p>Запуская этот инструмент и привязывая свои аккаунты, ты берешь на себя ответственность за стабильный доступ к твоим плеерам. Мы не несем ответственности за возможные ограничения со стороны официальных клиентов Spotify / Яндекса.</p>
          </section>

          <div className="pt-6 border-t border-white/5 text-xs text-gray-500">
             Последнее обновление: {new Date().toLocaleDateString('ru-RU')}
          </div>
       </div>
    </div>
  );
}
