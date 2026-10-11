// Supabase implementation of the service interfaces. No authentication: the browser talks to
// Supabase with the public anon key, and "who is the user" comes from services/identity.ts.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AIAnalysis, AIAnalysisVersion, AuditEntry, AppNotification, CitizenAssessment, CreateObservationInput, EnvironmentalIndicator, ExpertReview,
  MonitoringSite, Observation, ObservationPhoto, ObservationQuery, Role, TimelineEvent, User,
} from "@/types";
import type { AIAnalysisService, AuditService, AuthService, EnvironmentalService, NotificationService, ObservationService, ReviewService, SiteService } from "./index";
import { ApiError } from "./apiClient";
import { config } from "./config";
import { enterRole, getUser, setRole } from "./identity";
import archive from "@/data/discharge-history.json";
import type { DischargePoint } from "@/types";
import { withFreshness } from "@/utils/freshness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    if (!config.supabase.url || !config.supabase.anonKey) {
      throw new ApiError("server", "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
    }
    client = createClient(config.supabase.url, config.supabase.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  return client;
}

function fail(e: { code?: string; message?: string }): never {
  if (e.code === "PGRST116" || e.code === "P0002") throw new ApiError("not_found", "We could not find that record.");
  if (e.code === "42501") throw new ApiError("forbidden", "You do not have permission to do this.");
  if (/fetch|network/i.test(e.message ?? "")) throw new ApiError("network", "Network unavailable. Check your connection.");
  if (e.code === "42P01" || e.code === "PGRST205") throw new ApiError("server", "Database tables are missing. Run supabase/schema.sql in the Supabase SQL editor.");
  console.error("[supabase]", e);
  throw new ApiError("server", "Something went wrong on our side. Try again.");
}
function ok<T>(r: { data: T | null; error: { code?: string; message?: string } | null }): T {
  if (r.error) fail(r.error);
  return r.data as T;
}

// ---------- Row → type mappers ----------
const undef = <T,>(v: T | null | undefined): T | undefined => v ?? undefined;
const firstId = (v: unknown): string | undefined => (Array.isArray(v) ? v[0]?.id : (v as Row | null)?.id) ?? undefined;

const OBS_SELECT = "*, photos(id), ai_analyses(id), expert_reviews(id)";
const toObservation = (r: Row, viewerId: string): Observation => ({
  id: r.id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  observedAt: undef(r.observed_at),
  location: { latitude: undef(r.latitude), longitude: undef(r.longitude), siteId: undef(r.site_id), placeName: undef(r.place_name), precision: r.location_precision },
  photoIds: ((r.photos ?? []) as Row[]).map((p) => p.id),
  categories: r.categories ?? [],
  description: undef(r.description),
  status: r.status,
  aiAnalysisId: firstId(r.ai_analyses),
  reviewId: firstId(r.expert_reviews),
  // Reporter identity is only returned to the reporter themselves.
  submittedBy: r.submitted_by === viewerId ? r.submitted_by : undefined,
  seenBefore: undef(r.seen_before),
  editedAt: undef(r.edited_at),
  withdrawnAt: undef(r.withdrawn_at),
});

const toPhoto = (r: Row): ObservationPhoto => ({
  id: r.id, observationId: undef(r.observation_id), filename: r.filename, mimeType: r.mime_type, sizeBytes: Number(r.size_bytes),
  previewUrl: r.url, uploadedUrl: r.url, uploadedAt: undef(r.uploaded_at), width: undef(r.width), height: undef(r.height), qualityStatus: undef(r.quality_status),
});

const toAnalysis = (r: Row): AIAnalysis => ({
  id: r.id, observationId: undef(r.observation_id), status: r.status, modelName: undef(r.model_name), modelVersion: undef(r.model_version),
  analyzedAt: undef(r.analyzed_at), findings: r.findings ?? [], message: undef(r.message),
});

const toReview = (r: Row, canSeeInternal: boolean): ExpertReview => ({
  id: r.id, observationId: r.observation_id, reviewerId: undef(r.reviewer_id), status: r.status, decision: undef(r.decision),
  correctedCategories: undef(r.corrected_categories), publicNote: undef(r.public_note),
  internalNote: canSeeInternal ? undef(r.internal_note) : undefined, reasonCode: undef(r.reason_code), duplicateOfId: undef(r.duplicate_of), reviewedAt: undef(r.reviewed_at),
});

