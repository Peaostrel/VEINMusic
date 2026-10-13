"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiJson } from "@/app/lib/api";
import { btn, input, label } from "@/components/ui";
export default function EmailAction({
  mode,
}: Readonly<{ mode: "verify" | "reset" | "forgot" }>) {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const value = globalThis.location.hash.slice(1);
    if (value) setToken(value);
    globalThis.history.replaceState(null, "", globalThis.location.pathname);
  }, []);
  async function submit() {
    setBusy(true);
    try {
      const path =
        mode === "verify" ? "/auth/email/verify" : `/auth/password/${mode}`;
      const json =
        mode === "forgot"
          ? { email }
          : mode === "verify"
            ? { token }
            : { token, password, otp_code: otp || null };
      const result = await apiJson<{ message: string }>(path, {
        method: "POST",
        json,
      });
      setMessage(result.message);
      setDone(true);
      setToken("");
      setPassword("");
      setOtp("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setBusy(false);
    }
  }
  const title =
    mode === "verify"
      ? "Подтверждение почты"
      : mode === "reset"
        ? "Новый пароль"
        : "Восстановление пароля";
  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-16">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {!done && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "forgot" && (
            <>
              <p className="text-sm text-fg-2">
                Введите почту, которую вы подтвердили в настройках VEIN.
              </p>
              <label className={label}>
                Почта
                <input
                  className={`${input} mt-1`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>
            </>
          )}
          {mode === "verify" && (
            <p className="text-sm">
              Нажмите кнопку, чтобы подтвердить адрес почты.
            </p>
          )}
          {mode === "reset" && (
            <>
              <label className={label}>
                Новый пароль
                <input
                  className={`${input} mt-1`}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <label className={label}>
                Код 2FA, если защита включена
                <input
                  className={`${input} mt-1`}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={64}
                  autoComplete="one-time-code"
                />
              </label>
            </>
          )}
          {mode !== "forgot" && !token && (
            <p className="text-sm">
              Откройте полную ссылку из письма. Если она устарела, запросите
              новую.
            </p>
          )}
          <button
            className={`${btn.primary} ${btn.md}`}
            disabled={busy || (mode !== "forgot" && !token)}
          >
            {mode === "verify"
              ? "Подтвердить"
              : mode === "forgot"
                ? "Получить письмо"
                : "Сохранить пароль"}
          </button>
        </form>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <Link
        className="text-sm text-accent"
        href={mode === "verify" ? "/settings?tab=security" : "/auth"}
      >
        {mode === "verify" ? "К настройкам" : "Ко входу"}
      </Link>
    </div>
  );
}
