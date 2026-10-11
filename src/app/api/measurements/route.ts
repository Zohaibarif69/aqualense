import { NextResponse } from "next/server";
import { dailySummary, store } from "@/lib/serverStore";
import { fail } from "@/lib/apiAuth";
import type { DailyMeasurement, SiteMeasurements } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/measurements?siteId=BN1&days=90 — daily summaries of sensor readings at the site plus ingested gauge discharge. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams; const siteId = p.get("siteId");
  if (!siteId) return fail(400, "invalid", "siteId is required.");
  const days = Math.min(730, Math.max(1, Number(p.get("days")) || 90));
  const sinceMs = Date.now() - days * 864e5;
  try {
    const st = store();
    const linked = (await st.listSensors()).filter((s) => s.siteId === siteId && s.feed === "live");
    const [raw, gauge] = await Promise.all([st.readingsMany(linked.map((s) => s.id), sinceMs), st.measurements(siteId, new Date(sinceMs).toISOString().slice(0, 10))]);
    const series: SiteMeasurements["series"] = dailySummary(raw);
    if (gauge.length) series.discharge = gauge.map((g): DailyMeasurement => ({ date: g.date, mean: g.value, min: g.value, max: g.value, n: 1 }));
    const body: SiteMeasurements = { siteId, days, source: "server", series };
    return NextResponse.json(body);
  } catch (e) { return fail(502, "server", (e as Error).message); }
}