const toSite = (r: Row): MonitoringSite => ({
  id: r.id, name: r.name, city: undef(r.city), latitude: undef(r.latitude), longitude: undef(r.longitude), waterbodyName: undef(r.waterbody_name), siteType: undef(r.site_type),
  upstreamSiteIds: r.upstream_site_ids ?? [], downstreamSiteIds: r.downstream_site_ids ?? [], lastUpdatedAt: undef(r.last_updated_at),
  dataAvailability: undef(r.data_availability), monitoringPriority: undef(r.monitoring_priority), priorityClass: undef(r.priority_class), priorityScore: undef(r.priority_score), hasSensor: r.has_sensor,
});

const toIndicator = (r: Row): EnvironmentalIndicator => withFreshness({
  id: r.id, siteId: r.site_id, name: r.name, value: undef(r.value), unit: undef(r.unit), level: undef(r.level), description: undef(r.description),
  source: undef(r.source), observedAt: undef(r.observed_at), issuedAt: undef(r.issued_at), validFrom: undef(r.valid_from), validTo: undef(r.valid_to),
  dataStatus: r.data_status, limitations: r.limitations ?? [], kind: r.kind,
});


const toAudit = (r: Row): AuditEntry => ({ id: r.id, observationId: r.observation_id, at: r.at, actorId: r.actor_id, actorRole: r.actor_role, action: r.action, detail: undef(r.detail), changes: undef(r.changes) });
const writeAudit = async (observationId: string, action: AuditEntry["action"], detail?: string, changes?: AuditEntry["changes"]) => {
  const me = getUser();
  const { error } = await sb().from("audit_log").insert({ observation_id: observationId, actor_id: me.id, actor_role: me.role, action, detail: detail ?? null, changes: changes ?? null });
  if (error) console.error("[supabase] audit", error); // never block the user action on an audit failure
};
const EDITABLE = ["submitted", "awaiting_review", "more_information_requested", "analysis_completed"];
const toTimeline = (r: Row): TimelineEvent => ({ id: r.id, observationId: r.observation_id, at: r.at, type: r.type, label: r.label, detail: undef(r.detail) });
const toNotification = (r: Row): AppNotification => ({ id: r.id, type: r.type, title: r.title, body: r.body, createdAt: r.created_at, read: r.read, observationId: undef(r.observation_id) });

const canSeeInternal = (role: Role) => role !== "citizen";
const forThisUser = (id: string) => `user_id.is.null,user_id.eq.${id}`;

