export type ObservationStatus =
  | "draft" | "submitted" | "analysis_pending" | "analysis_completed" | "awaiting_review"
  | "more_information_requested" | "under_review" | "verified" | "corrected" | "not_verified" | "withdrawn";

export type ObservationCategory =
  | "litter" | "discoloration" | "foam" | "vegetation" | "oil_like_surface" | "aquatic_life_concern" | "other" | "unsure";

export type CitizenAssessment = "agree" | "disagree" | "unsure";
export type Role = "citizen" | "expert" | "researcher" | "admin";

export interface Observation {
  id: string;
  createdAt: string;
  updatedAt: string;
  observedAt?: string;
  location: { latitude?: number; longitude?: number; siteId?: string; placeName?: string; precision: "precise" | "approximate" | "unknown" };
  photoIds: string[];
  categories: ObservationCategory[];
  description?: string;
  status: ObservationStatus;
  aiAnalysisId?: string;
  environmentalContextId?: string;
  reviewId?: string;
  submittedBy?: string;
  seenBefore?: "yes" | "no" | "unsure";
  /** Set when the reporter edited the report after submitting. */
  editedAt?: string;
  withdrawnAt?: string;
}

export interface ObservationPhoto {
  id: string;
  observationId?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string;
  uploadedUrl?: string;
  uploadedAt?: string;
  width?: number;
  height?: number;
  qualityStatus?: "pending" | "accepted" | "warning" | "rejected" | "unavailable";
}

export interface AIFinding {
  id: string;
  category: ObservationCategory;
  label: string;
  explanation?: string;
  confidence?: number;
  boundingBox?: { x: number; y: number; width: number; height: number; coordinateSpace: "normalized" | "pixels" };
  citizenAssessment?: CitizenAssessment;
}

export interface AIAnalysis {
  id: string;
  observationId?: string;
  status: "pending" | "processing" | "completed" | "failed" | "unavailable";
  modelName?: string;
  modelVersion?: string;
  analyzedAt?: string;
  findings: AIFinding[];
  message?: string;
}

export interface EnvironmentalIndicator {
  id: string;
  siteId: string;
  name: string;
  value?: number;
  unit?: string;
  level?: string;
  description?: string;
  source?: string;
  observedAt?: string;
  issuedAt?: string;
  validFrom?: string;
  validTo?: string;
  dataStatus: "available" | "stale" | "missing" | "error";
  limitations?: string[];
  kind: "observed" | "forecast";
}

export interface MonitoringSite {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  waterbodyName?: string;
  siteType?: string;
  upstreamSiteIds?: string[];
  downstreamSiteIds?: string[];
  lastUpdatedAt?: string;
  dataAvailability?: string;
  monitoringPriority?: "high" | "medium" | "low" | "not_assessed";
  /** Original AquaConnect class: Very high, High, Moderate, Low, Very low or Insufficient data. */
  priorityClass?: string;
  /** AquaConnect monitoring-priority score, 0–1 (relative, screening only). */
  priorityScore?: number;
  hasSensor?: boolean;
}

export type ReviewDecision = "confirmed" | "corrected" | "not_supported" | "more_information_required" | "duplicate" | "rejected";

export interface ExpertReview {
  id: string;
  observationId: string;
  reviewerId?: string;
  status: "unassigned" | "assigned" | "in_progress" | "completed";
  decision?: ReviewDecision;
  correctedCategories?: ObservationCategory[];
  publicNote?: string;
  internalNote?: string;
  reasonCode?: string;
  /** For a "duplicate" decision: the observation that already covers this one. */
  duplicateOfId?: string;
  reviewedAt?: string;
}

export interface TimelineEvent {
  id: string;
  observationId: string;
  at: string;
  type: "submitted" | "analysis_completed" | "analysis_failed" | "feedback_recorded" | "review_started" | "status_updated" | "information_requested";
  label: string;
  detail?: string;
}

export interface AppNotification {
  id: string;
  type: "submitted" | "info_requested" | "status_changed" | "review_completed" | "system";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  observationId?: string;
}

export interface User { id: string; displayName: string; email?: string; role: Role }

export interface ObservationQuery {
  search?: string;
  categories?: ObservationCategory[];
  statuses?: ObservationStatus[];
  siteId?: string;
  from?: string;
  to?: string;
  submittedBy?: string;
  sort?: "newest" | "oldest";
}

export interface CreateObservationInput {
  location: Observation["location"];
  photo?: { file: File; previewUrl: string; qualityStatus: ObservationPhoto["qualityStatus"] };
  categories: ObservationCategory[];
  description?: string;
  observedAt?: string;
  seenBefore?: Observation["seenBefore"];
  analysis?: AIAnalysis;
  idempotencyKey: string;
}

/** One row of the reviewer-only audit log: who did what, when, and what changed. */
export interface AuditEntry {
  id: string;
  observationId: string;
  at: string;
  actorId: string;
  actorRole: Role;
  action: "submitted" | "edited" | "withdrawn" | "review_assigned" | "review_draft_saved" | "review_decided" | "information_requested" | "reanalysed" | "duplicate_flagged";
  detail?: string;
  /** Before/after values for edits and decisions. */
  changes?: { field: string; from?: string; to?: string }[];
}

/** A previous AI analysis that was replaced by a newer run. */
export interface AIAnalysisVersion extends AIAnalysis { version: number; supersededAt?: string }

export type SensorParameter = "water_temperature" | "turbidity" | "ph" | "dissolved_oxygen" | "conductivity";
export interface Sensor {
  id: string;
  name: string;
  siteId?: string;
  parameters: SensorParameter[];
  status: "active" | "maintenance" | "offline";
  registeredAt: string;
  registeredBy: string;
  /** "simulated" = generated in the browser (demo); "live" = readings arrive through the server ingest API. */
  feed: "simulated" | "live";
}
export interface SensorReading { at: string; values: Partial<Record<SensorParameter, number>> }

/** Daily summary of measured values at a site (from the server store), or of discharge gauge readings. */
export type MeasuredParameter = SensorParameter | "discharge";
export interface DailyMeasurement { date: string; mean: number; min: number; max: number; n: number }
export interface SiteMeasurements {
  siteId: string; days: number;
  source: "server" | "simulated";
  series: Partial<Record<MeasuredParameter, DailyMeasurement[]>>;
}
export interface AnomalyAlert {
  id: string;
  sensorId: string;
  parameter: SensorParameter;
  at: string;
  value: number;
  kind: "outside_range" | "sudden_change" | "no_data";
  message: string;
  severity: "watch" | "high";
}

/** One discharge value per site and day from the AquaConnect archive. */
export interface DischargePoint { date: string; value: number; status: string }
