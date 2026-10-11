// Server-verified demo role. The browser asks /api/session for a signed cookie; server routes trust only that cookie,
// never a role sent by the client. This is NOT user authentication: anyone can request any role while DEMO_ROLE_SWITCH
// is on. Set DEMO_ROLE_SWITCH=false (and plug in real sign-in) before exposing real data.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "@/types";

export const COOKIE = "aqualens_role";
export const ROLES: Role[] = ["citizen", "expert", "researcher", "admin"];
const secret = () => process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-only-secret-change-me");
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("hex");

export const sessionConfigured = () => !!secret();
export const roleSwitchAllowed = () => process.env.DEMO_ROLE_SWITCH !== "false";

/** Secure mode (DEMO_ROLE_SWITCH=false): reviewer, researcher and admin roles need their own passcode. Citizens never do. */
export const passcodeRequired = () => !roleSwitchAllowed();
export function passcodeConfigured(role: Role) { return !!process.env[`ROLE_PASSCODE_${role.toUpperCase()}`]; }
export function passcodeMatches(role: Role, given: string) {
  const want = process.env[`ROLE_PASSCODE_${role.toUpperCase()}`];
  if (!want || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function makeCookieValue(role: Role, ttlSec = 8 * 3600) {
  const body = `${role}.${Math.floor(Date.now() / 1000) + ttlSec}`;
  return `${body}.${sign(body)}`;
}
export function roleFromRequest(req: Request): Role | null {
  if (!secret()) return null;
  const raw = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [role, exp, sig] = raw.split(".");
  if (!role || !exp || !sig || !ROLES.includes(role as Role) || Number(exp) < Date.now() / 1000) return null;
  const good = sign(`${role}.${exp}`);
  const a = Buffer.from(sig), b = Buffer.from(good);
  return a.length === b.length && timingSafeEqual(a, b) ? (role as Role) : null;
}
