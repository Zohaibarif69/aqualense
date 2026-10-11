import { NextResponse } from "next/server";
import { ALL_PARAMS } from "@/lib/anomaly";
import { STAFF, fail, isResponse, readJson, requireRole } from "@/lib/apiAuth";
import { store } from "@/lib/serverStore";
import type { SensorParameter } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(await store().listSensors()); } catch (e) { return fail(502, "server", (e as Error).message); }
}

export async function POST(req: Request) {
  const role = requireRole(req, STAFF); if (isResponse(role)) return role;
  const b = await readJson<{ name?: string; siteId?: string; parameters?: string[] }>(req); if (isResponse(b)) return b;
  const name = (b.name ?? "").trim().slice(0, 80);
  const params = [...new Set(b.parameters ?? [])].filter((p): p is SensorParameter => (ALL_PARAMS as string[]).includes(p));
  if (!name) return fail(400, "invalid", "Give the sensor a name.");
  if (!params.length) return fail(400, "invalid", "Choose at least one parameter.");
  try {
    const st = store();
    if ((await st.listSensors()).some((s) => s.name.toLowerCase() === name.toLowerCase())) return fail(409, "invalid", "A sensor with that name already exists.");
    const s = await st.addSensor({ name, siteId: b.siteId || undefined, parameters: params, status: "active", registeredAt: new Date().toISOString(), registeredBy: `server-${role}`, feed: "live" });
    return NextResponse.json(s, { status: 201 });
  } catch (e) { return fail(502, "server", (e as Error).message); }
}
