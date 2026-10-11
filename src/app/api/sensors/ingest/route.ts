import { NextResponse } from "next/server";
import { PARAMS } from "@/lib/anomaly";
import { fail, isResponse, readJson, requireIngestKey } from "@/lib/apiAuth";
import { store, type ReadingRow } from "@/lib/serverStore";
import type { SensorParameter } from "@/types";

export const runtime = "nodejs";

// Wide physical limits: they reject broken values (e.g. -999 from a faulty probe), not unusual-but-real pollution events.
const PHYSICAL: Record<SensorParameter, [number, number]> = { water_temperature: [-5, 60], turbidity: [0, 5000], ph: [0, 14], dissolved_oxygen: [0, 30], conductivity: [0, 100000] };
const MAX_ROWS = 1000;

/**
 * POST /api/sensors/ingest   Authorization: Bearer <INGEST_API_KEY>
 * { "readings": [ { "sensorId": "SNS-100", "at": "2026-10-11T12:00:00Z", "values": { "ph": 7.4, "turbidity": 9.1 } } ] }
 * Valid rows are stored (a repeat of the same sensor + time replaces the earlier row); rejected rows are listed in the reply.
 */
export async function POST(req: Request) {
  const denied = requireIngestKey(req); if (denied) return denied;
  const b = await readJson<{ readings?: { sensorId?: string; at?: string; values?: Record<string, unknown> }[] }>(req, 2_000_000); if (isResponse(b)) return b;
  if (!Array.isArray(b.readings) || !b.readings.length) return fail(400, "invalid", "Send { readings: [...] } with at least one reading.");
  if (b.readings.length > MAX_ROWS) return fail(413, "too_large", `At most ${MAX_ROWS} readings per request.`);
  try {
    const st = store(); const sensors = new Map((await st.listSensors()).map((s) => [s.id, s])); const now = Date.now();
    const ok: ReadingRow[] = []; const rejected: { index: number; reason: string }[] = [];
    b.readings.forEach((r, index) => {
      const bad = (reason: string) => rejected.push({ index, reason });
      const s = r.sensorId ? sensors.get(r.sensorId) : undefined;
      if (!s) return bad("unknown sensorId (register the sensor first)");
      const t = r.at ? Date.parse(r.at) : NaN;
      if (!Number.isFinite(t)) return bad("`at` must be an ISO date-time");
      if (t > now + 5 * 60_000) return bad("`at` is in the future");
      if (t < now - 30 * 864e5) return bad("`at` is older than 30 days");
      const values: ReadingRow["values"] = {};
      for (const [k, v] of Object.entries(r.values ?? {})) {
        if (!(k in PARAMS) || !s.parameters.includes(k as SensorParameter)) return bad(`parameter "${k}" is not configured for ${s.id}`);
        const [lo, hi] = PHYSICAL[k as SensorParameter];
        if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) return bad(`${k} must be a number between ${lo} and ${hi}`);
        values[k as SensorParameter] = Math.round(v * 1000) / 1000;
      }
      if (!Object.keys(values).length) return bad("no values");
      ok.push({ sensorId: s.id, at: new Date(t).toISOString(), values });
    });
    if (ok.length) await st.addReadings(ok);
    return NextResponse.json({ stored: ok.length, rejected: rejected.length, errors: rejected.slice(0, 10) }, { status: ok.length ? 200 : 422 });
  } catch (e) { return fail(502, "server", (e as Error).message); }
}
