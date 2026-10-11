import { NextResponse } from "next/server";
import { fail, isResponse, readJson, requireIngestKey } from "@/lib/apiAuth";
import { store, type Measurement } from "@/lib/serverStore";

export const runtime = "nodejs";

/**
 * POST /api/measurements/ingest   Authorization: Bearer <INGEST_API_KEY>
 * { "rows": [ { "siteId": "BN1", "date": "2026-10-01", "value": 0.42, "source": "ARPA gauge 12" } ] }
 * Daily MEASURED discharge (m³/s) from a gauge or agency, kept beyond the AquaConnect outlook archive.
 */
export async function POST(req: Request) {
  const denied = requireIngestKey(req); if (denied) return denied;
  const b = await readJson<{ rows?: { siteId?: string; date?: string; value?: unknown; source?: string }[] }>(req, 3_000_000); if (isResponse(b)) return b;
  if (!Array.isArray(b.rows) || !b.rows.length) return fail(400, "invalid", "Send { rows: [...] }.");
  if (b.rows.length > 5000) return fail(413, "too_large", "At most 5000 rows per request.");
  const ok: Measurement[] = []; const errors: { index: number; reason: string }[] = [];
  b.rows.forEach((r, index) => {
    if (!r.siteId || !/^[\w.-]{1,40}$/.test(r.siteId)) return errors.push({ index, reason: "siteId missing or invalid" });
    if (!r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date))) return errors.push({ index, reason: "date must be YYYY-MM-DD" });
    if (r.date > new Date().toISOString().slice(0, 10)) return errors.push({ index, reason: "date is in the future" });
    if (typeof r.value !== "number" || !Number.isFinite(r.value) || r.value < 0 || r.value > 1e6) return errors.push({ index, reason: "value must be a number from 0 to 1,000,000 (m³/s)" });
    ok.push({ siteId: r.siteId, date: r.date, parameter: "discharge", value: r.value, source: (r.source ?? "ingest").slice(0, 80) });
  });
  try {
    if (ok.length) await store().addMeasurements(ok);
    return NextResponse.json({ stored: ok.length, rejected: errors.length, errors: errors.slice(0, 10) }, { status: ok.length ? 200 : 422 });
  } catch (e) { return fail(502, "server", (e as Error).message); }
}
