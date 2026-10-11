import { NextResponse } from "next/server";
import { fail } from "@/lib/apiAuth";
import { store } from "@/lib/serverStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hours = Math.min(24 * 30, Math.max(1, Number(new URL(req.url).searchParams.get("hours")) || 48));
  try {
    const st = store();
    if (!(await st.listSensors()).some((s) => s.id === id)) return fail(404, "not_found", "Sensor not found.");
    return NextResponse.json(await st.readings(id, Date.now() - hours * 36e5));
  } catch (e) { return fail(502, "server", (e as Error).message); }
}
