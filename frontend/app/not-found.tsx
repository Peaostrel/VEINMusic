import Link from "next/link";
import { btn } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <p className="font-mono text-5xl font-semibold text-fg-3">404</p>
      <h1 className="text-xl font-semibold text-fg">Страница не найдена</h1>
      <p className="text-sm text-fg-2">
        Ссылка устарела или в адресе опечатка.
      </p>
      <Link href="/" className={`${btn.primary} ${btn.md} mt-3`}>
        На главную
      </Link>
    </div>
  );
}
