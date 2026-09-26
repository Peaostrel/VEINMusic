"use client";
import { useState, useEffect } from "react";
import { API_URL } from "@/app/lib/api";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState("form");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const storedUser = localStorage.getItem("username");
    if (storedUser) {
      setUsername(storedUser);
      setStep("success");
    }
  }, []);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = isLogin ? "/auth/login" : "/auth/register";

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Ошибка. Проверь данные.");
        setLoading(false);
        return;
      }

      localStorage.setItem("username", data.username);
      globalThis.dispatchEvent(new Event("themeChanged"));

      // The raw API key is only returned once, on registration (the server
      // stores just a hash). Hand it to the browser extension directly
      // instead of persisting it in localStorage.
      if (data.api_key) {
        setApiKey(data.api_key);
        globalThis.postMessage(
          {
            type: "VEIN_EXTENSION_SYNC_KEYS",
            username: data.username,
            apiKey: data.api_key,
          },
          globalThis.location.origin,
        );
      }

      setStep("success");
    } catch (err) {
      console.error(err);
      setError("Ошибка сети. Бэкенд не отвечает.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <main className="w-full max-w-md">
        {step === "form" ? (
          <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-50"></div>

            <h1 className="text-3xl font-black text-white text-center mb-2 tracking-tight">
              {isLogin ? "С ВОЗВРАЩЕНИЕМ" : "НОВАЯ КРОВЬ"}
            </h1>
            <p className="text-gray-400 text-center text-sm mb-8 font-medium">
              {isLogin
                ? "Введи свои данные для входа в систему"
                : "Зарегистрируйся, чтобы начать отслеживать музыку"}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="auth-username"
                  className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2"
                >
                  Логин
                </label>
                <input
                  id="auth-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--accent)] transition-colors"
                  placeholder="tvoibro"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2"
                >
                  Пароль
                </label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--accent)] transition-colors"
                  placeholder="••••••••"
                  minLength={isLogin ? undefined : 8}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  required
                />
                {!isLogin && (
                  <p className="text-xs text-gray-400 mt-2">
                    Минимум 8 символов.
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm font-bold text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--accent)] text-[#121212] font-black py-4 rounded-xl hover:scale-[1.02] transition-transform shadow-[0_0_15px_var(--accent-glow)] disabled:opacity-50 disabled:hover:scale-100 mt-4 text-lg flex items-center justify-center gap-3"
              >
                {loading && (
                  <div className="animate-spin border-3 border-[#121212] border-t-transparent rounded-full w-5 h-5"></div>
                )}
                {(() => {
                  if (loading) return "ПОДОЖДИ...";
                  if (isLogin) return "ВОЙТИ";
                  return "СОЗДАТЬ АККАУНТ";
                })()}
              </button>
            </form>

            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError("");
                }}
                className="text-sm text-gray-400 hover:text-white transition-colors font-medium"
              >
                {isLogin
                  ? "Нет аккаунта? Зарегистрироваться"
                  : "Уже есть аккаунт? Войти"}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-8 shadow-2xl text-center">
            <h2 className="text-2xl font-black text-white mb-2">
              ПРОВЕРКА СВЯЗИ
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Твой личный API ключ для работы:
            </p>

            <div
              className="bg-[#121212] border border-white/10 font-mono text-sm p-4 rounded-xl mb-6 select-all overflow-x-auto shadow-inner"
              style={{ color: "var(--accent)" }}
            >
              {apiKey ||
                "Ключ показывается только один раз при создании. Новый ключ можно сгенерировать в настройках."}
            </div>

            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 mb-8 flex items-center justify-center gap-3">
              <span className="text-2xl">⚡</span>
              <span className="text-green-400 font-bold">
                Система готова к работе!
              </span>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  // Return to the page that sent the user here (e.g. /link)
                  const next = sessionStorage.getItem("vein_after_login");
                  sessionStorage.removeItem("vein_after_login");
                  if (next && next.startsWith("/") && !next.startsWith("//")) {
                    globalThis.location.href = next;
                    return;
                  }
                  const safeUsername = encodeURIComponent(username);
                  globalThis.location.href = `/user/${safeUsername}`;
                }}
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
