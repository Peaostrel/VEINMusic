'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState('form'); 
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasExtension, setHasExtension] = useState(false);
  const router = useRouter();

  // 1. Автоматически кидаем залогиненного юзера на экран проверки
  useEffect(() => {
    const storedUser = localStorage.getItem('username');
    const storedKey = localStorage.getItem('apiKey');
    if (storedUser && storedKey) {
      setUsername(storedUser);
      setApiKey(storedKey);
      setStep('success');
    }
  }, []);

  // 2. Мониторим расширение
  useEffect(() => {
    if (step === 'success') {
      const checkExt = () => {
        if (document.documentElement.getAttribute('data-vein-extension') === 'installed') {
          setHasExtension(true);
        } else {
          setHasExtension(false);
        }
      };
      checkExt();
      const interval = setInterval(checkExt, 1000);
      return () => clearInterval(interval);
    }
  }, [step]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/auth/login' : '/auth/register';

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Ошибка. Проверь данные.');
        setLoading(false);
        return;
      }

      localStorage.setItem('username', data.username);
      localStorage.setItem('apiKey', data.api_key);
      window.dispatchEvent(new Event('themeChanged'));

      setApiKey(data.api_key);
      setStep('success');
      
    } catch (err) {
      setError('Ошибка сети. Бэкенд не отвечает.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <main className="w-full max-w-md">
        {step === 'form' ? (
          <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-50"></div>
            
            <h1 className="text-3xl font-black text-white text-center mb-2 tracking-tight">
              {isLogin ? 'С ВОЗВРАЩЕНИЕМ' : 'НОВАЯ КРОВЬ'}
            </h1>
            <p className="text-gray-400 text-center text-sm mb-8 font-medium">
              {isLogin ? 'Введи свои данные для входа в систему' : 'Зарегистрируйся, чтобы начать отслеживать музыку'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Логин</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--accent)] transition-colors"
                  placeholder="tvoibro"
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Пароль</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--accent)] transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm font-bold text-center">
                  {error}
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-[var(--accent)] text-[#121212] font-black py-4 rounded-xl hover:scale-[1.02] transition-transform shadow-[0_0_15px_var(--accent-glow)] disabled:opacity-50 disabled:hover:scale-100 mt-4 text-lg"
              >
                {loading ? 'ПОДОЖДИ...' : (isLogin ? 'ВОЙТИ' : 'СОЗДАТЬ АККАУНТ')}
              </button>
            </form>

            <div className="mt-8 text-center">
              <button 
                onClick={() => { setIsLogin(!isLogin); setError(''); }}
                className="text-sm text-gray-400 hover:text-white transition-colors font-medium"
              >
                {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-8 shadow-2xl text-center">
            <h2 className="text-2xl font-black text-white mb-2">ПРОВЕРКА СВЯЗИ</h2>
            <p className="text-gray-400 text-sm mb-6">Твой личный API ключ для работы:</p>
            
            <div className="bg-[#121212] border border-white/10 text-[var(--accent)] font-mono text-sm p-4 rounded-xl mb-6 select-all overflow-x-auto shadow-inner">
              {apiKey}
            </div>
            
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 mb-8 flex items-center justify-center gap-3">
              <span className="text-2xl">⚡</span>
              <span className="text-green-400 font-bold">Система готова к работе!</span>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => window.location.href = `/user/${username}`}
                className="w-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[#121212] font-black py-4 rounded-xl transition-all text-lg shadow-[0_0_20px_var(--accent-glow)] hover:scale-[1.02]"
              >
                ВОЙТИ В СИСТЕМУ
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
