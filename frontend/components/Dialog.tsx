"use client";

import { useEffect, useRef } from "react";

/**
 * Full-screen modal built on the native <dialog> (showModal): the rest of
 * the page is inert, Escape calls onClose, focus returns to the previously
 * focused element when the dialog goes away.
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
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    return () => {
      if (dialog?.open) dialog.close();
      previous?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        // Escape: let the parent unmount us instead of closing natively
        e.preventDefault();
        onClose();
      }}
      className={`fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none flex flex-col items-center justify-center bg-black/90 p-4 text-inherit outline-none backdrop:bg-transparent ${className}`}
    >
      {children}
    </dialog>
  );
}
