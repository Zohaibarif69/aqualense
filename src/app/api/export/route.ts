import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { roleFromRequest } from "@/lib/session";

export const runtime = "nodejs";
const ALLOWED = ["expert", "researcher", "admin"];

// Neutralise spreadsheet formulas and quote cells.
const cell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };

/** Role-gated on the SERVER using the signed cookie. Reads from Supabase when NEXT_PUBLIC_DATA_SOURCE=supabase. */
export async function GET(req: Request) {
  const role = roleFromRequest(req);
  if (!role) return NextResponse.json({ error: "auth", message: "Sign in as a reviewer, researcher or admin first." }, { status: 401 });
  if (!ALLOWED.includes(role)) return NextResponse.json({ error: "forbidden", message: "Your role can’t export data." }, { status: 403 });
  const rl = await rateLimit("export", clientIp(req), 10, 60);
  if (rl.limited) return NextResponse.json({ error: "rate_limited", message: "Too many exports. Please wait a minute." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "supabase" || !url || !key) return NextResponse.json({ error: "unsupported", message: "Server export needs the Supabase data source." }, { status: 501 });

  const p = new URL(req.url).searchParams;
  const q = new URLSearchParams({ select: "id,created_at,site_id,categories,status", order: "created_at.desc", limit: "5000" });
  q.append("status", "neq.draft"); q.append("status", "neq.withdrawn");
  if (p.get("from")) q.append("created_at", `gte.${p.get("from")}`);
  if (p.get("to")) q.append("created_at", `lte.${p.get("to")}`);
  if (p.get("siteId")) q.set("site_id", `eq.${p.get("siteId")}`);
  if (p.get("category") && /^[a-z_]+$/.test(p.get("category")!)) q.set("categories", `cs.{${p.get("category")}}`);
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  let o: Response, s: Response;
  try { [o, s] = await Promise.all([fetch(`${url}/rest/v1/observations?${q}`, { headers, cache: "no-store" }), fetch(`${url}/rest/v1/sites?select=id,city`, { headers, cache: "no-store" })]); }
  catch { return NextResponse.json({ error: "server", message: "The data source didn’t respond." }, { status: 502 }); }
  if (!o.ok || !s.ok) return NextResponse.json({ error: "server", message: "The data source didn’t respond." }, { status: 502 });
  const rows = (await o.json()) as { id: string; created_at: string; site_id: string | null; categories: string[]; status: string }[];
  const city = new Map(((await s.json()) as { id: string; city: string | null }[]).map((x) => [x.id, x.city ?? ""]));
  const csv = [["id", "created_at", "site_id", "area", "categories", "status"], ...rows.map((r) => [r.id, r.created_at, r.site_id ?? "", city.get(r.site_id ?? "") ?? "", (r.categories ?? []).join("|"), r.status])].map((r) => r.map(cell).join(",")).join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="aqualens-observations.csv"', "Cache-Control": "no-store" } });
}
