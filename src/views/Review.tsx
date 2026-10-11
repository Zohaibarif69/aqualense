"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardCheck, Eye, EyeOff, Lock, ShieldCheck, ZoomIn, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useAnalysis, useIndicators, useObservation, useObservations, usePhotos, useReviews, useSites, useTimeline, useUser } from "@/hooks/queries";
import { api } from "@/services";
import { AIFindingsPanel, AnalysisHistory, AuditLog, ObservationTimeline, PhotoWithBoxes, Thumb } from "@/components/observations";
import { useRoleSwitcher } from "@/components/RoleSwitch";
import { Badge, Button, Card, CardHeader, CategoryBadge, Chip, DataFreshnessLabel, DemoBadge, Dialog, EmptyState, ErrorState, ListSkeleton, Notice, PageHeader, StatusBadge, cx, inputCls, useToast, AIBadge } from "@/components/ui";
import type { ObservationCategory, ReviewDecision } from "@/types";
import { CATEGORY, DECISION, fmt, priorityText, rel } from "@/utils/labels";

const REASONS = ["", "clear_visual_evidence", "insufficient_image_quality", "category_mismatch", "outside_scope", "duplicate_report", "inappropriate_content"];

function PermissionGate({ children }: { children: React.ReactNode }) {
  const { data: user } = useUser();
  const sw = useRoleSwitcher();
  if (!user) return <ListSkeleton />;
  if (user.role === "expert" || user.role === "admin") return <>{children}</>;
  return (
    <Card className="mx-auto max-w-md p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-ink-2"><Lock size={22} /></span>
      <h1 className="mt-4 text-xl font-bold text-navy">Reviewer access required</h1>
      <p className="mt-2 text-sm text-ink-2">The Expert Review workspace is limited to authorized reviewers. In production, the server enforces this permission.</p>
      {sw.dialog}
      <Button className="mt-5" onClick={() => void sw.request("expert")}><ShieldCheck size={16} />Switch to demo reviewer</Button>
    </Card>
  );
}

