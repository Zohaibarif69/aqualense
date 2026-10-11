// Monitoring sites, environmental indicators and the discharge outlook come from the AquaConnect snapshot
// (src/data/aquaconnect.json, built by `npm run data:import`). Citizen reports, photos, AI findings, reviews and
// notifications below are still DEMO content, placed on real sites for illustration only.
import aquaconnect from "../data/aquaconnect.json" with { type: "json" };
import type { AIAnalysis, AppNotification, EnvironmentalIndicator, ExpertReview, MonitoringSite, Observation, ObservationPhoto, TimelineEvent } from "@/types";

const now = Date.now();
export const ago = (days: number, hours = 0) => new Date(now - days * 864e5 - hours * 36e5).toISOString();
const ahead = (days: number) => new Date(now + days * 864e5).toISOString();

const u = (id: string) => `https://images.unsplash.com/${id}?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80`;
export const IMG = {
  hero: u("photo-1682965741441-b5f7776377ff"),
  rocks: u("photo-1781094066448-e6950999f834"),
  gorge: u("photo-1790838720921-71ce1ea44aea"),
  reddish: u("photo-1779182285908-39eed53617c6"),
  mossy: u("photo-1772843247857-4b4246300148"),
  clear: u("photo-1759828748061-bb740895e272"),
  fish: u("photo-1788453498593-83cbdc0fff9e"),
  shallow: u("photo-1789638720675-ccf3951e9abc"),
};

/** Where the environmental snapshot comes from and which days it covers. */
export const dataset = aquaconnect.meta;
export const sites: MonitoringSite[] = aquaconnect.sites as MonitoringSite[];

export const photos: ObservationPhoto[] = [
  ["P-1", IMG.reddish], ["P-2", IMG.rocks], ["P-3", IMG.mossy], ["P-4", IMG.shallow], ["P-5", IMG.gorge], ["P-6", IMG.clear], ["P-7", IMG.fish], ["P-8", IMG.hero], ["P-9", IMG.rocks],
].map(([id, url]) => ({ id, filename: `${id}.jpg`, mimeType: "image/jpeg", sizeBytes: 2_400_000, previewUrl: url, uploadedUrl: url, qualityStatus: "accepted" as const }));

const loc = (siteId: string, dLat = 0.004, dLng = -0.003, precision: "precise" | "approximate" = "precise") => {
  const s = sites.find((x) => x.id === siteId)!;
  return { latitude: s.latitude! + dLat, longitude: s.longitude! + dLng, siteId, placeName: s.name, precision };
};

export const observations: Observation[] = [
  { id: "OBS-2041", createdAt: ago(0, 3), updatedAt: ago(0, 3), location: loc("C3"), photoIds: ["P-1"], categories: ["discoloration"], description: "Water near the east bank looks reddish-brown, more than usual after rain.", status: "awaiting_review", aiAnalysisId: "AI-2041", submittedBy: "u-demo", seenBefore: "no" },
  { id: "OBS-2039", createdAt: ago(1, 4), updatedAt: ago(0, 20), location: loc("C6", -0.003, 0.004), photoIds: ["P-2"], categories: ["litter"], description: "Plastic bottles and a bag caught between rocks under the bridge.", status: "verified", aiAnalysisId: "AI-2039", reviewId: "R-2039", submittedBy: "u-other1" },
  { id: "OBS-2036", createdAt: ago(2, 2), updatedAt: ago(1), location: loc("C10", 0.002, 0.002, "approximate"), photoIds: ["P-3"], categories: ["vegetation"], description: "Dense green growth covering rocks along the riffle.", status: "corrected", aiAnalysisId: "AI-2036", reviewId: "R-2036", submittedBy: "u-demo" },
  { id: "OBS-2033", createdAt: ago(3, 6), updatedAt: ago(2), location: loc("C17"), photoIds: ["P-4"], categories: ["foam"], description: "White foam patches gathering at the pool below the small drop.", status: "more_information_requested", aiAnalysisId: "AI-2033", reviewId: "R-2033", submittedBy: "u-demo" },
  { id: "OBS-2030", createdAt: ago(4, 1), updatedAt: ago(4, 1), location: loc("C2", -0.002, 0.006), photoIds: ["P-5"], categories: ["oil_like_surface"], description: "Shiny rainbow film near the weir edge.", status: "awaiting_review", aiAnalysisId: "AI-2030", submittedBy: "u-other2" },
  { id: "OBS-2027", createdAt: ago(6, 5), updatedAt: ago(5), location: loc("C11"), photoIds: ["P-6"], categories: ["unsure"], description: "Water looked cloudier than last week. Not sure what it is.", status: "not_verified", aiAnalysisId: "AI-2027", reviewId: "R-2027", submittedBy: "u-other1" },
  { id: "OBS-2024", createdAt: ago(8, 3), updatedAt: ago(7), location: loc("C3", -0.006, 0.01), photoIds: ["P-7"], categories: ["aquatic_life_concern"], description: "Fish gathering at the surface in the shallows, seemed unusual.", status: "under_review", aiAnalysisId: "AI-2024", reviewId: "R-2024", submittedBy: "u-other3" },
  { id: "OBS-2019", createdAt: ago(11), updatedAt: ago(10), location: loc("C6", 0.008, -0.01), photoIds: ["P-8"], categories: ["litter", "other"], description: "Tyre partially submerged near the footpath.", status: "verified", aiAnalysisId: "AI-2019", reviewId: "R-2019", submittedBy: "u-other2" },
  { id: "OBS-2015", createdAt: ago(16), updatedAt: ago(16), location: loc("C17", -0.01, -0.012, "approximate"), photoIds: ["P-9"], categories: ["litter"], description: "Small pieces of packaging along the bank.", status: "awaiting_review", submittedBy: "u-other3" },
];

