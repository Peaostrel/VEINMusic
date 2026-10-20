"use client";
import { useEffect, useState } from "react";
import { apiJson } from "@/app/lib/api";
import { btn } from "@/components/ui";
import { useT } from "@/app/lib/i18n/client";
import VkIdButton from "@/components/VkIdButton";

type Status = { enabled: boolean; linked: boolean };

/** Link or unlink the VK ID account used for signing in. */
export default function VkIdSettings() {
  const t = useT();
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiJson<Status>("/auth/vk/status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status || (!status.enabled && !status.linked)) return null;

  const unlink = async () => {
    if (!confirm(t("Отвязать VK ID? Входить можно будет только по паролю.")))
      return;
    setBusy(true);
    try {
      const res = await apiJson<{ message: string }>("/auth/vk/unlink", {
        method: "POST",
      });
      setMessage(t(res.message));
      setStatus({ ...status, linked: false });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("Ошибка сети"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
      <h3 className="font-semibold">VK ID</h3>
      <p className="text-sm text-fg-2">
        {status.linked
          ? t(
              "VK ID привязан: на странице входа можно нажать «Войти через VK ID».",
            )
          : t(
              "Привяжите VK ID, чтобы входить без пароля. Мы сохраняем только идентификатор аккаунта VK.",
            )}
      </p>
      <div className="flex max-w-[360px] gap-2">
        {status.linked ? (
          <button
            type="button"
            onClick={() => void unlink()}
            disabled={busy}
            className={`${btn.danger} ${btn.sm}`}
          >
            {t("Отвязать")}
          </button>
        ) : (
          <VkIdButton
            mode="link"
            onResult={(result) => {
              if (result === "linked") {
                setStatus((current) => current && { ...current, linked: true });
                setMessage(
                  t("✅ VK ID привязан, теперь через него можно входить"),
                );
              } else if (result === "taken") {
                setMessage(t("❌ Этот VK ID уже привязан к другому аккаунту"));
              } else {
                setMessage(t("❌ Не удалось привязать VK ID"));
              }
            }}
          />
        )}
      </div>
      {message && <p className="text-sm">{message}</p>}
    </section>
  );
}
