import { NextResponse } from "next/server";
import { STAFF, fail, isResponse, readJson, requireRole } from "@/lib/apiAuth";
import { store } from "@/lib/serverStore";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = requireRole(req, STAFF); if (isResponse(role)) return role;
  const { id } = await params;
  const b = await readJson<{ status?: string }>(req); if (isResponse(b)) return b;
  if (!["active", "maintenance", "offline"].includes(b.status ?? "")) return fail(400, "invalid", "Status must be active, maintenance or offline.");
  try {
    const s = await store().updateSensor(id, { status: b.status as "active" | "maintenance" | "offline" });
    return s ? NextResponse.json(s) : fail(404, "not_found", "Sensor not found.");
  } catch (e) { return fail(502, "server", (e as Error).message); }
}
