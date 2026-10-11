// Rate limiting for API routes.
// With UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set, counters live in Redis, so limits hold across serverless
// instances and restarts. Without them it falls back to per-instance memory (fine for local dev, NOT enough in production).
const mem = new Map<string, { count: number; resetAt: number }>();
let warned = false;

export interface LimitResult { limited: boolean; remaining: number; retryAfter: number; durable: boolean }

async function redisCount(key: string, windowSec: number): Promise<{ count: number; ttl: number } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, windowSec, "NX"], ["TTL", key]]), cache: "no-store",
    });
    if (!res.ok) return null;
    const r = (await res.json()) as { result: number }[];
    return { count: Number(r[0].result), ttl: Math.max(1, Number(r[2].result)) };
  } catch { return null; }
}

export async function rateLimit(scope: string, id: string, max: number, windowSec: number): Promise<LimitResult> {
  const key = `rl:${scope}:${id}`;
  const redis = await redisCount(key, windowSec);
  if (redis) return { limited: redis.count > max, remaining: Math.max(0, max - redis.count), retryAfter: redis.ttl, durable: true };
  if (!warned && process.env.NODE_ENV === "production") { warned = true; console.warn("[rateLimit] No Redis configured: limits are per-instance and reset on restart."); }
  const now = Date.now();
  const e = mem.get(key);
  const cur = !e || e.resetAt <= now ? { count: 0, resetAt: now + windowSec * 1000 } : e;
  cur.count++; mem.set(key, cur);
  if (mem.size > 5000) for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k);
  return { limited: cur.count > max, remaining: Math.max(0, max - cur.count), retryAfter: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)), durable: false };
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
