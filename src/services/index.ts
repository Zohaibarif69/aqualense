// Service layer. UI talks only to `api`. Mock and HTTP implementations share the same interfaces.
import { uuid } from "@/lib/uuid";
import * as db from "@/mocks/data";
import { withFreshness } from "@/utils/freshness";
import type { DischargePoint, AIAnalysis, AIAnalysisVersion, AuditEntry, AIFinding, AppNotification, CitizenAssessment, CreateObservationInput, EnvironmentalIndicator, ExpertReview, MonitoringSite, Observation, ObservationPhoto, ObservationQuery, ObservationStatus, ReviewDecision, TimelineEvent, User, Role } from "@/types";
import { apiRequest, ApiError } from "./apiClient";
import { config, simulate } from "./config";
import { createSupabaseApi } from "./supabase";
import { geminiAi } from "./gemini";
import { enterRole } from "./identity";
import archive from "@/data/discharge-history.json";
const history = async (siteId: string): Promise<DischargePoint[]> => ((archive.sites as Record<string, DischargePoint[]>)[siteId] ?? []).slice();
export const dischargeArchive = { from: archive.from, to: archive.to, source: archive.source };

export interface ObservationService {
  list(q?: ObservationQuery): Promise<Observation[]>;
  getById(id: string): Promise<Observation>;
  create(input: CreateObservationInput): Promise<Observation>;
  update(id: string, input: Partial<Pick<Observation, "description" | "status">>): Promise<Observation>;
  photos(ids: string[]): Promise<ObservationPhoto[]>;
  timeline(id: string): Promise<TimelineEvent[]>;
  /** Reporter edits their own report (description and categories only). Recorded in the audit log. */
  edit(id: string, input: { description?: string; categories?: Observation["categories"] }): Promise<Observation>;
  /** Reporter withdraws their own report. The record is kept and labelled "Withdrawn". */
  withdraw(id: string, reason?: string): Promise<Observation>;
}
export interface AIAnalysisService {
  checkQuality(file: File): Promise<{ status: "accepted" | "blurry" | "dark" | "far" | "irrelevant" | "unavailable" }>;
  analyze(file: File): Promise<AIAnalysis>;
  getForObservation(observationId: string): Promise<AIAnalysis | null>;
  feedback(analysisId: string, findingId: string, a: CitizenAssessment): Promise<void>;
  /** Earlier analyses of the same observation, newest first (the current one is not included). */
  history(observationId: string): Promise<AIAnalysisVersion[]>;
  /** Stores a fresh analysis as the current one and moves the previous one into history. */
  saveReanalysis(observationId: string, analysis: AIAnalysis): Promise<AIAnalysis>;
}
export interface AuditService { list(observationId: string): Promise<AuditEntry[]> }
export interface SiteService { list(): Promise<MonitoringSite[]>; getById(id: string): Promise<MonitoringSite> }
export interface EnvironmentalService {
  indicators(siteId: string): Promise<EnvironmentalIndicator[]>;
  forecast(siteId: string): Promise<{ date: string; observed: number | null; forecast: number | null }[]>;
  /** Archived + current discharge outlooks (about 18 days). Bundled with the app, not a gauge record. */
  history(siteId: string): Promise<DischargePoint[]>;
}
export interface ReviewService {
  list(): Promise<ExpertReview[]>;
  getForObservation(observationId: string): Promise<ExpertReview | null>;
  decide(observationId: string, d: { decision: ReviewDecision; correctedCategories?: Observation["categories"]; publicNote?: string; internalNote?: string; reasonCode?: string; duplicateOfId?: string; draft?: boolean }): Promise<ExpertReview>;
  assign(observationId: string, reviewerId: string): Promise<ExpertReview>;
}
export interface NotificationService { list(): Promise<AppNotification[]>; markRead(id: string | "all"): Promise<void> }
export interface AuthService { current(): Promise<User>; switchRole(r: Role, passcode?: string): Promise<User> }

