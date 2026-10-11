// Temporary anonymous identity (no authentication yet).
// Each browser gets a random id, so "My reports" works without sign-in.
// When real auth is added, replace this file with the signed-in user's id and role.
import { uuid } from "@/lib/uuid";
import type { Role, User } from "@/types";

const ID_KEY = "aqualens.userId";
const ROLE_KEY = "aqualens.role";
const names: Record<Role, string> = { citizen: "Demo Citizen", expert: "Demo Reviewer", researcher: "Demo Researcher", admin: "Demo Admin" };
const roles: Role[] = ["citizen", "expert", "researcher", "admin"];

const read = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

let memoryId: string | undefined;
export function getUser(): User {
  let id = read(ID_KEY) ?? memoryId;
  if (!id) { id = `u-${uuid().slice(0, 8)}`; write(ID_KEY, id); }
  memoryId = id;
  const stored = read(ROLE_KEY) as Role | null;
  const role: Role = stored && roles.includes(stored) ? stored : "citizen";
  return { id, displayName: names[role], role };
}

export interface SessionResult { ok: boolean; reason?: "passcode" | "disabled" | "unavailable"; message?: string }

/** Asks the server for a signed role cookie so server routes (CSV export, sensors) can check the role themselves. */
export async function requestSession(role: Role, passcode?: string): Promise<SessionResult> {
  try {
    const res = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, passcode }) });
    if (res.ok) return { ok: true };
    const b = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (res.status === 401 && b.error === "passcode") return { ok: false, reason: "passcode", message: b.message };
    if (res.status === 403) return { ok: false, reason: "disabled", message: b.message };
    return { ok: false, reason: "unavailable", message: b.message };   // e.g. SESSION_SECRET not set: client-only demo still works
  } catch { return { ok: false, reason: "unavailable" }; }
}
export const syncSession = async (role: Role) => (await requestSession(role)).ok;

/** Throws when the server actively refuses the role (wrong or missing passcode, role switched off). */
export async function enterRole(role: Role, passcode?: string): Promise<void> {
  const r = await requestSession(role, passcode);
  if (!r.ok && (r.reason === "passcode" || r.reason === "disabled")) throw Object.assign(new Error(r.message ?? "Couldn’t switch role."), { code: r.reason });
}

export function setRole(role: Role): User {
  write(ROLE_KEY, role);
  return getUser();
}
