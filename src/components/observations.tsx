"use client";

import { useState } from "react";
import Link from "next/link";
import { Camera, FlaskConical, MapPin, Check, X, HelpCircle, Clock, CheckCircle2, AlertTriangle, Search, Send, MessageSquare } from "lucide-react";
import type { AIAnalysis, AIFinding, CitizenAssessment, Observation, ObservationPhoto, TimelineEvent } from "@/types";
import { CATEGORY, fmt, rel } from "@/utils/labels";
import { AIBadge, CategoryBadge, StatusBadge, cx, Notice, Button } from "./ui";
import { useAnalysisHistory, useAudit } from "@/hooks/queries";
import type { AuditEntry } from "@/types";

export function Thumb({ photo, className, alt }: { photo?: ObservationPhoto; className?: string; alt: string }) {
  return photo?.previewUrl
    ? <img src={photo.previewUrl.includes("unsplash") ? `${photo.previewUrl}&w=320` : photo.previewUrl} alt={alt} loading="lazy" className={cx("object-cover bg-muted", className)} />
    : <div className={cx("grid place-items-center bg-muted text-ink-2", className)} aria-label="No photo"><Camera size={18} /></div>;
}

export function ObservationCard({ o, photo, hasAI, layout = "grid" }: { o: Observation; photo?: ObservationPhoto; hasAI?: boolean; layout?: "grid" | "list" }) {
  const alt = `Photo for observation ${o.id}: ${o.categories.map((c) => CATEGORY[c].label).join(", ")}`;
  return (
    <Link href={`/app/observations/${o.id}`} className={cx("group flex overflow-hidden rounded-xl border border-line bg-surface transition-shadow hover:shadow-md", layout === "grid" ? "flex-col" : "flex-row")}>
      <Thumb photo={photo} alt={alt} className={layout === "grid" ? "aspect-[4/3] w-full" : "w-28 shrink-0 sm:w-40"} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-1.5">{o.categories.map((c) => <CategoryBadge key={c} category={c} />)}</div>
        <p className="line-clamp-2 text-sm text-ink">{o.description || <span className="text-ink-2">No description provided.</span>}</p>
        <p className="flex items-center gap-1 text-xs text-ink-2"><MapPin size={12} aria-hidden />{o.location.placeName ?? "Unnamed location"}{o.location.precision === "approximate" && " (approx.)"}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-1.5"><StatusBadge status={o.status} />{hasAI && <AIBadge />}</div>
          <span className="text-xs text-ink-2">{o.id} · {rel(o.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

export function PhotoWithBoxes({ src, findings = [], showBoxes, alt, className }: { src?: string; findings?: AIFinding[]; showBoxes?: boolean; alt: string; className?: string }) {
  if (!src) return <div className={cx("grid aspect-[4/3] place-items-center rounded-xl bg-muted text-ink-2", className)}><Camera /></div>;
  return (
    <div className={cx("relative overflow-hidden rounded-xl bg-navy", className)}>
      <img src={src.includes("unsplash") ? `${src}&w=1200` : src} alt={alt} className="block max-h-[520px] w-full object-contain" />
      {showBoxes && findings.map((f, i) => f.boundingBox && (
        <div key={f.id} className="absolute border-2 border-dashed border-white shadow-[0_0_0_1px_rgba(22,50,79,.6)]" style={{ left: `${f.boundingBox.x * 100}%`, top: `${f.boundingBox.y * 100}%`, width: `${f.boundingBox.width * 100}%`, height: `${f.boundingBox.height * 100}%` }}>
          <span className="absolute -top-6 left-0 rounded bg-info px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white">{i + 1}. AI: {f.label.replace("Possible ", "")}</span>
        </div>
      ))}
    </div>
  );
}

const ASSESS: { v: CitizenAssessment; label: string; icon: typeof Check }[] = [
  { v: "agree", label: "Yes, I can see it", icon: Check },
  { v: "disagree", label: "No, that does not look correct", icon: X },
  { v: "unsure", label: "Not sure", icon: HelpCircle },
];
export function CitizenFeedbackControl({ value, onChange, readOnly }: { value?: CitizenAssessment; onChange?: (v: CitizenAssessment) => void; readOnly?: boolean }) {
  if (readOnly) return <p className="text-xs text-ink-2">Citizen response: <strong className="text-ink">{value ? ASSESS.find((a) => a.v === value)!.label : "No response"}</strong></p>;
  return (
    <div role="radiogroup" aria-label="Your assessment" className="flex flex-wrap gap-2">
      {ASSESS.map(({ v, label, icon: I }) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange?.(v)} className={cx("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium", value === v ? "border-primary bg-primary-light text-primary-dark" : "border-line bg-surface text-ink hover:bg-muted")}><I size={14} aria-hidden />{label}</button>
      ))}
    </div>
  );
}

export function AIFindingsPanel({ analysis, onAssess, readOnly, onRetry }: { analysis?: AIAnalysis | null; onAssess?: (id: string, v: CitizenAssessment) => void; readOnly?: boolean; onRetry?: () => void }) {
  if (!analysis) return <Notice tone="info">No AI analysis is associated with this observation.</Notice>;
  if (analysis.status === "pending" || analysis.status === "processing") return <Notice tone="info" title="Analyzing image…">Possible findings will appear here shortly.</Notice>;
  if (analysis.status === "failed" || analysis.status === "unavailable") return (
    <div className="space-y-3">
      <Notice tone="warning" title="AI analysis unavailable">{analysis.message ?? "AI analysis is temporarily unavailable."} The observation remains valid without it.</Notice>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try AI analysis again</Button>}
    </div>
  );
  return (
    <div className="space-y-3">
      {analysis.findings.length === 0 && <Notice tone="info">{analysis.message ?? "No possible findings were identified."}</Notice>}
      {analysis.findings.map((f, i) => (
        <div key={f.id} className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-1 flex flex-wrap items-center gap-2"><span className="grid size-5 place-items-center rounded bg-info text-[11px] font-bold text-white">{i + 1}</span><p className="font-semibold text-ink">{f.label}</p><AIBadge /></div>
          {f.explanation && <p className="mb-3 text-sm text-ink-2">{f.explanation}</p>}
          {f.confidence != null && <p className="mb-2 text-xs text-ink-2">Model score: {f.confidence} (not a probability of pollution)</p>}
          <CitizenFeedbackControl value={f.citizenAssessment} onChange={(v) => onAssess?.(f.id, v)} readOnly={readOnly} />
        </div>
      ))}
      <p className="flex items-center gap-1.5 text-xs text-ink-2"><FlaskConical size={12} aria-hidden />{analysis.modelName ?? "Model unspecified"} {analysis.modelVersion && `v${analysis.modelVersion}`} · {fmt(analysis.analyzedAt)} · Visual screening is not a laboratory water-quality test.</p>
    </div>
  );
}

const T_ICON: Record<TimelineEvent["type"], typeof Send> = { submitted: Send, analysis_completed: FlaskConical, analysis_failed: AlertTriangle, feedback_recorded: MessageSquare, review_started: Search, status_updated: CheckCircle2, information_requested: Clock };
export function ObservationTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {events.map((e) => { const I = T_ICON[e.type]; return (
        <li key={e.id} className="relative">
          <span className="absolute -left-[31px] grid size-5 place-items-center rounded-full border border-line bg-surface text-primary"><I size={11} aria-hidden /></span>
          <p className="text-sm font-medium text-ink">{e.label}</p>
          {e.detail && <p className="text-[13px] text-ink-2">“{e.detail}”</p>}
          <p className="text-xs text-ink-2">{fmt(e.at)}</p>
        </li>); })}
    </ol>
  );
}

