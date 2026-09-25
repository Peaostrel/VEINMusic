"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, apiJson } from "@/app/lib/api";
import type { DeviceCodeInfo } from "@/app/lib/types";

type Step = "enter" | "confirm" | "approved" | "denied" | "login";

function normalizeCode(code: string): string {
  const raw = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

function LinkDevice() {
  const params = useSearchParams();
  const [code, setCode] = useState(() =>
    normalizeCode(params.get("code") || ""),
  );
  const [info, setInfo] = useState<DeviceCodeInfo | null>(null);
  const [step, setStep] = useState<Step>("enter");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const lookup = async (value: string) => {
    setError("");
    setBusy(true);
    try {
      const found = await apiJson<DeviceCodeInfo>(
        `/api/devices/code/${encodeURIComponent(value)}`,
      );
      setInfo(found);
      setStep("confirm");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        sessionStorage.setItem(
          "vein_after_login",
          `/link?code=${encodeURIComponent(value)}`,
        );
        setStep("login");
      } else {
        setError(e instanceof Error ? e.message : "Ошибка сети");
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const initial = normalizeCode(params.get("code") || "");
    if (initial.length === 9) lookup(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = async (approve: boolean) => {
    if (!info) return;
    setBusy(true);
    try {
      await apiJson("/api/devices/approve", {
        method: "POST",
        json: { user_code: info.user_code, approve },
      });
      setStep(approve ? "approved" : "denied");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-12">
      <div className="w-full max-w-md bg-[#1a1a1a] border border-white/5 rounded-2xl p-8 shadow-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white">
            Подключение устройства
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Введите код, который показывает расширение VEIN Music.
          </p>
        </div>

        {step === "enter" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              lookup(normalizeCode(code));
            }}
            className="space-y-4"
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABCD-2345"
              aria-label="Код устройства"
              autoComplete="off"
              maxLength={12}
              className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-[0.3em] text-white uppercase focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={busy || normalizeCode(code).length !== 9}
              className="w-full bg-[var(--accent)] text-[var(--text-on-accent)] font-black py-3 rounded-xl disabled:opacity-50"
            >
              Продолжить
            </button>
          </form>
        )}

        {step === "confirm" && info && (
          <div className="space-y-4">
            <p className="text-white">
              Разрешить <b>{info.client_name}</b> отправлять ваши прослушивания
              и читать профиль?
            </p>
            <p className="text-xs text-gray-500">
              Код {info.user_code}. Устройство получит отдельный ключ, который
              можно отозвать в настройках (раздел «Безопасность и данные»).
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => decide(true)}
                disabled={busy}
                className="flex-1 bg-[var(--accent)] text-[var(--text-on-accent)] font-black py-3 rounded-xl disabled:opacity-50"
              >
                Разрешить
              </button>
              <button
                type="button"
                onClick={() => decide(false)}
                disabled={busy}
                className="flex-1 bg-white/5 border border-white/10 text-white font-bold py-3 rounded-xl"
              >
                Отклонить
              </button>
            </div>
          </div>
        )}

        {step === "approved" && (
          <p className="text-green-400 font-bold">
            ✅ Устройство подключено. Можно вернуться в расширение.
          </p>
        )}
        {step === "denied" && (
          <p className="text-gray-300 font-bold">Подключение отклонено.</p>
        )}
        {step === "login" && (
          <div className="space-y-4">
            <p className="text-gray-300">
              Чтобы подтвердить устройство, войдите в аккаунт.
            </p>
            <a
              href="/auth"
              className="block text-center w-full bg-[var(--accent)] text-[var(--text-on-accent)] font-black py-3 rounded-xl"
            >
              Войти
            </a>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm font-bold" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function LinkPage() {
  return (
    <Suspense fallback={null}>
      <LinkDevice />
    </Suspense>
  );
}
