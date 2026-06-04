'use client';
import { useState, useEffect } from 'react';
import { fixImageUrl } from '../utils';

export default function GeneralTab({ data, updateData, countries, cities, isCityInputFocused, setIsCityInputFocused, onSelectFile }: any) {
  return (
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
                  {countries.map((c: any) => <option key={c.code} value={c.name}>{c.flag} {c.name}</option>)}
              </select>
          </div>
          <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">Город</label>
              <div className="relative">
                  <input value={data.city} onChange={e=>updateData('city', e.target.value)} onFocus={() => setIsCityInputFocused(true)} onBlur={() => setTimeout(() => setIsCityInputFocused(false), 200)} placeholder="Введите название..." className="w-full p-3 rounded bg-[#282828]/50 border border-white/10 focus:border-[var(--accent)] text-white focus:outline-none" />
                  {isCityInputFocused && cities.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-[#121212] border border-[var(--accent)]/50 rounded-lg mt-1 z-[100] max-h-60 overflow-y-auto shadow-2xl">
                          {cities.map((c: any) => <div key={c} onClick={() => { updateData('city', c); setIsCityInputFocused(false); }} className="p-4 hover:bg-[var(--accent)] hover:text-white cursor-pointer text-sm border-b border-white/5 last:border-none transition-all">{c}</div>)}
                      </div>
                  )}
              </div>
          </div>
      </div>
      <div><label className="block text-sm font-bold text-gray-300 mb-2">О себе</label><textarea value={data.bio} onChange={e=>updateData('bio', e.target.value)} rows={3} className="w-full p-3 rounded bg-[#282828]/50 border border-white/10 focus:border-[var(--accent)] text-white focus:outline-none resize-none transition-colors"></textarea></div>
    </div>
  );
}
