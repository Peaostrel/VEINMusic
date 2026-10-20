"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiJson } from "@/app/lib/api";
import { useT } from "@/app/lib/i18n/client";
import { btn, input, label } from "@/components/ui";
export default function EmailAction({
  mode,
}: Readonly<{ mode: "verify" | "reset" | "forgot" }>) {
  const t = useT();
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
      const json = {
        forgot: { email },
        verify: { token },
        reset: { token, password, otp_code: otp || null },
      }[mode];
      const result = await apiJson<{ message: string }>(path, {
        method: "POST",
        json,
      });
      setMessage(t(result.message));
      setDone(true);
      setToken("");
      setPassword("");
      setOtp("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("Ошибка сети"));
    } finally {
      setBusy(false);
    }
  }
  const title = {
    verify: t("Подтверждение почты"),
    reset: t("Новый пароль"),
    forgot: t("Восстановление пароля"),
  }[mode];
  const submitLabel = {
    verify: t("Подтвердить"),
    forgot: t("Получить письмо"),
    reset: t("Сохранить пароль"),
  }[mode];
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
                {t("Введите почту, которую вы подтвердили в настройках VEIN.")}
              </p>
              <label className={label}>
                <span>{t("Почта")}</span>
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
              {t("Нажмите кнопку, чтобы подтвердить адрес почты.")}
            </p>
          )}
          {mode === "reset" && (
            <>
              <label className={label}>
                <span>{t("Новый пароль")}</span>
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
                <span>{t("Код 2FA, если защита включена")}</span>
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
              {t(
                "Откройте полную ссылку из письма. Если она устарела, запросите новую.",
              )}
            </p>
          )}
          <button
            type="submit"
            className={`${btn.primary} ${btn.md}`}
            disabled={busy || (mode !== "forgot" && !token)}
          >
            {submitLabel}
          </button>
        </form>
      )}
      {message && <output className="text-sm">{message}</output>}
      <Link
        className="text-sm text-accent"
        href={mode === "verify" ? "/settings?tab=security" : "/auth"}
      >
        {mode === "verify" ? t("К настройкам") : t("Ко входу")}
      </Link>
    </div>
  );
}