const box = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h, coordinateSpace: "normalized" as const });
const model = { modelName: "aqualens-visual-screening (mock)", modelVersion: "0.0-demo" };
export const analyses: AIAnalysis[] = [
  { id: "AI-2041", observationId: "OBS-2041", status: "completed", ...model, analyzedAt: ago(0, 3), findings: [{ id: "F-1", category: "discoloration", label: "Possible unusual discoloration", explanation: "Visual features in this area may be consistent with discolored water. Turbidity after rain can look similar.", boundingBox: box(0.15, 0.4, 0.5, 0.4), citizenAssessment: "agree" }] },
  { id: "AI-2039", observationId: "OBS-2039", status: "completed", ...model, analyzedAt: ago(1, 4), findings: [{ id: "F-2", category: "litter", label: "Possible litter detected", explanation: "Shapes and colors here may be consistent with plastic items.", boundingBox: box(0.4, 0.55, 0.25, 0.2), citizenAssessment: "agree" }] },
  { id: "AI-2036", observationId: "OBS-2036", status: "completed", ...model, analyzedAt: ago(2, 2), findings: [{ id: "F-3", category: "vegetation", label: "Possible excessive vegetation", explanation: "Green textures cover a large part of the image.", boundingBox: box(0.05, 0.5, 0.6, 0.45), citizenAssessment: "unsure" }] },
  { id: "AI-2033", observationId: "OBS-2033", status: "completed", ...model, analyzedAt: ago(3, 6), findings: [{ id: "F-4", category: "foam", label: "Possible surface foam", explanation: "Bright white patches on the water surface may be foam.", boundingBox: box(0.3, 0.3, 0.35, 0.25), citizenAssessment: "agree" }] },
  { id: "AI-2030", observationId: "OBS-2030", status: "failed", ...model, analyzedAt: ago(4, 1), findings: [], message: "Image analysis could not be completed for this photo." },
  { id: "AI-2027", observationId: "OBS-2027", status: "completed", ...model, analyzedAt: ago(6, 5), findings: [] , message: "No distinct visual features were identified. This does not indicate water quality." },
  { id: "AI-2024", observationId: "OBS-2024", status: "completed", ...model, analyzedAt: ago(8, 3), findings: [{ id: "F-5", category: "aquatic_life_concern", label: "Possible aquatic-life concern", explanation: "Several fish-like shapes are visible near the surface.", boundingBox: box(0.2, 0.3, 0.6, 0.4), citizenAssessment: "agree" }] },
  { id: "AI-2019", observationId: "OBS-2019", status: "completed", ...model, analyzedAt: ago(11), findings: [{ id: "F-6", category: "litter", label: "Possible litter detected", explanation: "A dark circular object may be consistent with a discarded tyre.", boundingBox: box(0.45, 0.6, 0.2, 0.2), citizenAssessment: "agree" }] },
];

