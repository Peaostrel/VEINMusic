/**
 * Single place that knows where the backend lives and how to talk to it.
 *
 * - `API_URL` / `wsUrl()` replace the base-URL fallback that used to be
 *   copy-pasted into every component.
 * - `apiFetch()` always sends the session cookie and encodes JSON bodies.
 * - `apiJson<T>()` additionally parses the response and throws `ApiError`
 *   (with the server's `detail` message) for non-2xx responses.
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

/** WebSocket URL for a backend path, e.g. `wsUrl("/ws/alice")`. */
export function wsUrl(path: string): string {
  const explicitHost = process.env.NEXT_PUBLIC_WS_URL;
  if (explicitHost) {
    const secure =
      typeof window !== "undefined" && window.location.protocol === "https:";
    return `${secure ? "wss" : "ws"}://${explicitHost}${path}`;
  }
  return API_URL.replace(/^http/, "ws") + path;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ApiInit = Omit<RequestInit, "body"> & {
  /** Serialized as JSON (sets Content-Type). */
  json?: unknown;
  body?: BodyInit | null;
};

export function apiFetch(path: string, init: ApiInit = {}): Promise<Response> {
  const { json, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  let body = rest.body;
  if (json !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }
  return fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...rest,
    headers: finalHeaders,
    body,
  });
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
  } catch {
    // not JSON
  }
  return `Ошибка сервера (${res.status})`;
}

export async function apiJson<T>(path: string, init: ApiInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res));
  }
  return (await res.json()) as T;
}
