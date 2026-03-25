'use client';
import Link from 'next/link';

export default function Privacy() {
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 pt-24 min-h-screen text-white pb-32">
       <div className="mb-12">
          <h1 className="text-5xl font-black text-white mb-4 drop-shadow-xl tracking-tight">Политика конфиденциальности</h1>
          <p className="text-gray-400">VEIN Music заботится о твоих данных. Вот как они используются.</p>
       </div>
       <div className="bg-[#121212]/60 backdrop-blur-md p-6 md:p-8 rounded-2xl border border-white/5 shadow-2xl space-y-8 text-sm text-gray-300 leading-relaxed">
          <section>
             <h2 className="text-xl font-bold text-white mb-3">1. Какие данные мы собираем</h2>
             <p>Мы собираем только ту информацию, которая необходима для работы мониторинга музыки:</p>
             <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Твой логин и отображаемое имя в системе.</li>
                <li>История прослушиваний (треки, артисты, время).</li>
                <li>API-ключ/токены подключения к внешним плеерам (Spotify/Яндекс), необходимые для считывания истории.</li>
             </ul>
          </section>
          
          <section>
             <h2 className="text-xl font-bold text-white mb-3">2. Использование и защита данных</h2>
             <p>Все собранные данные используются исключительно для построения твоей личной статистики и отображения в ленте. Мы **не передаем** и не продаем данные третьим лицам.</p>
          </section>

          <section>
             <h2 className="text-xl font-bold text-white mb-3">3. Хранение и Удаление</h2>
             <p>Данные хранятся на наших защищенных серверах. Если ты захочешь полностью удалить свой профиль и всю историю прослушиваний, ты можешь сделать это в настройках профиля или обратившись к администратору.</p>
          </section>

          <div className="pt-6 border-t border-white/5 text-xs text-gray-500">
             Последнее обновление: {new Date().toLocaleDateString('ru-RU')}
          </div>
       </div>
    </div>
  );
}
