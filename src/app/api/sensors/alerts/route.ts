import { NextResponse } from "next/server";
import { detectAnomalies, staleAlert } from "@/lib/anomaly";
import { fail } from "@/lib/apiAuth";
import { store } from "@/lib/serverStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Alerts are computed here from stored readings, so every viewer sees the same list. */
export async function GET() {
  try {
    const st = store(); const now = Date.now();
    const [sensors, acks] = await Promise.all([st.listSensors(), st.acks()]);
    const active = sensors.filter((s) => s.status === "active");
    const rows = await st.readingsMany(active.map((s) => s.id), now - 48 * 36e5);
    const ackSet = new Set(acks);
    const out = active.flatMap((s) => {
      const r = rows.filter((x) => x.sensorId === s.id).map(({ at, values }) => ({ at, values })).sort((a, b) => a.at.localeCompare(b.at));
      const alerts = detectAnomalies(s, r); const stale = staleAlert(s, r, now); if (stale) alerts.unshift(stale);
      return alerts.map((a) => ({ ...a, value: Number.isFinite(a.value) ? a.value : 0, acknowledged: ackSet.has(a.id), sensorName: s.name }));
    });
    return NextResponse.json(out.sort((a, b) => b.at.localeCompare(a.at)));
  } catch (e) { return fail(502, "server", (e as Error).message); }
}
