import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { COOKIE, makeCookieValue, passcodeConfigured, passcodeMatches, passcodeRequired, roleFromRequest, ROLES, sessionConfigured } from "@/lib/session";
import type { Role } from "@/types";

export const runtime = "nodejs";

export async function GET(req: Request) { return NextResponse.json({ role: roleFromRequest(req), passcodeRequired: passcodeRequired() }); }

export async function POST(req: Request) {
  const rl = await rateLimit("session", clientIp(req), 30, 60);
  if (rl.limited) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  if (!sessionConfigured()) return NextResponse.json({ error: "not_configured", message: "SESSION_SECRET is not set on this server." }, { status: 503 });
  const { role, passcode } = (await req.json().catch(() => ({}))) as { role?: Role; passcode?: string };
  if (!role || !ROLES.includes(role)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  // Secure mode: staff roles need the passcode set in ROLE_PASSCODE_EXPERT / _RESEARCHER / _ADMIN.
  if (role !== "citizen" && passcodeRequired()) {
    if (!passcodeConfigured(role)) return NextResponse.json({ error: "disabled", message: `The ${role} role is switched off on this server.` }, { status: 403 });
    if (!passcodeMatches(role, String(passcode ?? ""))) { await new Promise((r) => setTimeout(r, 400)); return NextResponse.json({ error: "passcode", message: passcode ? "That passcode isn’t right." : `The ${role} role needs a passcode.` }, { status: 401 }); }
  }
  const res = NextResponse.json({ role });
  res.cookies.set(COOKIE, makeCookieValue(role), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600 });
  return res;
}
