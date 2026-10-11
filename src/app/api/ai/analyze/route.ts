import { NextResponse } from "next/server";
import { analyzeWithGemini, GeminiError } from "@/lib/geminiAnalysis";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024; // the client downsizes photos first; this keeps requests small
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: Request) {
  // Per-IP limit plus a global cap that protects the Gemini quota. Durable when Redis is configured (see lib/rateLimit.ts).
  const [perIp, global] = await Promise.all([rateLimit("ai-ip", clientIp(req), 12, 60), rateLimit("ai-all", "all", 120, 60)]);
  if (perIp.limited || global.limited) {
    const wait = String(Math.max(perIp.retryAfter, global.limited ? global.retryAfter : 0));
    return NextResponse.json({ error: "rate_limited", message: "Too many requests. Please wait a minute." }, { status: 429, headers: { "Retry-After": wait } });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("image");
    if (f instanceof File) file = f;
  } catch { /* handled below */ }
  if (!file) return NextResponse.json({ error: "invalid", message: "No image was provided." }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "invalid", message: "Unsupported image type." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large", message: "Image is too large." }, { status: 413 });

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await analyzeWithGemini({ base64, mimeType: file.type });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof GeminiError) {
      const status = e.kind === "not_configured" ? 503 : e.kind === "rate_limited" ? 429 : 502;
      return NextResponse.json({ error: e.kind, message: e.message }, { status });
    }
    console.error("[ai/analyze]", e);
    return NextResponse.json({ error: "unavailable", message: "AI analysis failed." }, { status: 502 });
  }
}