/** Earlier AI analyses of an observation that were replaced by a re-run. */
export function AnalysisHistory({ observationId }: { observationId?: string }) {
  const { data = [] } = useAnalysisHistory(observationId);
  if (!data.length) return null;
  return (
    <details className="rounded-lg border border-line bg-muted/40 p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-ink">Earlier analyses ({data.length})</summary>
      <ol className="mt-3 space-y-3">
        {data.map((h) => (
          <li key={h.id} className="rounded-lg border border-line bg-surface p-3">
            <p className="text-xs font-semibold text-ink-2">Run {h.version} · {fmt(h.analyzedAt)} · replaced {rel(h.supersededAt)}</p>
            <p className="text-xs text-ink-2">{h.modelName ?? "Model unspecified"}{h.modelVersion ? ` v${h.modelVersion}` : ""} · {h.status}</p>
            {h.findings.length ? <ul className="mt-1.5 list-disc pl-5">{h.findings.map((f) => <li key={f.id}>{f.label}{f.citizenAssessment && <span className="text-ink-2"> — reporter: {f.citizenAssessment}</span>}</li>)}</ul> : <p className="mt-1.5 text-ink-2">{h.message ?? "No findings."}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}

const AUDIT_LABEL: Record<AuditEntry["action"], string> = {
  submitted: "Report submitted", edited: "Report edited", withdrawn: "Report withdrawn", review_assigned: "Review assigned", review_draft_saved: "Review draft saved",
  review_decided: "Review decision recorded", information_requested: "More information requested", reanalysed: "AI re-analysis", duplicate_flagged: "Flagged as duplicate",
};
/** Reviewer-only audit log: who did what, when, with before/after values. */
export function AuditLog({ observationId }: { observationId?: string }) {
  const { data = [], isLoading, isError, error } = useAudit(observationId);
  if (isLoading) return <p className="text-sm text-ink-2">Loading audit log…</p>;
  if (isError) return <Notice tone="warning">{(error as Error)?.message ?? "The audit log could not be loaded."}</Notice>;
  if (!data.length) return <p className="text-sm text-ink-2">No audit entries yet.</p>;
  return (
    <ol className="space-y-3 text-sm">
      {data.map((a) => (
        <li key={a.id} className="border-l-2 border-line pl-3">
          <p className="font-semibold text-ink">{AUDIT_LABEL[a.action]}</p>
          <p className="text-xs text-ink-2">{fmt(a.at)} · {a.actorRole} <span className="font-mono">{a.actorId}</span></p>
          {a.detail && <p className="mt-0.5 text-ink">{a.detail}</p>}
          {a.changes?.map((c, i) => <p key={i} className="mt-0.5 text-xs text-ink-2"><strong className="text-ink">{c.field}</strong>: {c.from ? <span className="line-through">{c.from.slice(0, 80)}</span> : <em>empty</em>} → {c.to ? c.to.slice(0, 80) : <em>empty</em>}</p>)}
        </li>
      ))}
    </ol>
  );
}

/** Drag-to-compare slider: "before" photo underneath, "after" photo revealed from the left. */
export function BeforeAfter({ before, after, beforeLabel, afterLabel }: { before?: string; after?: string; beforeLabel: string; afterLabel: string }) {
  const [pos, setPos] = useState(50);
  if (!before || !after) return <Notice tone="info">One of these reports has no photo to compare.</Notice>;
  return (
    <div>
      <div className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-xl bg-navy">
        <img src={before} alt={`Before: ${beforeLabel}`} className="absolute inset-0 size-full object-cover" draggable={false} />
        <img src={after} alt={`After: ${afterLabel}`} className="absolute inset-0 size-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }}><span className="absolute top-1/2 -left-4 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white text-xs font-bold text-navy shadow">⇆</span></div>
        <span className="absolute top-2 left-2 rounded bg-navy/80 px-2 py-0.5 text-xs font-semibold text-white">After · {afterLabel}</span>
        <span className="absolute top-2 right-2 rounded bg-navy/80 px-2 py-0.5 text-xs font-semibold text-white">Before · {beforeLabel}</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(+e.target.value)} aria-label="Slide to compare before and after photos" className="mt-3 w-full accent-primary" />
    </div>
  );
}