// ---------- Mock implementation ----------
const delay = <T,>(v: T, ms = 350) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), simulate.slow ? ms * 6 : ms));
const store = { obs: [...db.observations], photos: [...db.photos], analyses: [...db.analyses], reviews: [...db.reviews], timeline: [...db.timeline], notes: [...db.notifications], idem: new Map<string, string>(), audit: [] as AuditEntry[], history: [] as AIAnalysisVersion[] };
let seq = 2042;
let user: User = { id: "u-demo", displayName: "Demo Citizen", email: "demo@example.org", role: "citizen" };
const names: Record<Role, string> = { citizen: "Demo Citizen", expert: "Demo Reviewer", researcher: "Demo Researcher", admin: "Demo Admin" };
const event = (observationId: string, type: TimelineEvent["type"], label: string, detail?: string) =>
  store.timeline.push({ id: uuid(), observationId, at: new Date().toISOString(), type, label, detail });

const audit = (observationId: string, action: AuditEntry["action"], detail?: string, changes?: AuditEntry["changes"]) =>
  store.audit.push({ id: uuid(), observationId, at: new Date().toISOString(), actorId: user.id, actorRole: user.role, action, detail, changes });
// Seed the audit log from the demo data so older reports are not empty.
db.observations.forEach((o) => {
  store.audit.push({ id: `A-sub-${o.id}`, observationId: o.id, at: o.createdAt, actorId: o.submittedBy ?? "u-other", actorRole: "citizen", action: "submitted" });
  const r = db.reviews.find((x) => x.observationId === o.id);
  if (r?.decision) store.audit.push({ id: `A-rev-${o.id}`, observationId: o.id, at: r.reviewedAt ?? o.updatedAt, actorId: r.reviewerId ?? "u-expert", actorRole: "expert", action: "review_decided", detail: r.decision.replace(/_/g, " ") });
});
const EDITABLE: ObservationStatus[] = ["submitted", "awaiting_review", "more_information_requested", "analysis_completed"];

const decisionStatus: Record<ReviewDecision, ObservationStatus> = { confirmed: "verified", corrected: "corrected", not_supported: "not_verified", more_information_required: "more_information_requested", duplicate: "not_verified", rejected: "not_verified" };

