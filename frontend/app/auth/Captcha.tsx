"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/app/lib/api";
import { useT } from "@/app/lib/i18n/client";

/**
 * The captcha the API asks for (Yandex SmartCaptcha or Cloudflare
 * Turnstile), or nothing when it is switched off. Each answer works once:
 * remount the component (change its `key`) after a failed attempt.
 */

type Provider = "yandex" | "turnstile";

interface CaptchaConfig {
  provider: Provider | null;
  site_key: string | null;
}

interface Widget {
  render: (
    el: HTMLElement,
    options: Record<string, unknown>,
  ) => number | string | undefined;
}

declare global {
  // Globals set by the providers' scripts
  var smartCaptcha: Widget | undefined;
  var turnstile: Widget | undefined;
}

const SCRIPTS: Record<Provider, string> = {
  yandex: "https://smartcaptcha.yandexcloud.net/captcha.js?render=onload",
  turnstile:
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
};

let config: Promise<CaptchaConfig> | null = null;
const scripts = new Map<Provider, Promise<void>>();

/** Which captcha (if any) the API uses; asked once per page load. */
export function captchaConfig(): Promise<CaptchaConfig> {
  config ??= fetch(`${API_URL}/auth/captcha`)
    .then((r) => (r.ok ? (r.json() as Promise<CaptchaConfig>) : null))
    .then((c) => c ?? { provider: null, site_key: null })
    .catch(() => {
      config = null;
      return { provider: null, site_key: null };
    });
  return config;
}

function loadScript(provider: Provider): Promise<void> {
  let loading = scripts.get(provider);
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = SCRIPTS[provider];
      tag.async = true;
      tag.onload = () => resolve();
      tag.onerror = () => {
        scripts.delete(provider);
        reject(new Error("captcha script"));
      };
      document.head.appendChild(tag);
    });
    scripts.set(provider, loading);
  }
  return loading;
}

function widget(provider: Provider): Widget | undefined {
  return provider === "yandex" ? globalThis.smartCaptcha : globalThis.turnstile;
}

/** `get()` once it returns something, checking every 100 ms for 5 s.
 * SmartCaptcha's script defines its global a moment after onload. */
function whenDefined<T>(get: () => T | undefined): Promise<T | undefined> {
  return new Promise((resolve) => {
    let tries = 0;
    const timer = setInterval(() => {
      const value = get();
      if (value !== undefined || ++tries >= 50) {
        clearInterval(timer);
        resolve(value);
      }
    }, 100);
  });
}

export default function Captcha({
  onToken,
}: Readonly<{ onToken: (token: string) => void }>) {
  const t = useT();
  const lang = t.lang;
  const box = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    onToken("");
    captchaConfig()
      .then(async ({ provider, site_key }) => {
        if (!provider || !site_key || !active) return;
        setEnabled(true);
        await loadScript(provider);
        const api = await whenDefined(() => widget(provider));
        if (!api || !box.current || !active) throw new Error("captcha");
        box.current.replaceChildren();
        api.render(box.current, {
          sitekey: site_key,
          hl: lang,
          language: lang,
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(""),
        });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [onToken, lang]);

  if (failed)
    return (
      <p className="text-[13px] text-danger">
        {t(
          "Не удалось загрузить проверку «я не робот». Обновите страницу или отключите блокировщик для этого сайта.",
        )}
      </p>
    );
  // Kept in the tree (hidden) until the config arrives, so the ref is set
  return <div ref={box} hidden={!enabled} className="min-h-[65px]" />;
}
