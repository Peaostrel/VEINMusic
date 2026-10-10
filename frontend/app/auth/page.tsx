"use client";
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { API_URL } from "@/app/lib/api";
import { useFeature } from "@/app/lib/featureFlags";
import { clearOfflineCache } from "@/app/lib/offline";
import { isValidUser } from "@/app/lib/theme";
import { Segmented, btn, input, label } from "@/components/ui";

type Mode = "login" | "register";

const nextSteps = [
  ["Подключите сервис", "Яндекс, Spotify или SoundCloud работают напрямую"],
  ["При необходимости — расширение", "Для YouTube Music, VK и веб-плееров"],
  ["Включите музыку", "Первые треки появятся в профиле автоматически"],
];

/** Page to open after signing in: the one that sent the user here, or the profile. */
function afterLoginUrl(username: string): string {
  const next = sessionStorage.getItem("vein_after_login");
  sessionStorage.removeItem("vein_after_login");
  if (next?.startsWith("/") && !next.startsWith("//")) return next;
  return `/user/${encodeURIComponent(username)}`;
}

function go(url: string) {
  // Full load: the shell re-reads the signed-in state from scratch
  globalThis.location.href = url;
}

function NextSteps() {
  return (
    <aside
      aria-label="Что дальше"
      className="flex w-full max-w-[380px] flex-col gap-4 border-line-soft md:w-[320px] md:border-l md:pl-10"
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">
        после входа
      </span>
      <ol className="flex flex-col gap-4">
        {nextSteps.map(([title, text], i) => (
          <li key={title} className="grid grid-cols-[28px_1fr] gap-2.5">
            <span
              className={`font-mono text-[13px] ${i === 0 ? "text-accent" : "text-fg-3"}`}
            >
              0{i + 1}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{title}</span>
              <span className="text-[13px] text-fg-2">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** Shown once after registration: the raw key is never returned again. */
function ApiKeyStep({
  apiKey,
  onDone,
}: Readonly<{ apiKey: string; onDone: () => void }>) {
  const [copied, setCopied] = useState(false);
  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section
      aria-labelledby="key-title"
      className="flex w-full max-w-[440px] flex-col gap-5"
    >
      <span className="inline-flex h-[26px] items-center gap-2 self-start rounded-full border border-line px-2.5 text-xs text-ok">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Аккаунт создан
      </span>
      <h1
        id="key-title"
        className="text-[26px] font-semibold tracking-[-0.02em]"
      >
        Ваш API-ключ
      </h1>
      <p className="text-sm leading-relaxed text-fg-2">
        Он нужен расширению и сторонним плеерам. Мы показываем его один раз —
        сохраните сейчас. Новый ключ можно выпустить в настройках, старый при
        этом перестанет работать.
      </p>
      <div className="flex gap-2">
        <code className="flex h-11 min-w-0 flex-1 items-center truncate rounded-lg border border-line bg-surface px-3.5 font-mono text-[13px] select-all">
          {apiKey}
        </code>
        <button
          type="button"
          onClick={copyKey}
          className={`${btn.secondary} h-11 px-4`}
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <button
        type="button"
        onClick={onDone}
        className={`${btn.primary} ${btn.lg}`}
      >
        Я сохранил, дальше
      </button>
    </section>
  );
}

export default function Auth() {
  const [mode, setMode] = useState<Mode>("login");
  const registrationOpen = useFeature("registration");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const isLogin = mode === "login";

  useEffect(() => {
    const stored = localStorage.getItem("username");
    if (isValidUser(stored)) {
      go("/");
      return;
    }
    const wanted = new URLSearchParams(globalThis.location.search).get("mode");
    if (wanted === "register") setMode("register");
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
        body: JSON.stringify({
          username,
          password,
          ...(isLogin ? { otp_code: otpCode || undefined } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.detail?.code === "mfa_required") {
          setMfaRequired(true);
          setError(data.detail.message);
        } else {
          setError(
            typeof data.detail === "string"
              ? data.detail
              : "Неверный логин или пароль.",
          );
        }
        setLoading(false);
        return;
      }
      localStorage.setItem("username", data.username);
      clearOfflineCache();
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
        setLoading(false);
        return;
      }
      go(afterLoginUrl(data.username));
    } catch (err) {
      console.error(err);
      setError("Сервер не отвечает. Попробуйте ещё раз.");
      setLoading(false);
    }
  };

  let submitLabel = isLogin ? "Войти" : "Создать аккаунт";
  if (loading) submitLabel = "Подождите…";

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col items-center gap-16 px-4 py-16 md:flex-row md:items-start md:justify-center md:gap-24 md:py-24">
      {apiKey ? (
        <ApiKeyStep
          apiKey={apiKey}
          onDone={() => go(afterLoginUrl(username))}
        />
      ) : (
        <form
          onSubmit={handleSubmit}
          aria-labelledby="auth-title"
          className="flex w-full max-w-[380px] flex-col gap-5"
        >
          {(registrationOpen || !isLogin) && (
            <Segmented
              label="Вход или регистрация"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError("");
              }}
              options={[
                { id: "login", label: "Вход" },
                { id: "register", label: "Регистрация" },
              ]}
            />
          )}
          <div className="flex flex-col gap-1.5">
            <h1
              id="auth-title"
              className="text-[26px] font-semibold tracking-[-0.02em]"
            >
              {isLogin ? "С возвращением" : "Новый профиль"}
            </h1>
            <p className="text-sm text-fg-2">
              {isLogin
                ? "Войдите, чтобы увидеть свою музыку."
                : "Регистрация занимает 10 секунд."}
            </p>
          </div>
          <div>
            <label htmlFor="auth-username" className={label}>
              Логин
            </label>
            <input
              id="auth-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`${input} h-11 font-mono`}
              placeholder="masha_l"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="auth-password" className={label}>
                Пароль
              </label>
              {!isLogin && (
                <span className="text-xs text-fg-3">минимум 8 символов</span>
              )}
            </div>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${input} h-11`}
              placeholder="••••••••"
              minLength={isLogin ? undefined : 8}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
            />
          </div>
          {isLogin && mfaRequired && (
            <div>
              <label htmlFor="auth-otp" className={label}>
                Код из приложения или резервный код
              </label>
              <input
                id="auth-otp"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                maxLength={64}
                autoComplete="one-time-code"
                className={`${input} h-11`}
                required
              />
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-danger-line px-3 py-2.5 text-[13px] text-danger"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className={`${btn.primary} ${btn.lg}`}
          >
            {submitLabel}
          </button>
          {!registrationOpen && isLogin && (
            <p className="text-[13px] text-fg-3">
              Регистрация новых аккаунтов временно закрыта.
            </p>
          )}
          <p className="text-[13px] text-fg-3">
            {isLogin ? "Действуют наши" : "Создавая аккаунт, вы принимаете"}{" "}
            <a href="/terms" className="text-fg-2 underline underline-offset-2">
              условия
            </a>{" "}
            и{" "}
            <a
              href="/privacy"
              className="text-fg-2 underline underline-offset-2"
            >
              политику конфиденциальности
            </a>
            {"."}
          </p>
        </form>
      )}

      <NextSteps />
    </div>
  );
}