export const reviews: ExpertReview[] = [
  { id: "R-2039", observationId: "OBS-2039", reviewerId: "u-expert", status: "completed", decision: "confirmed", publicNote: "Litter is clearly visible in the photograph. Shared with the local clean-up coordinator (demo).", internalNote: "Clear evidence.", reviewedAt: ago(0, 20) },
  { id: "R-2036", observationId: "OBS-2036", reviewerId: "u-expert", status: "completed", decision: "corrected", correctedCategories: ["vegetation", "other"], publicNote: "Growth appears to be moss on rocks rather than algae on the water surface. Category refined.", reviewedAt: ago(1) },
  { id: "R-2033", observationId: "OBS-2033", reviewerId: "u-expert", status: "in_progress", decision: "more_information_required", publicNote: "Could you add a closer photo of the foam and note whether it persists after a few minutes?", reviewedAt: ago(2) },
  { id: "R-2027", observationId: "OBS-2027", reviewerId: "u-expert", status: "completed", decision: "not_supported", publicNote: "The photo does not show a visible condition that can be assessed. Thank you for reporting.", reviewedAt: ago(5) },
  { id: "R-2024", observationId: "OBS-2024", reviewerId: "u-expert", status: "in_progress" },
  { id: "R-2019", observationId: "OBS-2019", reviewerId: "u-expert", status: "completed", decision: "confirmed", publicNote: "Tyre visible in the channel.", reviewedAt: ago(10) },
];

export const timeline: TimelineEvent[] = observations.flatMap((o) => {
  const ev: TimelineEvent[] = [{ id: `${o.id}-t1`, observationId: o.id, at: o.createdAt, type: "submitted", label: "Observation submitted" }];
  const a = analyses.find((x) => x.observationId === o.id);
  if (a) ev.push({ id: `${o.id}-t2`, observationId: o.id, at: a.analyzedAt!, type: a.status === "failed" ? "analysis_failed" : "analysis_completed", label: a.status === "failed" ? "Image analysis failed" : "Image analysis completed" });
  if (a?.findings.some((f) => f.citizenAssessment)) ev.push({ id: `${o.id}-t3`, observationId: o.id, at: a.analyzedAt!, type: "feedback_recorded", label: "Citizen feedback recorded" });
  const r = reviews.find((x) => x.observationId === o.id);
  if (r) ev.push({ id: `${o.id}-t4`, observationId: o.id, at: r.reviewedAt ?? o.updatedAt, type: "review_started", label: "Expert review started" });
  if (r?.decision === "more_information_required") ev.push({ id: `${o.id}-t5`, observationId: o.id, at: r.reviewedAt!, type: "information_requested", label: "Additional information requested" });
  else if (r?.status === "completed") ev.push({ id: `${o.id}-t5`, observationId: o.id, at: r.reviewedAt!, type: "status_updated", label: "Verification status updated" });
  return ev;
});

export const indicators: EnvironmentalIndicator[] = aquaconnect.indicators as EnvironmentalIndicator[];

/** 7 recent days (archived model outlook) + 7 forecast days of GloFAS river discharge. Empty when a site has none. */
export const outlook = (siteId: string): { date: string; observed: number | null; forecast: number | null }[] =>
  (aquaconnect.discharge as Record<string, { date: string; observed: number | null; forecast: number | null }[]>)[siteId] ?? [];

export const notifications: AppNotification[] = [
  { id: "N-1", type: "info_requested", title: "More information requested", body: "A reviewer asked for a closer photo for OBS-2033.", createdAt: ago(2), read: false, observationId: "OBS-2033" },
  { id: "N-2", type: "review_completed", title: "Review completed", body: "OBS-2036 was reviewed and its category was refined.", createdAt: ago(1), read: false, observationId: "OBS-2036" },
  { id: "N-3", type: "submitted", title: "Observation submitted", body: "OBS-2041 was received and is awaiting review.", createdAt: ago(0, 3), read: true, observationId: "OBS-2041" },
  { id: "N-4", type: "system", title: "Data source delayed", body: `Environmental data (AquaConnect snapshot) covers ${dataset.forecastStart} to ${dataset.forecastEnd}. Refresh it to see current conditions.`, createdAt: ago(1, 3), read: true },
];
