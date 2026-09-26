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
    // FastAPI validation errors: [{ loc, msg, type }, …]
    if (Array.isArray(data?.detail)) {
      const messages = data.detail
        .map((d: { msg?: unknown }) =>
          typeof d?.msg === "string" ? d.msg : "",
        )
        .filter(Boolean);
      if (messages.length > 0) return messages.join("; ");
    }
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

/**
 * Opens a WebSocket to the API. Signed-in pages pass `authed`: the socket
 * then carries a one-minute ticket, because not every browser sends the
 * SameSite=Strict session cookie with a WebSocket handshake to the API
 * subdomain. `setup` wires the handlers; the returned function cancels a
 * pending connection or closes an open one (use it as the effect cleanup).
 */
export function openSocket(
  path: string,
  setup: (ws: WebSocket) => void,
  { authed = false }: { authed?: boolean } = {},
): () => void {
  let ws: WebSocket | null = null;
  let cancelled = false;

  const connect = async () => {
    let url = wsUrl(path);
    if (authed) {
      try {
        const { ticket } = await apiJson<{ ticket: string }>(
          "/auth/ws-ticket",
          { method: "POST", json: {} },
        );
        url += `${url.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(ticket)}`;
      } catch {
        // Signed out or offline: connect as a guest
      }
    }
    if (cancelled) return;
    ws = new WebSocket(url);
    setup(ws);
  };
  connect();

  return () => {
    cancelled = true;
    ws?.close();
  };
}
