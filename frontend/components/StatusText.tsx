import { AlertTriangle, Check, X } from "lucide-react";

const PREFIX = /^(✅|❌|⚠️|⚠)\s*/u;

/**
 * One-line result message. Callers keep the "✅ " / "❌ " / "⚠️ " prefix in
 * their strings (it tells success from failure); here it becomes an icon.
 */
export default function StatusText({
  text,
  className = "",
}: Readonly<{ text: string | null | undefined; className?: string }>) {
  if (!text) return null;
  const mark = PREFIX.exec(text)?.[1];
  const body = text.replace(PREFIX, "");
  let tone = "text-fg-2";
  let Icon: typeof Check | null = null;
  if (mark === "✅") {
    tone = "text-ok";
    Icon = Check;
  } else if (mark === "❌") {
    tone = "text-danger";
    Icon = X;
  } else if (mark) {
    tone = "text-accent";
    Icon = AlertTriangle;
  }
  return (
    <output
      className={`flex items-center gap-1.5 text-[13px] ${tone} ${className}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {body}
    </output>
  );
}
