import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { roleFromRequest } from "@/lib/session";
import type { Role } from "@/types";

export const STAFF: Role[] = ["expert", "researcher", "admin"];
export const fail = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

/** Checks the signed role cookie. Returns the role, or a ready-made error response. */
export function requireRole(req: Request, allowed: Role[]): Role | NextResponse {
  const role = roleFromRequest(req);
  if (!role) return fail(401, "auth", "Sign in as a reviewer, researcher or admin first.");
  if (!allowed.includes(role)) return fail(403, "forbidden", "Your role can’t do this.");
  return role;
}

const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Machine-to-machine check for data feeds: `Authorization: Bearer <INGEST_API_KEY>`. */
export function requireIngestKey(req: Request): NextResponse | null {
  const key = process.env.INGEST_API_KEY;
  if (!key) return fail(503, "not_configured", "INGEST_API_KEY is not set on this server, so ingest is switched off.");
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return given && safeEq(given, key) ? null : fail(401, "auth", "Missing or wrong ingest key.");
}

/** Reads a JSON body, refusing anything too large or not JSON. */
export async function readJson<T>(req: Request, maxBytes = 1_000_000): Promise<T | NextResponse> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return fail(415, "invalid", "Send JSON with Content-Type: application/json.");
  const text = await req.text();
  if (text.length > maxBytes) return fail(413, "too_large", "Request body is too large.");
  try { return JSON.parse(text) as T; } catch { return fail(400, "invalid", "The body is not valid JSON."); }
}
export const isResponse = (v: unknown): v is NextResponse => v instanceof NextResponse;