// ---------- Service ----------
export function createSupabaseApi(ai: Pick<AIAnalysisService, "checkQuality" | "analyze">) {
  const observations: ObservationService = {
    async list(q: ObservationQuery = {}) {
      const me = getUser();
      let query = sb().from("observations").select(OBS_SELECT).neq("status", "draft");
      if (q.search) {
        const s = q.search.replace(/[%,()*]/g, " ").trim();
        if (s) query = query.or(`id.ilike.%${s}%,description.ilike.%${s}%,place_name.ilike.%${s}%`);
      }
      if (q.categories?.length) query = query.overlaps("categories", q.categories);
      if (q.statuses?.length) query = query.in("status", q.statuses);
      if (q.siteId) query = query.eq("site_id", q.siteId);
      if (q.submittedBy) query = query.eq("submitted_by", q.submittedBy);
      if (q.from) query = query.gte("created_at", q.from);
      if (q.to) query = query.lte("created_at", q.to);
      const rows = ok(await query.order("created_at", { ascending: q.sort === "oldest" }).limit(1000));
      return (rows as Row[]).map((r) => toObservation(r, me.id));
    },

    async getById(id) {
      const row = ok<Row>(await sb().from("observations").select(OBS_SELECT).eq("id", id).single());
      return toObservation(row, getUser().id);
    },

    async create(input: CreateObservationInput) {
      const me = getUser();
      let photo: Row | undefined;

      if (input.photo) {
        const file = input.photo.file;
        const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80) || "photo";
        const path = `${input.idempotencyKey}/${safe}`; // same key → same path, so retries don't duplicate
        const up = await sb().storage.from(config.supabase.photoBucket).upload(path, file, { contentType: file.type, upsert: false });
        if (up.error && !/already exists|duplicate/i.test(up.error.message)) {
          console.error("[supabase] upload", up.error);
          throw new ApiError("server", "The photo could not be uploaded.");
        }
        const url = sb().storage.from(config.supabase.photoBucket).getPublicUrl(path).data.publicUrl;
        photo = { filename: file.name, mime_type: file.type, size_bytes: file.size, storage_path: path, url, quality_status: input.photo.qualityStatus };
      }

      const a = input.analysis;
      const id = ok(await sb().rpc("create_observation", {
        p: {
          idempotency_key: input.idempotencyKey,
          submitted_by: me.id,
          observed_at: input.observedAt ?? null,
          latitude: input.location.latitude ?? null,
          longitude: input.location.longitude ?? null,
          site_id: input.location.siteId ?? null,
          place_name: input.location.placeName ?? null,
          location_precision: input.location.precision,
          categories: input.categories,
          description: input.description ?? null,
          seen_before: input.seenBefore ?? null,
          photo: photo ?? null,
          analysis: a ? { status: a.status, model_name: a.modelName ?? null, model_version: a.modelVersion ?? null, analyzed_at: a.analyzedAt ?? null, findings: a.findings, message: a.message ?? null } : null,
        },
      })) as string;
      await writeAudit(id, "submitted");
      return observations.getById(id);
    },

    async update(id, input) {
      const row = ok<Row>(await sb().from("observations").update(input).eq("id", id).select(OBS_SELECT).single());
      if (input.description) {
        ok(await sb().from("timeline_events").insert({ observation_id: id, type: "status_updated", label: "Additional information added by reporter" }));
      }
      return toObservation(row, getUser().id);
    },

    async edit(id, input) {
      const me = getUser();
      const cur = ok<Row>(await sb().from("observations").select("*").eq("id", id).single());
      if (cur.submitted_by !== me.id) throw new ApiError("forbidden", "Only the reporter can edit this report.");
      if (!EDITABLE.includes(cur.status)) throw new ApiError("invalid", "This report can no longer be edited because it is being or has been reviewed. You can withdraw it or add information if a reviewer asks.");
      if (input.categories && !input.categories.length) throw new ApiError("invalid", "Choose at least one category.");
      const changes: NonNullable<AuditEntry["changes"]> = [];
      const patch: Row = {};
      if (input.description !== undefined && input.description !== (cur.description ?? "")) { changes.push({ field: "description", from: cur.description ?? undefined, to: input.description }); patch.description = input.description || null; }
      if (input.categories && input.categories.join() !== (cur.categories ?? []).join()) { changes.push({ field: "categories", from: (cur.categories ?? []).join(", "), to: input.categories.join(", ") }); patch.categories = input.categories; }
      if (!changes.length) return observations.getById(id);
      const now = new Date().toISOString();
      const row = ok<Row>(await sb().from("observations").update({ ...patch, edited_at: now, updated_at: now }).eq("id", id).select(OBS_SELECT).single());
      ok(await sb().from("timeline_events").insert({ observation_id: id, type: "status_updated", label: "Report edited by reporter" }));
      await writeAudit(id, "edited", "Reporter edited the report", changes);
      return toObservation(row, me.id);
    },
    async withdraw(id, reason) {
      const me = getUser();
      const cur = ok<Row>(await sb().from("observations").select("*").eq("id", id).single());
      if (cur.submitted_by !== me.id) throw new ApiError("forbidden", "Only the reporter can withdraw this report.");
      if (cur.status === "withdrawn") return observations.getById(id);
      if (cur.status === "verified" || cur.status === "corrected") throw new ApiError("invalid", "An expert has already verified this report, so it can’t be withdrawn here. Please contact the reviewers.");
      const now = new Date().toISOString();
      const row = ok<Row>(await sb().from("observations").update({ status: "withdrawn", withdrawn_at: now, updated_at: now }).eq("id", id).select(OBS_SELECT).single());
      ok(await sb().from("timeline_events").insert({ observation_id: id, type: "status_updated", label: "Report withdrawn by reporter", detail: reason ?? null }));
      await writeAudit(id, "withdrawn", reason, [{ field: "status", from: cur.status, to: "withdrawn" }]);
      return toObservation(row, me.id);
    },

    async photos(ids) {
      if (!ids.length) return [];
      return (ok(await sb().from("photos").select("*").in("id", ids)) as Row[]).map(toPhoto);
    },

    async timeline(id) {
      return (ok(await sb().from("timeline_events").select("*").eq("observation_id", id).order("at", { ascending: true })) as Row[]).map(toTimeline);
    },
  };

  const aiService: AIAnalysisService = {
    // No real vision model is connected yet: these two keep the existing in-browser demo behaviour.
    checkQuality: ai.checkQuality,
    analyze: ai.analyze,

    async getForObservation(observationId) {
      const row = ok<Row | null>(await sb().from("ai_analyses").select("*").eq("observation_id", observationId).maybeSingle());
      return row ? toAnalysis(row as Row) : null;
    },

    async feedback(analysisId: string, findingId: string, assessment: CitizenAssessment) {
      const row = ok(await sb().from("ai_analyses").select("findings").eq("id", analysisId).single()) as Row;
      const findings = ((row.findings ?? []) as Row[]).map((f) => (f.id === findingId ? { ...f, citizenAssessment: assessment } : f));
      ok(await sb().from("ai_analyses").update({ findings }).eq("id", analysisId));
    },

    async history(observationId) {
      const rows = ok(await sb().from("ai_analysis_history").select("*").eq("observation_id", observationId).order("version", { ascending: false })) as Row[];
      return rows.map((r): AIAnalysisVersion => ({ ...toAnalysis({ ...r, id: r.id }), version: r.version, supersededAt: undef(r.superseded_at) }));
    },
    async saveReanalysis(observationId, a) {
      const prev = ok<Row | null>(await sb().from("ai_analyses").select("*").eq("observation_id", observationId).maybeSingle());
      const row = { status: a.status, model_name: a.modelName ?? null, model_version: a.modelVersion ?? null, analyzed_at: a.analyzedAt ?? null, findings: a.findings, message: a.message ?? null };
      if (prev) {
        const n = ok(await sb().from("ai_analysis_history").select("id", { count: "exact", head: false }).eq("observation_id", observationId)) as Row[];
        ok(await sb().from("ai_analysis_history").insert({ observation_id: observationId, version: n.length + 1, status: prev.status, model_name: prev.model_name, model_version: prev.model_version, analyzed_at: prev.analyzed_at, findings: prev.findings ?? [], message: prev.message }));
        ok(await sb().from("ai_analyses").update(row).eq("id", prev.id));
      } else {
        ok(await sb().from("ai_analyses").insert({ ...row, observation_id: observationId, id: `AI-${observationId}` }));
      }
      ok(await sb().from("timeline_events").insert({ observation_id: observationId, type: a.status === "completed" ? "analysis_completed" : "analysis_failed", label: a.status === "completed" ? "Image re-analysed" : "Image re-analysis unavailable" }));
      await writeAudit(observationId, "reanalysed", a.status === "completed" ? `${a.findings.length} finding(s); previous analysis kept in history` : "Re-analysis failed; previous analysis kept");
      return (await aiService.getForObservation(observationId))!;
    },
  };

  const auditService: AuditService = {
    async list(observationId) {
      if (!canSeeInternal(getUser().role)) throw new ApiError("forbidden", "The audit log is limited to reviewers.");
      return (ok(await sb().from("audit_log").select("*").eq("observation_id", observationId).order("at", { ascending: false })) as Row[]).map(toAudit);
    },
  };

  const sites: SiteService = {
    async list() { return (ok(await sb().from("sites").select("*").order("id")) as Row[]).map(toSite); },
    async getById(id) { return toSite(ok(await sb().from("sites").select("*").eq("id", id).single()) as Row); },
  };

  const environment: EnvironmentalService = {
    async indicators(siteId) { return (ok(await sb().from("environmental_indicators").select("*").eq("site_id", siteId).order("id")) as Row[]).map(toIndicator); },
    async forecast(siteId) {
      const rows = ok(await sb().from("discharge_series").select("date, observed, forecast").eq("site_id", siteId).order("date")) as Row[];
      return rows.map((r) => ({ date: r.date as string, observed: (r.observed ?? null) as number | null, forecast: (r.forecast ?? null) as number | null }));
    },
    async history(siteId) { return (archive.sites as Record<string, DischargePoint[]>)[siteId]?.slice() ?? []; },
  };

  const reviews: ReviewService = {
    async list() {
      const internal = canSeeInternal(getUser().role);
      return (ok(await sb().from("expert_reviews").select("*")) as Row[]).map((r) => toReview(r, internal));
    },
    async getForObservation(observationId) {
      const row = ok<Row | null>(await sb().from("expert_reviews").select("*").eq("observation_id", observationId).maybeSingle());
      return row ? toReview(row as Row, canSeeInternal(getUser().role)) : null;
    },
    async assign(observationId, reviewerId) {
      ok(await sb().rpc("assign_review", { p_observation_id: observationId, p_reviewer_id: reviewerId }));
      await writeAudit(observationId, "review_assigned", `Assigned to ${reviewerId}`);
      return (await reviews.getForObservation(observationId))!;
    },
    async decide(observationId, d) {
      const me = getUser();
      if (me.role !== "expert" && me.role !== "admin") throw new ApiError("forbidden", "You do not have permission to review.");
      if (d.decision === "duplicate" && !d.draft) {
        if (!d.duplicateOfId) throw new ApiError("invalid", "Enter the ID of the observation this duplicates.");
        if (d.duplicateOfId === observationId) throw new ApiError("invalid", "An observation can’t be a duplicate of itself.");
        const t = ok<Row | null>(await sb().from("observations").select("id").eq("id", d.duplicateOfId).maybeSingle());
        if (!t) throw new ApiError("invalid", `We couldn’t find ${d.duplicateOfId}.`);
      }
      const before = ok<Row | null>(await sb().from("observations").select("status").eq("id", observationId).maybeSingle());
      ok(await sb().rpc("decide_review", {
        p: {
          observation_id: observationId, reviewer_id: me.id, decision: d.decision, corrected_categories: d.correctedCategories ?? null,
          public_note: d.publicNote ?? null, internal_note: d.internalNote ?? null, reason_code: d.reasonCode ?? null, draft: !!d.draft,
        },
      }));
      ok(await sb().from("expert_reviews").update({ duplicate_of: d.decision === "duplicate" ? d.duplicateOfId ?? null : null }).eq("observation_id", observationId));
      const after = ok<Row | null>(await sb().from("observations").select("status").eq("id", observationId).maybeSingle());
      if (d.draft) await writeAudit(observationId, "review_draft_saved", d.decision.replace(/_/g, " "));
      else {
        if (d.decision === "duplicate") {
          ok(await sb().from("timeline_events").insert({ observation_id: observationId, type: "status_updated", label: `Marked as duplicate of ${d.duplicateOfId}` }));
          await writeAudit(observationId, "duplicate_flagged", `Duplicate of ${d.duplicateOfId}`);
        }
        await writeAudit(observationId, d.decision === "more_information_required" ? "information_requested" : "review_decided", d.decision.replace(/_/g, " "), [{ field: "status", from: before?.status, to: after?.status }, ...(d.correctedCategories ? [{ field: "categories", to: d.correctedCategories.join(", ") }] : []), ...(d.reasonCode ? [{ field: "reason", to: d.reasonCode }] : [])]);
      }
      return (await reviews.getForObservation(observationId))!;
    },
  };

  const notifications: NotificationService = {
    async list() {
      const me = getUser();
      const rows = ok(await sb().from("notifications").select("*").or(forThisUser(me.id)).order("created_at", { ascending: false })) as Row[];
      return rows.filter((n) => n.type !== "system" || me.role !== "citizen").map(toNotification);
    },
    async markRead(id) {
      const me = getUser();
      let q = sb().from("notifications").update({ read: true }).or(forThisUser(me.id));
      if (id !== "all") q = q.eq("id", id);
      ok(await q);
    },
  };

  const auth: AuthService = {
    async current(): Promise<User> { return getUser(); },
    async switchRole(role, passcode) { await enterRole(role, passcode); return setRole(role); },
  };

  return { observations, ai: aiService, sites, environment, reviews, notifications, auth, audit: auditService };
}
