import Link from "next/link";
import { btn } from "@/components/ui";
import { getT } from "@/app/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <p className="font-mono text-5xl font-semibold text-fg-3">404</p>
      <h1 className="text-xl font-semibold text-fg">
        {t("Страница не найдена")}
      </h1>
      <p className="text-sm text-fg-2">
        {t("Ссылка устарела или в адресе опечатка.")}
      </p>
      <Link href="/" className={`${btn.primary} ${btn.md} mt-3`}>
        {t("На главную")}
      </Link>
    </div>
  );
}
