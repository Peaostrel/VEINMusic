"use client";

import { useEffect, useRef } from "react";

/**
 * Full-screen modal overlay: role="dialog", closes on Escape, moves focus
 * into the dialog on open and back to the previously focused element on close.
 */
export default function Dialog({
  label,
  onClose,
  className = "",
  children,
}: Readonly<{
  label: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4 outline-none ${className}`}
    >
      {children}
    </div>
  );
}
