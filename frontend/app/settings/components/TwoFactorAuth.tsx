"use client";
import { useEffect, useState } from "react";
import { apiJson } from "@/app/lib/api";

function chooseAction(
  hasSecret: boolean,
  enabled: boolean,
): "setup" | "enable" | "disable" {
  if (hasSecret) return "enable";
  return enabled ? "disable" : "setup";
}

export default function TwoFactorAuth() {
  const [status, setStatus] = useState<{
    enabled: boolean;
    required: boolean;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    void apiJson<{ enabled: boolean; required: boolean }>("/auth/2fa/status")
      .then((value) => {
        if (!cancelled) setStatus(value);
      })
      .catch(() => {
        if (!cancelled) setMessage("Не удалось проверить двухфакторную защиту");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function submit(action: "setup" | "enable" | "disable") {
    setBusy(true);
    setMessage("");
    try {
      const json: { password?: string; code?: string } = {};
      if (action !== "enable") json.password = password;
      if (action !== "setup") json.code = code;
      const result = await apiJson<{
        secret?: string;
        recovery_codes?: string[];
      }>(`/auth/2fa/${action}`, {
        method: "POST",
        json,
      });
      setPassword("");
      setCode("");
      if (action === "setup") setSecret(result.secret ?? "");
      else {
        setSecret("");
        setStatus((value) =>
          value ? { ...value, enabled: action === "enable" } : value,
        );
        setRecoveryCodes(result.recovery_codes ?? []);
        setMessage(
          action === "enable"
            ? "Защита включена. Остальные сеансы завершены."
            : "Защита отключена. Остальные сеансы завершены.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось изменить защиту",
      );
    } finally {
      setBusy(false);
    }
  }
  function downloadCodes() {
    const url = URL.createObjectURL(
      new Blob(
        [
          `VEINMusic — одноразовые резервные коды\n\n${recoveryCodes.join("\n")}\n`,
        ],
        { type: "text/plain;charset=utf-8" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "veinmusic-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }
  const input = "h-10 rounded-lg border border-line bg-bg px-3 text-sm text-fg";
  const button =
    "self-start rounded-lg bg-accent px-4 py-2 text-sm text-on-accent disabled:opacity-50";
  const action = chooseAction(Boolean(secret), Boolean(status?.enabled));
  const labels = { setup: "Настроить защиту", enable: "Подтвердить и включить", disable: "Отключить защиту" };
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
      <div>
        <h3 className="font-medium text-fg">Двухфакторная защита</h3>
        <p className="text-xs text-fg-2">
          Код из Google Authenticator, Aegis или другого приложения при входе.{" "}
          {status?.required && "Для администратора обязательна."}
        </p>
      </div>
      {message && (
        <p role="status" className="text-sm text-fg-2">
          {message}
        </p>
      )}
      {status && (
        <p className="text-sm text-fg">
          {status.enabled ? "Включена" : "Не включена"}
        </p>
      )}
      {secret && (
        <div className="space-y-2 text-sm text-fg-2">
          <p>
            Добавьте аккаунт VEINMusic в приложение: введите ключ вручную и
            выберите коды по времени. Затем введите шестизначный код. Ключ
            действителен 10 минут.
          </p>
          <code className="block break-all select-all rounded-lg bg-bg p-3 text-fg">
            {secret}
          </code>
        </div>
      )}
      {status && (!status.enabled || !status.required) && (
        <div className="flex flex-col gap-3">
          {!secret && (
            <input
              aria-label="Пароль для двухфакторной защиты"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Текущий пароль"
              className={input}
            />
          )}
          {(secret || status.enabled) && (
            <input
              aria-label="Код двухфакторной защиты"
              autoComplete="one-time-code"
              maxLength={64}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={
                secret
                  ? "Код из приложения"
                  : "Код из приложения или резервный код"
              }
              className={input}
            />
          )}
          <button
            type="button"
            disabled={
              busy ||
              (secret
                ? code.length !== 6
                : !password || (status.enabled && !code))
            }
            onClick={() => {
              void submit(action);
            }}
            className={button}
          >
            {labels[action]}
          </button>
        </div>
      )}
      {recoveryCodes.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-fg-2">
            Сохраните резервные коды вне этого устройства. Каждый работает один
            раз вместо кода из приложения. Повторно показать их нельзя.
          </p>
          <pre className="overflow-auto rounded-lg bg-bg p-3 text-xs text-fg">
            {recoveryCodes.join("\n")}
          </pre>
          <button type="button" onClick={downloadCodes} className={button}>
            Скачать резервные коды
          </button>
        </div>
      )}
    </section>
  );
}