const mock = {
  observations: {
    async list(q = {}) {
      let r = store.obs.filter((o) => o.status !== "draft");
      if (q.search) { const s = q.search.toLowerCase(); r = r.filter((o) => [o.id, o.description, o.location.placeName].join(" ").toLowerCase().includes(s)); }
      if (q.categories?.length) r = r.filter((o) => o.categories.some((c) => q.categories!.includes(c)));
      if (q.statuses?.length) r = r.filter((o) => q.statuses!.includes(o.status));
      if (q.siteId) r = r.filter((o) => o.location.siteId === q.siteId);
      if (q.submittedBy) r = r.filter((o) => o.submittedBy === q.submittedBy);
      if (q.from) r = r.filter((o) => o.createdAt >= q.from!);
      if (q.to) r = r.filter((o) => o.createdAt <= q.to!);
      r.sort((a, b) => (q.sort === "oldest" ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
      // Strip reporter identity from public lists except own reports.
      return delay(r.map((o) => ({ ...o, submittedBy: o.submittedBy === user.id ? o.submittedBy : undefined })));
    },
    async getById(id) {
      const o = store.obs.find((x) => x.id === id);
      if (!o) throw new ApiError("not_found", "We could not find that observation.");
      return delay({ ...o, submittedBy: o.submittedBy === user.id ? o.submittedBy : undefined });
    },
    async create(input) {
      const existing = store.idem.get(input.idempotencyKey);
      if (existing) return delay(store.obs.find((o) => o.id === existing)!);
      if (simulate.uploadError) { await delay(null, 600); throw new ApiError("server", "The photo could not be uploaded."); }
      const id = `OBS-${seq++}`;
      const ts = new Date().toISOString();
      const photoIds: string[] = [];
      if (input.photo) {
        const pid = `P-${id}`;
        store.photos.push({ id: pid, observationId: id, filename: input.photo.file.name, mimeType: input.photo.file.type, sizeBytes: input.photo.file.size, previewUrl: input.photo.previewUrl, uploadedAt: ts, qualityStatus: input.photo.qualityStatus });
        photoIds.push(pid);
      }
      let aiAnalysisId: string | undefined;
      if (input.analysis) { aiAnalysisId = `AI-${id}`; store.analyses.push({ ...input.analysis, id: aiAnalysisId, observationId: id }); }
      const o: Observation = { id, createdAt: ts, updatedAt: ts, observedAt: input.observedAt, location: input.location, photoIds, categories: input.categories, description: input.description, status: "awaiting_review", aiAnalysisId, submittedBy: user.id, seenBefore: input.seenBefore };
      store.obs.unshift(o);
      store.idem.set(input.idempotencyKey, id);
      event(id, "submitted", "Observation submitted");
      audit(id, "submitted");
      if (input.analysis) {
        event(id, input.analysis.status === "completed" ? "analysis_completed" : "analysis_failed", input.analysis.status === "completed" ? "Image analysis completed" : "Image analysis unavailable");
        if (input.analysis.findings.some((f) => f.citizenAssessment)) event(id, "feedback_recorded", "Citizen feedback recorded");
      }
      store.notes.unshift({ id: uuid(), type: "submitted", title: "Observation submitted", body: `${id} was received and is awaiting review.`, createdAt: ts, read: false, observationId: id });
      return delay(o, 900);
    },
    async update(id, input) {
      const o = store.obs.find((x) => x.id === id)!;
      Object.assign(o, input, { updatedAt: new Date().toISOString() });
      if (input.description) event(id, "status_updated", "Additional information added by reporter");
      return delay(o);
    },
    async edit(id, input) {
      const o = store.obs.find((x) => x.id === id);
      if (!o) throw new ApiError("not_found", "We could not find that observation.");
      if (o.submittedBy !== user.id) throw new ApiError("forbidden", "Only the reporter can edit this report.");
      if (!EDITABLE.includes(o.status)) throw new ApiError("invalid", "This report can no longer be edited because it is being or has been reviewed. You can withdraw it or add information if a reviewer asks.");
      if (input.categories && !input.categories.length) throw new ApiError("invalid", "Choose at least one category.");
      const changes: NonNullable<AuditEntry["changes"]> = [];
      if (input.description !== undefined && input.description !== (o.description ?? "")) { changes.push({ field: "description", from: o.description, to: input.description }); o.description = input.description || undefined; }
      if (input.categories && input.categories.join() !== o.categories.join()) { changes.push({ field: "categories", from: o.categories.join(", "), to: input.categories.join(", ") }); o.categories = input.categories; }
      if (changes.length) { o.editedAt = o.updatedAt = new Date().toISOString(); event(id, "status_updated", "Report edited by reporter"); audit(id, "edited", "Reporter edited the report", changes); }
      return delay(o);
    },
    async withdraw(id, reason) {
      const o = store.obs.find((x) => x.id === id);
      if (!o) throw new ApiError("not_found", "We could not find that observation.");
      if (o.submittedBy !== user.id) throw new ApiError("forbidden", "Only the reporter can withdraw this report.");
      if (o.status === "withdrawn") return delay(o);
      if (o.status === "verified" || o.status === "corrected") throw new ApiError("invalid", "An expert has already verified this report, so it can’t be withdrawn here. Please contact the reviewers.");
      const from = o.status;
      o.status = "withdrawn"; o.withdrawnAt = o.updatedAt = new Date().toISOString();
      event(id, "status_updated", "Report withdrawn by reporter", reason);
      audit(id, "withdrawn", reason, [{ field: "status", from, to: "withdrawn" }]);
      return delay(o);
    },
    async photos(ids) { return delay(store.photos.filter((p) => ids.includes(p.id)), 100); },
    async timeline(id) { return delay(store.timeline.filter((t) => t.observationId === id).sort((a, b) => a.at.localeCompare(b.at))); },
  } satisfies ObservationService,

  ai: {
    async checkQuality(file) {
      // Real heuristic in the browser: average luminance via canvas. Backend will replace this.
      try {
        const bmp = await createImageBitmap(file);
        const c = document.createElement("canvas"); c.width = 32; c.height = 32;
        const ctx = c.getContext("2d")!; ctx.drawImage(bmp, 0, 0, 32, 32);
        const d = ctx.getImageData(0, 0, 32, 32).data;
        let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        await delay(null, 900);
        return { status: sum / 1024 < 45 ? "dark" : "accepted" };
      } catch { return { status: "unavailable" }; }
    },
    async analyze(_file: File) {
      await delay(null, 1600);
      if (simulate.aiFailure) return { id: uuid(), status: "failed", findings: [], message: "AI analysis is temporarily unavailable. You can continue without it." };
      const findings: AIFinding[] = [
        { id: uuid(), category: "litter", label: "Possible litter detected", explanation: "AI detected visual features that may be consistent with litter. Please check the image and tell us whether this looks correct.", boundingBox: { x: 0.38, y: 0.52, width: 0.26, height: 0.22, coordinateSpace: "normalized" } },
        { id: uuid(), category: "discoloration", label: "Possible unusual water color", explanation: "Part of the water surface has a color that may differ from typical clear water. Lighting and sediment can look similar.", boundingBox: { x: 0.08, y: 0.25, width: 0.4, height: 0.3, coordinateSpace: "normalized" } },
      ];
      return { id: uuid(), status: "completed", modelName: "aqualens-visual-screening (mock)", modelVersion: "0.0-demo", analyzedAt: new Date().toISOString(), findings };
    },
    async getForObservation(id) { return delay(store.analyses.find((a) => a.observationId === id) ?? null); },
    async feedback(aid, fid, a) { const f = store.analyses.find((x) => x.id === aid)?.findings.find((x) => x.id === fid); if (f) f.citizenAssessment = a; return delay(undefined); },
    async history(id) { return delay(store.history.filter((h) => h.observationId === id).sort((a, b) => b.version - a.version)); },
    async saveReanalysis(id, analysis) {
      const i = store.analyses.findIndex((a) => a.observationId === id);
      const prev = i >= 0 ? store.analyses[i] : undefined;
      const version = store.history.filter((h) => h.observationId === id).length + 1;
      if (prev) store.history.push({ ...structuredClone(prev), version, supersededAt: new Date().toISOString() });
      const fresh: AIAnalysis = { ...analysis, id: `AI-${id}-v${version + 1}`, observationId: id };
      if (i >= 0) store.analyses[i] = fresh; else store.analyses.push(fresh);
      const o = store.obs.find((x) => x.id === id); if (o) o.aiAnalysisId = fresh.id;
      event(id, fresh.status === "completed" ? "analysis_completed" : "analysis_failed", fresh.status === "completed" ? "Image re-analysed" : "Image re-analysis unavailable");
      audit(id, "reanalysed", fresh.status === "completed" ? `${fresh.findings.length} finding(s); previous analysis kept in history` : "Re-analysis failed; previous analysis kept");
      return delay(fresh);
    },
  } satisfies AIAnalysisService,

  audit: {
    async list(id) {
      if (user.role !== "expert" && user.role !== "admin") throw new ApiError("forbidden", "The audit log is limited to reviewers.");
      return delay(store.audit.filter((a) => a.observationId === id).sort((a, b) => b.at.localeCompare(a.at)), 150);
    },
  } satisfies AuditService,

  sites: {
    async list() { return delay(db.sites); },
    async getById(id) { const s = db.sites.find((x) => x.id === id); if (!s) throw new ApiError("not_found", "Site not found."); return delay(s); },
  } satisfies SiteService,

  environment: {
    async indicators(siteId) { if (simulate.environmentError) { await delay(null); throw new ApiError("server", "Environmental data could not be refreshed."); } return delay(db.indicators.filter((i) => i.siteId === siteId).map((i) => withFreshness(i))); },
    async forecast(siteId) { if (simulate.environmentError) { await delay(null); throw new ApiError("server", "Environmental data could not be refreshed."); } return delay(db.outlook(siteId)); },
    history,
  } satisfies EnvironmentalService,

  reviews: {
    async list() { return delay(store.reviews); },
    async getForObservation(id) { const r = store.reviews.find((x) => x.observationId === id) ?? null; return delay(r && user.role === "citizen" ? { ...r, internalNote: undefined } : r); },
    async assign(observationId, reviewerId) {
      let r = store.reviews.find((x) => x.observationId === observationId);
      if (!r) { r = { id: `R-${observationId}`, observationId, status: "assigned" }; store.reviews.push(r); }
      r.reviewerId = reviewerId; r.status = "in_progress";
      const o = store.obs.find((x) => x.id === observationId)!; o.status = "under_review"; o.reviewId = r.id;
      event(observationId, "review_started", "Expert review started");
      audit(observationId, "review_assigned", `Assigned to ${reviewerId}`);
      return delay(r);
    },
    async decide(observationId, d) {
      if (user.role !== "expert" && user.role !== "admin") throw new ApiError("forbidden", "You do not have permission to review.");
      if (d.decision === "duplicate" && !d.draft) {
        if (!d.duplicateOfId) throw new ApiError("invalid", "Enter the ID of the observation this duplicates.");
        if (d.duplicateOfId === observationId) throw new ApiError("invalid", "An observation can’t be a duplicate of itself.");
        if (!store.obs.some((x) => x.id === d.duplicateOfId)) throw new ApiError("invalid", `We couldn’t find ${d.duplicateOfId}.`);
      }
      let r = store.reviews.find((x) => x.observationId === observationId);
      if (!r) { r = { id: `R-${observationId}`, observationId, status: "in_progress" }; store.reviews.push(r); }
      Object.assign(r, { duplicateOfId: d.decision === "duplicate" ? d.duplicateOfId : undefined, decision: d.decision, correctedCategories: d.correctedCategories, publicNote: d.publicNote, internalNote: d.internalNote, reasonCode: d.reasonCode, reviewerId: user.id });
      const o = store.obs.find((x) => x.id === observationId)!;
      o.reviewId = r.id;
      if (d.draft) { r.status = "in_progress"; o.status = "under_review"; event(observationId, "review_started", "Review draft saved"); audit(observationId, "review_draft_saved", d.decision.replace(/_/g, " ")); return delay(r); }
      const prevStatus = o.status;
      r.status = "completed"; r.reviewedAt = new Date().toISOString();
      o.status = decisionStatus[d.decision]; o.updatedAt = r.reviewedAt;
      if (d.decision === "more_information_required") { r.status = "in_progress"; event(observationId, "information_requested", "Additional information requested", d.publicNote); }
      else event(observationId, "status_updated", "Verification status updated", d.publicNote);
      if (d.decision === "duplicate") { event(observationId, "status_updated", `Marked as duplicate of ${d.duplicateOfId}`); audit(observationId, "duplicate_flagged", `Duplicate of ${d.duplicateOfId}`); }
      audit(observationId, d.decision === "more_information_required" ? "information_requested" : "review_decided", d.decision.replace(/_/g, " "), [{ field: "status", from: prevStatus, to: o.status }, ...(d.correctedCategories ? [{ field: "categories", to: d.correctedCategories.join(", ") }] : []), ...(d.reasonCode ? [{ field: "reason", to: d.reasonCode }] : [])]);
      store.notes.unshift({ id: uuid(), type: d.decision === "more_information_required" ? "info_requested" : "review_completed", title: d.decision === "more_information_required" ? "More information requested" : "Review completed", body: `${observationId}: ${d.publicNote || "Status updated."}`, createdAt: r.reviewedAt, read: false, observationId });
      return delay(r);
    },
  } satisfies ReviewService,

  notifications: {
    async list() { return delay(store.notes.filter((n) => n.type !== "system" || user.role !== "citizen")); },
    async markRead(id) { store.notes.forEach((n) => { if (id === "all" || n.id === id) n.read = true; }); return delay(undefined, 100); },
  } satisfies NotificationService,

  auth: {
    async current() { return delay(user, 50); },
    async switchRole(role, passcode) { await enterRole(role, passcode); user = { ...user, role, displayName: names[role] }; return delay(user, 50); },
  } satisfies AuthService,
};

// ---------- HTTP implementation (proposed contracts; align with backend before use) ----------
const q = (o: object) => "?" + new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])).toString();
const http = {
  observations: {
    list: (p = {}) => apiRequest(`/observations${q(p)}`),
    getById: (id) => apiRequest(`/observations/${id}`),
    create: (i) => apiRequest(`/observations`, { method: "POST", body: JSON.stringify({ ...i, photo: undefined }), idempotencyKey: i.idempotencyKey }),
    update: (id, i) => apiRequest(`/observations/${id}`, { method: "PATCH", body: JSON.stringify(i) }),
    photos: (ids) => apiRequest(`/photos${q({ ids: ids.join(",") })}`),
    timeline: (id) => apiRequest(`/observations/${id}/timeline`),
    edit: (id, i) => apiRequest(`/observations/${id}`, { method: "PATCH", body: JSON.stringify(i) }),
    withdraw: (id, reason) => apiRequest(`/observations/${id}/withdraw`, { method: "POST", body: JSON.stringify({ reason }) }),
  } satisfies ObservationService,
  ai: {
    checkQuality: async (_file: File) => ({ status: "unavailable" as const }),
    analyze: async (_file: File) => ({ id: "", status: "unavailable" as const, findings: [] }),
    getForObservation: (id) => apiRequest(`/observations/${id}/analysis`),
    feedback: (aid, fid, a) => apiRequest(`/observations/${aid}/feedback`, { method: "POST", body: JSON.stringify({ findingId: fid, assessment: a }) }),
    history: (id) => apiRequest(`/observations/${id}/analysis/history`),
    saveReanalysis: (id, a) => apiRequest(`/observations/${id}/analysis`, { method: "POST", body: JSON.stringify(a) }),
  } satisfies AIAnalysisService,
  audit: { list: (id) => apiRequest(`/observations/${id}/audit`) } satisfies AuditService,
  sites: { list: () => apiRequest(`/sites`), getById: (id) => apiRequest(`/sites/${id}`) } satisfies SiteService,
  environment: { indicators: (id) => apiRequest(`/sites/${id}/environment`), forecast: (id) => apiRequest(`/environment/forecast${q({ siteId: id })}`), history } satisfies EnvironmentalService,
  reviews: {
    list: () => apiRequest(`/reviews`),
    getForObservation: (id) => apiRequest(`/reviews/${id}`),
    decide: (id, d) => apiRequest(`/reviews/${id}/decision`, { method: "POST", body: JSON.stringify(d) }),
    assign: (id, r) => apiRequest(`/reviews/${id}/assign`, { method: "POST", body: JSON.stringify({ reviewerId: r }) }),
  } satisfies ReviewService,
  notifications: { list: () => apiRequest(`/notifications`), markRead: (id) => apiRequest(`/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ read: true }) }) } satisfies NotificationService,
  auth: { current: () => apiRequest(`/auth/me`), switchRole: () => Promise.reject(new ApiError("forbidden", "Role switching is demo-only.")) } satisfies AuthService,
};

export interface Api {
  observations: ObservationService;
  ai: AIAnalysisService;
  sites: SiteService;
  environment: EnvironmentalService;
  reviews: ReviewService;
  notifications: NotificationService;
  auth: AuthService;
  audit: AuditService;
}

// ---------- Supabase implementation (see src/services/supabase.ts) ----------
// Image quality check + analysis: Gemini when NEXT_PUBLIC_AI_PROVIDER=gemini, otherwise the in-browser demo stub.
const imageAi = config.aiProvider === "gemini" ? geminiAi : { checkQuality: mock.ai.checkQuality, analyze: mock.ai.analyze };
const supabaseApi = createSupabaseApi(imageAi);

const base: Api = config.dataSource === "supabase" ? supabaseApi : config.dataSource === "http" ? http : mock;
export const api: Api = { ...base, ai: { ...base.ai, ...imageAi } };
export { ApiError };
