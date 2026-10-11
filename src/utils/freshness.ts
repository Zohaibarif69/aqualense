import type { EnvironmentalIndicator } from "@/types";

/** An indicator whose valid window ended more than this long ago is shown as "stale" (it is never hidden). */
const STALE_AFTER_MS = 24 * 36e5;

/**
 * Environmental data is a snapshot, so whether it is stale depends on when you look, not when it was stored.
 * Applied on every read (mock and Supabase) so an old snapshot is honestly labelled instead of looking live.
 */
export function withFreshness(i: EnvironmentalIndicator, now = Date.now()): EnvironmentalIndicator {
  if (i.dataStatus !== "available" || !i.validTo) return i;
  return Date.parse(i.validTo) + STALE_AFTER_MS < now ? { ...i, dataStatus: "stale" } : i;
}
