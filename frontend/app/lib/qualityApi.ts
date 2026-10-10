import { API_URL } from "./api";

export async function qualityRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (response.status === 401)
    throw new Error("Войдите в аккаунт, чтобы продолжить.");
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      typeof payload?.detail === "string"
        ? payload.detail
        : "Не удалось выполнить запрос. Попробуйте ещё раз.",
    );
  }
  return response.json() as Promise<T>;
}

export function jsonRequest(method: string, data: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
