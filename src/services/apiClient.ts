import { config } from "./config";

export class ApiError extends Error {
  constructor(public kind: "network" | "timeout" | "invalid" | "auth" | "forbidden" | "not_found" | "rate_limit" | "server", message: string) {
    super(message);
  }
}

const friendly: Record<number, [ApiError["kind"], string]> = {
  401: ["auth", "Your session has expired. Please sign in again."],
  403: ["forbidden", "You do not have permission to do this."],
  404: ["not_found", "We could not find that record."],
  429: ["rate_limit", "Too many requests. Please wait a moment."],
};

export async function apiRequest<T>(path: string, init: RequestInit & { timeoutMs?: number; idempotencyKey?: string } = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  try {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);
    const res = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers, signal: ctrl.signal, credentials: "include" });
    if (!res.ok) {
      const [kind, msg] = friendly[res.status] ?? ["server", "Something went wrong on our side. Try again."];
      throw new ApiError(kind, msg);
    }
    try { return (await res.json()) as T; } catch { throw new ApiError("invalid", "We received an unexpected response."); }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === "AbortError") throw new ApiError("timeout", "The request timed out.");
    throw new ApiError("network", "Network unavailable. Check your connection.");
  } finally { clearTimeout(t); }
}