function Workspace({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: user } = useUser();
  const { data: o, isLoading, isError } = useObservation(id);
  const { data: photos } = usePhotos(o?.photoIds);
  const { data: ai } = useAnalysis(id);
  const { data: tl = [] } = useTimeline(id);
  const { data: reviews = [] } = useReviews();
  const { data: sites = [] } = useSites();
  const env = useIndicators(o?.location.siteId);
  const { data: related = [] } = useObservations({ siteId: o?.location.siteId });
  const existing = reviews.find((r) => r.observationId === id);
  const [boxes, setBoxes] = useState(true);
  const [zoom, setZoom] = useState(false);
  const [decision, setDecision] = useState<ReviewDecision | "">(existing?.status === "completed" ? "" : existing?.decision ?? "");
  const [cats, setCats] = useState<ObservationCategory[]>(existing?.correctedCategories ?? []);
  const [reason, setReason] = useState(existing?.reasonCode ?? "");
  const [internal, setInternal] = useState(existing?.internalNote ?? "");
  const [dupOf, setDupOf] = useState(existing?.duplicateOfId ?? "");
  const [publicNote, setPublicNote] = useState(existing?.publicNote ?? "");
  const [confirm, setConfirm] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [err, setErr] = useState<string>();
  const qc = useQueryClient();
  const toast = useToast();
  const site = sites.find((s) => s.id === o?.location.siteId);

  const save = useMutation({
    mutationFn: (p: { draft?: boolean; decision: ReviewDecision; publicNote?: string }) => api.reviews.decide(id, { decision: p.decision, correctedCategories: p.decision === "corrected" ? cats : undefined, publicNote: p.publicNote ?? publicNote, internalNote: internal, reasonCode: reason || undefined, duplicateOfId: p.decision === "duplicate" ? dupOf.trim().toUpperCase() || undefined : undefined, draft: p.draft }),
    onSuccess: (_, p) => { qc.invalidateQueries(); setConfirm(false); setReqOpen(false); toast(p.draft ? "Draft saved" : "Review decision saved"); },
    onError: (e: Error) => toast(e.message, "danger"),
  });
  const assign = useMutation({ mutationFn: () => api.reviews.assign(id, user?.id ?? "u-demo"), onSuccess: () => { qc.invalidateQueries(); toast("Assigned to you"); } });

  const finalize = () => {
    if (!decision) return setErr("Choose a decision first.");
    if (decision === "corrected" && !cats.length) return setErr("Select the corrected categories.");
    if (decision === "duplicate" && !dupOf.trim()) return setErr("Enter the ID of the observation this one duplicates.");
    if (decision === "more_information_required") return setReqOpen(true);
    setErr(undefined); setConfirm(true);
  };

  if (isLoading) return <ListSkeleton rows={6} />;
  if (isError || !o) return <ErrorState message="We could not load this observation." />;
  const photo = photos?.[0];
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={15} />Queue</Button>
          <div><h1 className="text-xl font-bold text-navy">Reviewing {o.id}</h1><p className="text-xs text-ink-2">{o.location.placeName} · submitted {rel(o.createdAt)}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={o.status} />{existing?.reviewerId ? <Badge>Assigned · {existing.reviewerId === user?.id ? "You" : "Reviewer"}</Badge> : <Button size="sm" variant="secondary" onClick={() => assign.mutate()}>Assign to me</Button>}<Link href={`/app/observations/${o.id}`} className="text-sm font-semibold text-primary">Public view</Link></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-[1.15fr_1fr_380px]">
        <section aria-labelledby="ev" className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader title={<span id="ev">Original evidence</span>} sub="Citizen-submitted" action={<div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setZoom(true)} aria-label="Zoom image"><ZoomIn size={15} /></Button>{ai?.findings.length ? <Button size="sm" variant="ghost" onClick={() => setBoxes(!boxes)} aria-pressed={boxes}>{boxes ? <EyeOff size={15} /> : <Eye size={15} />}AI overlay</Button> : null}</div>} />
            <div className="space-y-4 p-5">
              <PhotoWithBoxes src={photo?.uploadedUrl ?? photo?.previewUrl} findings={ai?.findings} showBoxes={boxes} alt={`Evidence photo for ${o.id}`} />
              <div><p className="mb-1 text-xs font-semibold text-ink-2 uppercase">Citizen description</p><p className="text-sm whitespace-pre-line">{o.description || "—"}</p></div>
              <div><p className="mb-1 text-xs font-semibold text-ink-2 uppercase">Citizen categories</p><div className="flex flex-wrap gap-1">{o.categories.map((c) => <CategoryBadge key={c} category={c} />)}</div></div>
              <div><p className="mb-1 text-xs font-semibold text-ink-2 uppercase">Citizen responses to AI</p>{ai?.findings.length ? ai.findings.map((f) => <p key={f.id} className="text-sm">{f.label}: <strong>{f.citizenAssessment ?? "no response"}</strong></p>) : <p className="text-sm text-ink-2">None</p>}</div>
              <dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-xs text-ink-2">Observed</dt><dd>{fmt(o.observedAt ?? o.createdAt)}</dd></div><div><dt className="text-xs text-ink-2">Location</dt><dd>{o.location.latitude?.toFixed(4)}, {o.location.longitude?.toFixed(4)} ({o.location.precision})</dd></div></dl>
            </div>
          </Card>
        </section>

        <section aria-label="AI and contextual evidence" className="space-y-5">
          <Card>
            <CardHeader title="AI visual findings" sub="Advisory — you are not bound by these" />
            <div className="space-y-3 p-5"><AIFindingsPanel analysis={ai} readOnly /><AnalysisHistory observationId={id} /></div>
          </Card>
          <Card>
            <CardHeader title="Environmental context" sub={site ? `${site.name} · ${priorityText(site)} (model context)` : "No linked site"} />
            {env.isError ? <ErrorState message="Environmental data could not be refreshed." onRetry={() => env.refetch()} /> : (
              <ul className="divide-y divide-line text-sm">
                {env.data?.map((i) => <li key={i.id} className="flex items-center justify-between gap-2 px-5 py-2.5"><span>{i.name}</span>{i.dataStatus === "missing" ? <span className="text-xs text-neutral">Not connected</span> : <Badge tone={i.dataStatus === "stale" ? "warning" : "neutral"}>{i.level ?? `${i.value} ${i.unit}`}</Badge>}</li>)}
                <li className="px-5 py-2.5 text-xs text-ink-2"><DataFreshnessLabel at={env.data?.[0]?.observedAt} stale={env.data?.[0]?.dataStatus === "stale"} /> · Source: AquaConnect / OneAquaHealth screening</li>
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="River network & related" />
            <div className="space-y-3 p-5 text-sm">
              <p className="flex items-start gap-2"><ArrowUpRight size={15} className="mt-0.5 text-info" /><span><span className="text-ink-2">Upstream: </span>{site?.upstreamSiteIds?.map((x) => sites.find((s) => s.id === x)?.name).join(", ") || "None mapped"}</span></p>
              <p className="flex items-start gap-2"><ArrowDownRight size={15} className="mt-0.5 text-info" /><span><span className="text-ink-2">Downstream: </span>{site?.downstreamSiteIds?.map((x) => sites.find((s) => s.id === x)?.name).join(", ") || "None mapped"}</span></p>
              <p className="text-xs font-semibold text-ink-2 uppercase">Other observations at this site</p>
              {related.filter((r) => r.id !== o.id).length ? related.filter((r) => r.id !== o.id).map((r) => <Link key={r.id} href={`/app/review?open=${r.id}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 hover:bg-muted"><span>{r.id} · {CATEGORY[r.categories[0]].label}</span><StatusBadge status={r.status} /></Link>) : <p className="text-ink-2">None</p>}
            </div>
          </Card>
        </section>

        <section aria-label="Expert decision" className="space-y-5 lg:col-span-2 2xl:col-span-1">
          <Card className="2xl:sticky 2xl:top-24">
            <CardHeader title="Expert decision" sub="Your independent assessment" />
            <div className="space-y-4 p-5">
              <fieldset><legend className="mb-2 text-sm font-medium">Verification decision</legend>
                <div className="space-y-1.5">{(Object.keys(DECISION) as ReviewDecision[]).map((k) => (
                  <label key={k} className={cx("flex cursor-pointer gap-3 rounded-lg border p-3", decision === k ? "border-primary bg-primary-light" : "border-line hover:bg-muted")}>
                    <input type="radio" name="decision" className="mt-0.5 accent-primary" checked={decision === k} onChange={() => { setDecision(k); setErr(undefined); }} />
                    <span><span className="block text-sm font-semibold">{DECISION[k].label}</span><span className="block text-xs text-ink-2">{DECISION[k].desc}</span></span>
                  </label>))}</div>
              </fieldset>
              {decision === "duplicate" && (
                <div><label htmlFor="dup" className="mb-1.5 block text-sm font-medium">Duplicate of</label>
                  <input id="dup" list="dup-options" className={inputCls} value={dupOf} onChange={(e) => setDupOf(e.target.value)} placeholder="e.g. OBS-2039" autoComplete="off" />
                  <datalist id="dup-options">{related.filter((r) => r.id !== o.id).map((r) => <option key={r.id} value={r.id}>{CATEGORY[r.categories[0]].label}</option>)}</datalist>
                  <p className="mt-1 text-xs text-ink-2">Suggestions are other reports at this site. The reporter sees a link to the original.</p></div>
              )}
              {decision === "corrected" && <fieldset><legend className="mb-2 text-sm font-medium">Corrected categories</legend><div className="flex flex-wrap gap-1.5">{(Object.keys(CATEGORY) as ObservationCategory[]).filter((c) => c !== "unsure").map((c) => <Chip key={c} active={cats.includes(c)} onClick={() => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])}>{CATEGORY[c].label}</Chip>)}</div></fieldset>}
              <div><label htmlFor="reason" className="mb-1.5 block text-sm font-medium">Reason code</label><select id="reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r} value={r}>{r ? r.replace(/_/g, " ") : "Select (optional)"}</option>)}</select><p className="mt-1 text-xs text-ink-2">Placeholder codes — final list defined by backend policy.</p></div>
              <div><label htmlFor="internal" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><Lock size={13} />Internal reviewer notes</label><textarea id="internal" rows={3} className={inputCls} value={internal} onChange={(e) => setInternal(e.target.value)} placeholder="Visible to reviewers only" /></div>
              <div><label htmlFor="public" className="mb-1.5 block text-sm font-medium">Public-facing explanation</label><textarea id="public" rows={3} className={inputCls} value={publicNote} onChange={(e) => setPublicNote(e.target.value)} placeholder="Shown to the citizen and on the public page" /></div>
              {err && <p className="text-sm font-medium text-danger" role="alert">{err}</p>}
              <div className="flex flex-col gap-2">
                <Button onClick={finalize} disabled={save.isPending}><ClipboardCheck size={16} />Submit decision</Button>
                <div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => decision ? save.mutate({ draft: true, decision }) : setErr("Choose a decision to save a draft.")}>Save draft</Button><Button variant="secondary" onClick={() => setReqOpen(true)}>Request info</Button></div>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Audit log" sub="Who did what, when, and what changed" />
            <div className="p-5"><AuditLog observationId={id} /></div>
          </Card>
          <Card>
            <CardHeader title="Status timeline" />
            <div className="p-5 pl-8">{tl.length ? <ObservationTimeline events={tl} /> : <p className="text-sm text-ink-2">No events.</p>}</div>
          </Card>
        </section>
      </div>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Finalize review decision?" footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button><Button variant={decision === "rejected" ? "danger" : "primary"} onClick={() => decision && save.mutate({ decision })} disabled={save.isPending}>Confirm and submit</Button></>}>
        <p>You are recording <strong>{decision && DECISION[decision].label}</strong> for {o.id}.</p>
        {decision === "corrected" && <p className="mt-2">Corrected categories: {cats.map((c) => CATEGORY[c].label).join(", ")}</p>}
        <p className="mt-2 text-ink-2">The citizen will see the public explanation{publicNote ? "" : " (currently empty)"}. Internal notes stay private.</p>
      </Dialog>
      <RequestMoreInformationDialog open={reqOpen} onClose={() => setReqOpen(false)} initial={publicNote} onSubmit={(msg) => { setPublicNote(msg); save.mutate({ decision: "more_information_required", publicNote: msg }); }} pending={save.isPending} />
      {zoom && <div className="fixed inset-0 z-[2000] grid place-items-center bg-navy/90 p-4" onClick={() => setZoom(false)} role="dialog" aria-label="Zoomed image"><img src={`${photo?.previewUrl}${photo?.previewUrl?.includes("unsplash") ? "&w=2000" : ""}`} alt={`Zoomed evidence for ${o.id}`} className="max-h-full max-w-full object-contain" /><button className="absolute top-4 right-4 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold">Close</button></div>}
    </>
  );
}

function RequestMoreInformationDialog({ open, onClose, onSubmit, initial, pending }: { open: boolean; onClose: () => void; onSubmit: (m: string) => void; initial: string; pending: boolean }) {
  const [msg, setMsg] = useState(initial || "Could you add a closer photo of the condition and describe how large the affected area is?");
  return (
    <Dialog open={open} onClose={onClose} title="Request more information" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSubmit(msg)} disabled={!msg.trim() || pending}>Send request</Button></>}>
      <label htmlFor="req" className="mb-1.5 block font-medium">Message to the citizen</label>
      <textarea id="req" rows={4} className={inputCls} value={msg} onChange={(e) => setMsg(e.target.value)} />
      <p className="mt-2 text-xs text-ink-2">The observation will show “More information requested” and the citizen will be notified.</p>
    </Dialog>
  );
}

type QF = "awaiting" | "mine" | "info" | "recent" | "completed" | "all";
export default function Review() {
  const [params, setParams] = useQueryParams();
  const open = params.get("open");
  const obs = useObservations();
  const { data: reviews = [] } = useReviews();
  const { data: user } = useUser();
  const photos = usePhotos((obs.data ?? []).flatMap((o) => o.photoIds));
  const [f, setF] = useState<QF>("awaiting");
  const [cat, setCat] = useState("");
  const [aiOnly, setAiOnly] = useState("");
  const rows = useMemo(() => (obs.data ?? []).filter((o) => {
    const r = reviews.find((x) => x.observationId === o.id);
    if (cat && !o.categories.includes(cat as ObservationCategory)) return false;
    if (aiOnly === "yes" && !o.aiAnalysisId) return false;
    if (aiOnly === "no" && o.aiAnalysisId) return false;
    return f === "all" ? true : f === "awaiting" ? ["awaiting_review", "under_review", "submitted"].includes(o.status) : f === "mine" ? r?.reviewerId === user?.id || r?.reviewerId === "u-expert" && r.status !== "completed" : f === "info" ? o.status === "more_information_requested" : f === "completed" ? ["verified", "corrected", "not_verified"].includes(o.status) : true;
  }).sort((a, b) => (f === "recent" ? b.updatedAt.localeCompare(a.updatedAt) : a.createdAt.localeCompare(b.createdAt))), [obs.data, reviews, f, cat, aiOnly, user]);

  return (
    <PermissionGate>
      {open ? <Workspace key={open} id={open} onBack={() => setParams({})} /> : (
        <>
          <PageHeader title="Expert Review" description="Inspect submitted evidence, weigh AI suggestions and environmental context, and record independent decisions." meta={<DemoBadge />} />
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {([["awaiting", "Awaiting review"], ["mine", "Assigned to me"], ["info", "More info requested"], ["recent", "Recently updated"], ["completed", "Completed"], ["all", "All"]] as [QF, string][]).map(([k, l]) => <Chip key={k} active={f === k} onClick={() => setF(k)}>{l}</Chip>)}
            <select aria-label="Category" className="ml-auto h-9 rounded-lg border border-line bg-surface px-2 text-sm" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            <select aria-label="AI analysis availability" className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" value={aiOnly} onChange={(e) => setAiOnly(e.target.value)}><option value="">AI: any</option><option value="yes">With AI analysis</option><option value="no">Without AI analysis</option></select>
          </div>
          <Card className="overflow-hidden">
            {obs.isLoading ? <ListSkeleton rows={6} /> : obs.isError ? <ErrorState onRetry={() => obs.refetch()} /> : rows.length === 0 ? <EmptyState title="The queue is clear for this filter." /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="border-b border-line bg-muted/60 text-left text-xs font-semibold text-ink-2 uppercase"><tr><th className="px-5 py-3">Observation</th><th className="px-3">Category</th><th className="px-3">Location</th><th className="px-3">Submitted</th><th className="px-3">AI analysis</th><th className="px-3">Status</th><th className="px-3">Reviewer</th><th className="px-5"><span className="sr-only">Action</span></th></tr></thead>
                  <tbody className="divide-y divide-line">{rows.map((o) => { const r = reviews.find((x) => x.observationId === o.id); return (
                    <tr key={o.id} className="hover:bg-muted/40">
                      <td className="px-5 py-3"><div className="flex items-center gap-3"><Thumb photo={photos.data?.find((p) => p.id === o.photoIds[0])} alt="" className="size-11 rounded-md" /><span className="font-semibold">{o.id}</span></div></td>
                      <td className="px-3">{CATEGORY[o.categories[0]].label}{o.categories.length > 1 && ` +${o.categories.length - 1}`}</td>
                      <td className="px-3 text-ink-2">{o.location.placeName}</td>
                      <td className="px-3 text-ink-2">{rel(o.createdAt)}</td>
                      <td className="px-3">{o.aiAnalysisId ? <AIBadge /> : <span className="text-xs text-neutral">None</span>}</td>
                      <td className="px-3"><StatusBadge status={o.status} /></td>
                      <td className="px-3 text-ink-2">{r?.reviewerId ? (r.reviewerId === user?.id ? "You" : "Demo Reviewer") : "Unassigned"}</td>
                      <td className="px-5 text-right"><Button size="sm" variant="secondary" onClick={() => setParams({ open: o.id })}>Open review</Button></td>
                    </tr>); })}</tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="mt-3 text-xs text-ink-2">No urgency ranking is shown: priority rules have not been defined. Oldest submissions appear first.</p>
          <Notice tone="info">AI output is advisory. Reviewers can confirm, correct, or set aside AI suggestions.</Notice>
        </>
      )}
    </PermissionGate>
  );
}
