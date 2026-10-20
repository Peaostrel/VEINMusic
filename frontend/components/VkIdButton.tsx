"use client";
import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/app/lib/api";
import { btn } from "@/components/ui";
import { useT } from "@/app/lib/i18n/client";

type Mode = "login" | "link";
type WidgetConfig = {
  app_id: number;
  redirect_url: string;
  state: string;
  code_challenge: string;
  scope: string;
};
/** What the server made of the VK account (see app/routers/vk_id.py). */
export type VkResult =
  "finish" | "linked" | "taken" | "unknown" | "banned" | "error";
type LoginPayload = { code?: string; device_id?: string; state?: string };

/**
 * VK's One Tap button ("Продолжить как …"). Sign-in runs in a VK popup with
 * the state and PKCE challenge the server issued, and the code it returns
 * goes to the server: tokens never reach the page. When the SDK can't load
 * (blocked, offline) the plain link to the redirect flow is shown instead.
 */
export default function VkIdButton({
  mode,
  onResult,
}: Readonly<{ mode: Mode; onResult: (result: VkResult) => void }>) {
  const t = useT();
  const lang = t.lang;
  const container = useRef<HTMLDivElement>(null);
  const onResultRef = useRef(onResult);
  const [failed, setFailed] = useState(false);
  // Every attempt needs a fresh state from the server
  const [round, setRound] = useState(0);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Without a session in VK the SDK draws a plain <button> (no type), so
  // inside the sign-in form a click (or Enter on it) would also submit the
  // password form. The SDK's own handler on the button still runs.
  useEffect(() => {
    const el = container.current;
    const keepForm = (e: MouseEvent) => {
      if ((e.target as Element).closest("button")) e.preventDefault();
    };
    el?.addEventListener("click", keepForm);
    return () => el?.removeEventListener("click", keepForm);
  }, [failed]);

  useEffect(() => {
    let cancelled = false;
    let widget: { close: () => void } | undefined;

    const exchange = async (payload: LoginPayload) => {
      let result: VkResult = "error";
      try {
        const res = await fetch(`${API_URL}/auth/vk/widget/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            code: payload.code,
            device_id: payload.device_id,
            state: payload.state,
          }),
        });
        if (res.ok)
          result = ((await res.json()) as { result: VkResult }).result;
      } catch {
        result = "error";
      }
      onResultRef.current(result);
      if (result !== "finish") setRound((n) => n + 1);
    };

    void (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/vk/widget?mode=${mode}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`VK ID widget: ${res.status}`);
        const config = (await res.json()) as WidgetConfig;
        const VKID = await import("@vkid/sdk");
        if (cancelled || !container.current) return;
        container.current.replaceChildren();
        VKID.Config.init({
          app: config.app_id,
          redirectUrl: config.redirect_url,
          state: config.state,
          codeChallenge: config.code_challenge,
          scope: config.scope,
          responseMode: VKID.ConfigResponseMode.Callback,
          source: VKID.ConfigSource.LOWCODE,
        });
        const light = document.documentElement.dataset.colorMode === "light";
        const oneTap = new VKID.OneTap();
        widget = oneTap;
        oneTap
          .render({
            container: container.current,
            scheme: light ? VKID.Scheme.LIGHT : VKID.Scheme.DARK,
            lang: lang === "en" ? VKID.Languages.ENG : VKID.Languages.RUS,
            showAlternativeLogin: true,
            oauthList: [VKID.OAuthName.OK, VKID.OAuthName.MAIL],
            styles: { height: 44, borderRadius: 8 },
          })
          .on(VKID.WidgetEvents.ERROR, () => {
            if (!cancelled) setFailed(true);
          })
          .on(
            VKID.OneTapInternalEvents.LOGIN_SUCCESS,
            (payload: LoginPayload) => void exchange(payload),
          );
      } catch (e) {
        console.warn(e);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      widget?.close();
    };
  }, [mode, round, lang]);

  if (failed) {
    return (
      <a
        href={`${API_URL}/auth/vk/${mode}`}
        className={`${btn.secondary} ${btn.lg}`}
      >
        {mode === "login" ? t("Войти через VK ID") : t("Привязать VK ID")}
      </a>
    );
  }
  return <div ref={container} className="min-h-11 w-full" />;
}
