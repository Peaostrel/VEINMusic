"use client";
import { useT } from "@/app/lib/i18n/client";
import { currentLocale, tr } from "@/app/lib/i18n/active";

import { useCallback, useEffect, useState } from "react";
import EmailSettings from "../components/EmailSettings";
import BrowserSessions from "../components/BrowserSessions";
import TwoFactorAuth from "../components/TwoFactorAuth";
import VkIdSettings from "../components/VkIdSettings";
import StatusText from "@/components/StatusText";
import { ApiError, apiFetch, apiJson } from "@/app/lib/api";
import {
  currentSubscription,
  disablePush,
  enablePush,
  getPushConfig,
  isPushSupported,
} from "@/app/lib/push";
import type { DeveloperApiKey } from "@/app/lib/types";

const card = "flex flex-col gap-4 rounded-xl border border-line bg-surface p-6";
const buttonBase =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

function errorText(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message;
  return tr("Ошибка сети");
}

function formatDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleString(currentLocale())
    : tr("никогда");
}

/** Sessions, push notifications, connected devices and account data. */
export default function SecurityTab() {
  const t = useT();
  const [message, setMessage] = useState("");

  // --- push notifications ---
  const [pushAvailable, setPushAvailable] = useState<boolean | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // --- connected devices (keys issued by device pairing) ---
  const [devices, setDevices] = useState<DeveloperApiKey[]>([]);

  // --- account deletion ---
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteOtp, setDeleteOtp] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadDevices = useCallback(async () => {
    try {
      const keys = await apiJson<DeveloperApiKey[]>("/api/developer/keys");
      setDevices(keys.filter((k) => k.name.startsWith("Устройство:")));
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isPushSupported()) {
        if (!cancelled) setPushAvailable(false);
        return;
      }
      try {
        const [config, subscription] = await Promise.all([
          getPushConfig(),
          currentSubscription(),
        ]);
        if (cancelled) return;
        setPushAvailable(config.enabled);
        setPushEnabled(Boolean(subscription));
      } catch {
        if (!cancelled) setPushAvailable(false);
      }
    })();
    void loadDevices();
    return () => {
      cancelled = true;
    };
  }, [loadDevices]);

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await disablePush();
        setPushEnabled(false);
        setMessage(t("✅ Уведомления отключены"));
      } else {
        await enablePush();
        setPushEnabled(true);
        setMessage(t("✅ Уведомления включены"));
      }
    } catch (e) {
      setMessage(`❌ ${errorText(e)}`);
    } finally {
      setPushBusy(false);
    }
  };

  const sendTestPush = async () => {
    try {
      const res = await apiJson<{ delivered_count: number }>(
        "/api/push/send-test",
        { method: "POST" },
      );
      setMessage(
        res.delivered_count > 0
          ? t("✅ Тестовое уведомление отправлено")
          : t("⚠️ Не удалось доставить уведомление"),
      );
    } catch (e) {
      setMessage(`❌ ${errorText(e)}`);
    }
  };

  const revokeDevice = async (id: number) => {
    if (
      !confirm(
        t("Отключить это устройство? Ему понадобится новое подключение."),
      )
    )
      return;
    try {
      await apiJson(`/api/developer/keys/${id}`, { method: "DELETE" });
      await loadDevices();
      setMessage(t("✅ Устройство отключено"));
    } catch (e) {
      setMessage(`❌ ${errorText(e)}`);
    }
  };

  const logoutEverywhere = async () => {
    if (
      !confirm(
        t("Выйти на всех устройствах и браузерах? Вам придётся войти заново."),
      )
    )
      return;
    try {
      await apiJson("/auth/logout-all", { method: "POST" });
      localStorage.removeItem("username");
      globalThis.postMessage(
        { type: "VEIN_EXTENSION_LOGOUT" },
        globalThis.location.origin,
      );
      globalThis.location.replace("/auth");
    } catch (e) {
      setMessage(`❌ ${errorText(e)}`);
    }
  };

  const exportData = async () => {
    try {
      const res = await apiFetch("/api/account/export");
      if (!res.ok)
        throw new ApiError(res.status, t("Не удалось выгрузить данные"));
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] || "veinmusic-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage(`❌ ${errorText(e)}`);
    }
  };

  const deleteAccount = async () => {
    setDeleteBusy(true);
    try {
      await apiJson("/api/account", {
        method: "DELETE",
        json: { password: deletePassword, otp_code: deleteOtp || null },
      });
      localStorage.removeItem("username");
      globalThis.postMessage(
        { type: "VEIN_EXTENSION_LOGOUT" },
        globalThis.location.origin,
      );
      globalThis.location.replace("/");
    } catch (e) {
      setMessage(`❌ ${errorText(e)}`);
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-fg">
        {t("Безопасность и данные")}
      </h2>
      <EmailSettings />
      {message && <StatusText text={message} />}

      <TwoFactorAuth />
      <VkIdSettings />
      <BrowserSessions />

      <section className={card}>
        <div>
          <p className="font-medium text-fg">{t("Активные сеансы")}</p>
          <p className="text-xs text-fg-2">
            {t(
              "Завершить вход во всех браузерах, включая этот. API-ключи и подключённые устройства продолжат работать.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={logoutEverywhere}
          className={`${buttonBase} self-start bg-surface-2 border border-line text-fg hover:bg-line`}
        >
          {t("Выйти со всех устройств")}
        </button>
      </section>

      <section className={card}>
        <div>
          <p className="font-medium text-fg">{t("Push-уведомления")}</p>
          <p className="text-xs text-fg-2">
            {t("Уведомления о новых достижениях в этом браузере.")}
          </p>
        </div>
        {pushAvailable === false ? (
          <p className="text-xs text-fg-2">
            {t(
              "Недоступно: браузер не поддерживает push или уведомления не настроены на сервере.",
            )}
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={togglePush}
              disabled={pushBusy || pushAvailable === null}
              className={`${buttonBase} bg-accent text-on-accent hover:opacity-90`}
            >
              {pushEnabled
                ? t("Отключить уведомления")
                : t("Включить уведомления")}
            </button>
            {pushEnabled && (
              <button
                type="button"
                onClick={sendTestPush}
                className={`${buttonBase} bg-surface-2 border border-line text-fg hover:bg-line`}
              >
                {t("Отправить тестовое")}
              </button>
            )}
          </div>
        )}
      </section>

      <section className={card}>
        <div>
          <p className="font-medium text-fg">{t("Подключённые устройства")}</p>
          <p className="text-xs text-fg-2">
            {t("Браузерные расширения, подключённые через код на странице")}{" "}
            <a href="/link" className="text-accent underline">
              /link
            </a>
            <span>{t(". У каждого свой ключ, его можно отозвать.")}</span>
          </p>
        </div>
        {devices.length === 0 ? (
          <p className="text-xs text-fg-2">
            {t("Нет подключённых устройств.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 bg-bg border border-line-soft rounded-lg p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-fg font-medium truncate">
                    {t("Устройство: {client}", {
                      client: d.name.replace(/^Устройство:\s*/, ""),
                    })}
                  </p>
                  <p className="text-xs text-fg-2">
                    {t("Подключено {created} · последняя активность {used}", {
                      created: formatDate(d.created_at),
                      used: formatDate(d.last_used_at),
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revokeDevice(d.id)}
                  className={`${buttonBase} shrink-0 text-danger border border-danger-line`}
                >
                  {t("Отключить")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <div>
          <p className="font-medium text-fg">{t("Мои данные")}</p>
          <p className="text-xs text-fg-2">
            {t(
              "Скачать профиль, историю прослушиваний, подписки, комментарии и достижения одним JSON-файлом.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={exportData}
          className={`${buttonBase} self-start bg-surface-2 border border-line text-fg hover:bg-line`}
        >
          {t("Скачать мои данные")}
        </button>
      </section>

      <section className={`${card} border-danger-line`}>
        <div>
          <p className="font-medium text-danger">{t("Удаление аккаунта")}</p>
          <p className="text-xs text-fg-2">
            {t(
              "Аккаунт, история, подписки, ключи и настройки будут удалены безвозвратно.",
            )}
          </p>
        </div>
        {deleteOpen ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder={t("Пароль для подтверждения")}
              autoComplete="current-password"
              aria-label={t("Пароль для подтверждения удаления")}
              className="h-10 min-w-0 flex-grow rounded-lg border border-line bg-bg px-3 text-sm text-fg outline-none focus:border-fg-3"
            />
            <input
              value={deleteOtp}
              onChange={(e) => setDeleteOtp(e.target.value)}
              placeholder={t("Код 2FA, если включена")}
              autoComplete="one-time-code"
              maxLength={64}
              aria-label={t("Код двухфакторной защиты для удаления")}
              className="h-10 min-w-0 rounded-lg border border-line bg-bg px-3 text-sm text-fg outline-none focus:border-fg-3 sm:w-44"
            />
            <button
              type="button"
              onClick={deleteAccount}
              disabled={!deletePassword || deleteBusy}
              className={`${buttonBase} border border-danger-line text-danger hover:bg-[#2a1b1b]`}
            >
              {t("Удалить навсегда")}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteOpen(false);
                setDeletePassword("");
                setDeleteOtp("");
              }}
              className={`${buttonBase} bg-surface-2 text-fg-2`}
            >
              {t("Отмена")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className={`${buttonBase} self-start text-danger border border-danger-line`}
          >
            {t("Удалить аккаунт")}
          </button>
        )}
      </section>
    </div>
  );
}
