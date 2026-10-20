"use client";
import { useEffect, useState } from "react";
import { apiJson } from "@/app/lib/api";
import { AccountUsername } from "@/components/autofill";
import { btn, input, label } from "@/components/ui";
import { useT } from "@/app/lib/i18n/client";

type Settings = {
  configured: boolean;
  email: string | null;
  pending_email: string | null;
  security_alerts: boolean;
  messages_enabled: boolean;
};
export default function EmailSettings() {
  const t = useT();
  const [data, setData] = useState<Settings | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setData(await apiJson<Settings>("/api/account/email"));
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  async function act(method: string, json: unknown) {
    setBusy(true);
    try {
      const result = await apiJson<{ message: string }>("/api/account/email", {
        method,
        json,
      });
      setMessage(t(result.message));
      setPassword("");
      setOtp("");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("Ошибка сети"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
      <h3 className="font-semibold">{t("Почта и письма")}</h3>
      {!data && !message && <p>{t("Загружаем…")}</p>}
      {data && (
        <>
          <p className="text-sm text-fg-2">
            {data.email
              ? t("Подтверждённый адрес: {email}", { email: data.email })
              : t(
                  "Привяжите почту для восстановления пароля и предупреждений о новых входах.",
                )}
          </p>
          {!data.configured && (
            <p className="text-sm text-fg-2">
              {t("Отправка писем пока не подключена.")}
            </p>
          )}
          {data.pending_email && (
            <p className="text-sm">
              {t("Ждём подтверждения: {email}", { email: data.pending_email })}
            </p>
          )}
          {data.email && (
            <div className="space-y-2">
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={data.security_alerts}
                  disabled={busy}
                  onChange={(e) =>
                    void act("PATCH", {
                      security_alerts: e.target.checked,
                      messages_enabled: data.messages_enabled,
                    })
                  }
                />
                <span>{t("Предупреждать о входах с новых устройств")}</span>
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={data.messages_enabled}
                  disabled={busy}
                  onChange={(e) =>
                    void act("PATCH", {
                      security_alerts: data.security_alerts,
                      messages_enabled: e.target.checked,
                    })
                  }
                />
                <span>{t("Получать письма от администрации VEIN")}</span>
              </label>
            </div>
          )}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void act("POST", { email, password, otp_code: otp || null });
            }}
          >
            <AccountUsername />
            <label className={label}>
              <span>{t("Адрес почты")}</span>
              <input
                className={`${input} mt-1`}
                type="email"
                name="email"
                inputMode="email"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                autoComplete="email"
              />
            </label>
            <label className={label}>
              <span>{t("Текущий пароль")}</span>
              <input
                className={`${input} mt-1`}
                type="password"
                name="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <label className={label}>
              <span>{t("Код 2FA, если защита включена")}</span>
              <input
                className={`${input} mt-1`}
                name="one-time-code"
                spellCheck={false}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={64}
                autoComplete="one-time-code"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className={`${btn.primary} ${btn.md}`}
                disabled={busy || !data.configured}
              >
                {t("Отправить подтверждение")}
              </button>
              {(data.email || data.pending_email) && (
                <button
                  type="button"
                  className={`${btn.secondary} ${btn.md}`}
                  disabled={busy || !password}
                  onClick={() => {
                    if (
                      confirm(
                        t(
                          "Отвязать почту? Восстановление пароля по ней станет недоступно.",
                        ),
                      )
                    )
                      void act("DELETE", { password, otp_code: otp || null });
                  }}
                >
                  {t("Отвязать")}
                </button>
              )}
            </div>
          </form>
        </>
      )}
      {message && <output className="text-sm">{message}</output>}
    </section>
  );
}
