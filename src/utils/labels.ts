import { format, formatDistanceToNow } from "date-fns";
import type { ObservationCategory, ObservationStatus, ReviewDecision } from "@/types";

export const CATEGORY: Record<ObservationCategory, { label: string; desc: string }> = {
  litter: { label: "Litter or solid waste", desc: "Plastic, packaging, tyres or other debris" },
  discoloration: { label: "Unusual water color", desc: "Water looks a different color than usual" },
  foam: { label: "Foam or surface scum", desc: "Foam, froth or a film gathering on the surface" },
  vegetation: { label: "Excessive vegetation", desc: "Dense or unusual plant or algae-like growth" },
  oil_like_surface: { label: "Oil-like surface", desc: "Shiny, rainbow-like sheen on the water" },
  aquatic_life_concern: { label: "Aquatic-life concern", desc: "Dead fish or unusual animal behavior" },
  other: { label: "Other", desc: "Something else worth reporting" },
  unsure: { label: "Not sure", desc: "Something looks off, but I'm not sure what" },
};

export type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";
export const STATUS: Record<ObservationStatus, { label: string; tone: Tone; citizen: string }> = {
  draft: { label: "Draft", tone: "neutral", citizen: "Not yet submitted." },
  submitted: { label: "Submitted", tone: "info", citizen: "We've received your observation." },
  analysis_pending: { label: "AI Analysis Pending", tone: "info", citizen: "The photo is being screened." },
  analysis_completed: { label: "AI Analysis Completed", tone: "info", citizen: "Image screening finished." },
  awaiting_review: { label: "Awaiting Expert Review", tone: "warning", citizen: "Submitted — awaiting review by an expert." },
  more_information_requested: { label: "More Information Requested", tone: "warning", citizen: "The reviewer needs an additional photo or clarification." },
  under_review: { label: "Under Review", tone: "info", citizen: "An expert is reviewing the evidence." },
  verified: { label: "Expert-Verified", tone: "success", citizen: "An expert confirmed the reported condition is visible." },
  corrected: { label: "Corrected by Expert", tone: "primary", citizen: "An expert reviewed it and refined the category." },
  not_verified: { label: "Not Verified", tone: "neutral", citizen: "The available evidence could not support the report." },
  withdrawn: { label: "Withdrawn", tone: "neutral", citizen: "You withdrew this report." },
};

export const DECISION: Record<ReviewDecision, { label: string; desc: string }> = {
  confirmed: { label: "Confirm reported finding", desc: "The condition is visible in the evidence." },
  corrected: { label: "Correct category", desc: "A condition is visible but the category should change." },
  not_supported: { label: "Not supported by evidence", desc: "The evidence does not show the reported condition." },
  more_information_required: { label: "Request more information", desc: "Ask the reporter for another photo or clarification." },
  duplicate: { label: "Mark as duplicate", desc: "Already covered by another observation." },
  rejected: { label: "Reject / close", desc: "Off-topic, inappropriate or unusable per policy." },
};

export const PRIORITY = { high: "High priority", medium: "Medium priority", low: "Low priority", not_assessed: "Not assessed" } as const;

/** "Very high priority", "Moderate priority", … — falls back to the 3-level label when the original class is unknown. */
export const priorityText = (s?: { monitoringPriority?: keyof typeof PRIORITY; priorityClass?: string }) =>
  s?.priorityClass && s.priorityClass !== "Insufficient data" ? `${s.priorityClass} priority` : PRIORITY[s?.monitoringPriority ?? "not_assessed"];

export const fmt = (iso?: string) => (iso ? format(new Date(iso), "d MMM yyyy, HH:mm") : "—");
export const fmtDate = (iso?: string) => (iso ? format(new Date(iso), "d MMM yyyy") : "—");
export const rel = (iso?: string) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "—");
