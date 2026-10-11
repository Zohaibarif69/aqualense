import { NextResponse } from "next/server";
import { STAFF, fail, isResponse, readJson, requireRole } from "@/lib/apiAuth";
import { store } from "@/lib/serverStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const role = requireRole(req, STAFF); if (isResponse(role)) return role;
  const b = await readJson<{ alertId?: string }>(req); if (isResponse(b)) return b;
  if (!b.alertId || b.alertId.length > 200) return fail(400, "invalid", "alertId is required.");
  try { await store().ack(b.alertId, `server-${role}`); return NextResponse.json({ ok: true }); } catch (e) { return fail(502, "server", (e as Error).message); }
}
