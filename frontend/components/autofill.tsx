"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";

/*
 * Password managers fill a saved login into the text field that comes right
 * before a password field in the same form, and pages without a <form> count
 * as one big form. So every password field sits in its own <form> with
 * AccountUsername in front of it, and API tokens use SecretInput instead of
 * type="password".
 */

/**
 * Invisible username field for forms that confirm an action with the current
 * password (change email, 2FA, delete account). The password manager pairs the
 * saved login with this field instead of the visible ones next to it.
 */
export function AccountUsername() {
  const [username, setUsername] = useState("");
  useEffect(() => {
    try {
      setUsername(localStorage.getItem("username") ?? "");
    } catch {
      // Storage blocked: the field stays empty, which is still enough.
    }
  }, []);
  return (
    <input
      type="text"
      name="username"
      autoComplete="username"
      value={username}
      readOnly
      hidden
      tabIndex={-1}
      aria-hidden="true"
    />
  );
}

/** Attributes that keep autofill and password managers off a plain field. */
export const noAutofill = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-bwignore": true,
  "data-form-type": "other",
} as const;

/**
 * Masked field for API tokens and session keys. It is a text field, so the
 * browser never offers or saves the account password here.
 */
export function SecretInput({
  className,
  ...props
}: Readonly<Omit<InputHTMLAttributes<HTMLInputElement>, "type">>) {
  return (
    <input
      {...noAutofill}
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      {...props}
      type="text"
      className={`secret-input ${className ?? ""}`}
    />
  );
}
