"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, LogIn, Monitor, X } from "lucide-react";
import { ApiError, apiJson } from "@/app/lib/api";
import type { DeviceCodeInfo } from "@/app/lib/types";
import { btn } from "@/components/ui";

type Step = "enter" | "confirm" | "approved" | "denied" | "login";

const STEPS = ["Код", "Доступ", "Готово"];

function normalizeCode(code: string): string {
  const raw = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

/** Formats while typing: "k7qm2" → "K7QM-2". */
function formatTyped(value: string): string {
  const raw = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

function stepIndex(step: Step): number {
  if (step === "confirm") return 1;
  if (step === "approved" || step === "denied") return 2;
  return 0;
}

function Steps({ current }: Readonly<{ current: number }>) {
  return (
    <ol aria-label="Шаги" className="flex gap-2 font-mono text-xs">
      {STEPS.map((label, i) => {
        let tone = "border-line text-fg-3";
        if (i === current) tone = "border-accent bg-surface-2 text-fg";
        else if (i < current) tone = "border-line text-fg-2";
        return (
          <li
            key={label}
            aria-current={i === current ? "step" : undefined}
            className={`inline-flex h-[26px] items-center rounded-full border px-2.5 ${tone}`}
          >
            {i + 1} {label}
          </li>
        );
      })}
    </ol>
  );
}

function Result({
  ok,
  title,
  text,
  onRestart,
}: Readonly<{
  ok: boolean;
  title: string;
  text: string;
  onRestart: () => void;
}>) {
  const Icon = ok ? Check : X;
  return (
    <section className="flex w-full max-w-[420px] flex-col items-center gap-4 text-center">
      <span
        className={`flex h-[52px] w-[52px] items-center justify-center rounded-full ${
          ok ? "bg-[#1f2e27] text-ok" : "bg-[#2e1f1f] text-danger"
        }`}
      >
        <Icon className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="text-sm leading-relaxed text-fg-2">{text}</p>
      <button
        type="button"
        onClick={onRestart}
        className={`${btn.secondary} ${btn.md} mt-2`}
      >
        Подключить другое устройство
      </button>
    </section>
  );
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
    if (initial.length === 9) void lookup(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = async (approve: boolean) => {
    if (!info) return;
    setError("");
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

  const restart = () => {
    setCode("");
    setInfo(null);
    setError("");
    setStep("enter");
  };

  const expires = info
    ? new Date(info.expires_at).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const errorLine = error && (
    <p role="alert" className="text-[13px] text-danger">
      {error}
    </p>
  );

  return (
    <div className="flex flex-col items-center gap-10 px-4 pt-16 pb-20 md:pt-24">
      {step !== "login" && <Steps current={stepIndex(step)} />}

      {step === "enter" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(normalizeCode(code));
          }}
          className="flex w-full max-w-[420px] flex-col gap-5 text-center"
        >
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">
              Подключение устройства
            </h1>
            <p className="text-sm text-fg-2">
              Введите код, который показывает расширение VEIN. Код действует 10
              минут.
            </p>
          </div>
          <input
            value={code}
            onChange={(e) => setCode(formatTyped(e.target.value))}
            placeholder="ABCD-2345"
            aria-label="Код устройства"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={9}
            className="h-16 rounded-[10px] border border-[#2e3034] bg-surface text-center font-mono text-[26px] tracking-[0.18em] uppercase outline-none placeholder:text-fg-3/50 focus:border-accent sm:text-[30px]"
          />
          {errorLine}
          <button
            type="submit"
            disabled={busy || normalizeCode(code).length !== 9}
            className={`${btn.primary} ${btn.lg}`}
          >
            Продолжить
          </button>
        </form>
      )}

      {step === "confirm" && info && (
        <section
          aria-labelledby="confirm-title"
          className="flex w-full max-w-[440px] flex-col gap-5"
        >
          <h1
            id="confirm-title"
            className="text-center text-2xl font-semibold tracking-[-0.02em]"
          >
            Разрешить доступ?
          </h1>
          <div className="rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line-soft px-5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-2">
                <Monitor className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">
                  {info.client_name}
                </span>
                <span className="font-mono text-xs text-fg-3">
                  код {info.user_code} · до {expires}
                </span>
              </span>
            </div>
            <ul className="flex flex-col gap-2.5 px-5 py-4 text-[13px]">
              <li className="flex gap-2.5 text-fg">
                <span className="w-3 font-mono text-ok">+</span>
                <span>Отправлять ваши прослушивания</span>
              </li>
              <li className="flex gap-2.5 text-fg">
                <span className="w-3 font-mono text-ok">+</span>
                <span>Читать ваш профиль</span>
              </li>
              <li className="flex gap-2.5 text-fg-3">
                <span className="w-3 font-mono">−</span>
                <span>Не сможет менять пароль и настройки</span>
              </li>
            </ul>
          </div>
          <p className="text-[13px] leading-relaxed text-fg-3">
            Устройство получит отдельный ключ. Отозвать его можно в настройках,
            раздел «Безопасность и данные».
          </p>
          {errorLine}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => decide(false)}
              disabled={busy}
              className={`${btn.secondary} ${btn.lg} flex-1`}
            >
              Отклонить
            </button>
            <button
              type="button"
              onClick={() => decide(true)}
              disabled={busy}
              className={`${btn.primary} ${btn.lg} flex-1`}
            >
              Разрешить
            </button>
          </div>
        </section>
      )}

      {step === "approved" && (
        <Result
          ok
          title="Устройство подключено"
          text="Можно вернуться в расширение — оно уже отправляет прослушивания."
          onRestart={restart}
        />
      )}
      {step === "denied" && (
        <Result
          ok={false}
          title="Подключение отклонено"
          text="Расширение не получило доступ. Если это были вы, начните заново."
          onRestart={restart}
        />
      )}

      {step === "login" && (
        <section className="flex w-full max-w-[420px] flex-col items-center gap-4 text-center">
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-surface-2 text-fg-2">
            <LogIn className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Подключение устройства
          </h1>
          <p className="text-sm text-fg-2">
            Чтобы подтвердить устройство, войдите в аккаунт.
          </p>
          <a href="/auth" className={`${btn.primary} ${btn.lg} mt-2 w-full`}>
            Войти
          </a>
          <p className="text-[13px] text-fg-3">
            После входа вы вернётесь на эту страницу.
          </p>
        </section>
      )}
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
