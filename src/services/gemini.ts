// Browser client for the Gemini-powered AI analysis (/api/ai/analyze).
// One request per photo is shared by checkQuality() and analyze(), so a photo costs one Gemini call.
import { uuid } from "@/lib/uuid";
import type { AIAnalysis, AIFinding } from "@/types";
import type { AIAnalysisService } from "./index";

type Quality = "accepted" | "blurry" | "dark" | "far" | "irrelevant" | "unavailable";
interface FindingDto { category: AIFinding["category"]; label: string; explanation?: string; confidence?: number; box?: { x: number; y: number; width: number; height: number } }
interface ApiResult { quality: Quality; findings: FindingDto[]; message?: string; model: string }
type Outcome = { ok: true; data: ApiResult } | { ok: false; status: "failed" | "unavailable"; message: string };

const cache = new WeakMap<File, Promise<Outcome>>();
const MAX_SIDE = 1280;

/** Shrinks big phone photos so uploads are fast and stay under the server's size limit. */
async function prepare(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch { return file; }
}

async function run(file: File): Promise<Outcome> {
  try {
    const blob = await prepare(file);
    const form = new FormData();
    form.append("image", new File([blob], "photo.jpg", { type: blob.type || file.type }));
    const res = await fetch("/api/ai/analyze", { method: "POST", body: form });
    if (res.ok) return { ok: true, data: (await res.json()) as ApiResult };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 503 || body.error === "not_configured") return { ok: false, status: "unavailable", message: "AI analysis is not set up on this server. You can continue without it." };
    if (res.status === 429) return { ok: false, status: "failed", message: "The AI service is busy right now. You can continue without it." };
    return { ok: false, status: "failed", message: "AI analysis is temporarily unavailable. You can continue without it." };
  } catch {
    return { ok: false, status: "failed", message: "AI analysis is temporarily unavailable. You can continue without it." };
  }
}

const once = (file: File) => {
  let p = cache.get(file);
  if (!p) {
    p = run(file).then((r) => { if (!r.ok) cache.delete(file); return r; }); // failures aren't cached, so retry really retries
    cache.set(file, p);
  }
  return p;
};

export const geminiAi: Pick<AIAnalysisService, "checkQuality" | "analyze"> = {
  async checkQuality(file) {
    const r = await once(file);
    return { status: r.ok ? r.data.quality : "unavailable" };
  },
  async analyze(file): Promise<AIAnalysis> {
    const r = await once(file);
    if (!r.ok) return { id: uuid(), status: r.status, findings: [], message: r.message };
    const findings: AIFinding[] = r.data.findings.map((f) => ({
      id: uuid(), category: f.category, label: f.label, explanation: f.explanation, confidence: f.confidence,
      boundingBox: f.box ? { ...f.box, coordinateSpace: "normalized" as const } : undefined,
    }));
    return { id: uuid(), status: "completed", modelName: r.data.model, modelVersion: "gemini", analyzedAt: new Date().toISOString(), findings, message: r.data.message };
  },
};
