"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Eye, EyeOff, MapPin, MessageSquarePlus, Pencil, RefreshCw, Ban } from "lucide-react";
import { useAnalysis, useIndicators, useObservation, useObservations, usePhotos, useReview, useSite, useSites, useTimeline, useUser } from "@/hooks/queries";
import { api } from "@/services";
import FreshwaterMap from "@/components/FreshwaterMap";
import { AIFindingsPanel, AnalysisHistory, AuditLog, BeforeAfter, ObservationTimeline, PhotoWithBoxes } from "@/components/observations";
import { Badge, Button, Card, CardHeader, CategoryBadge, Chip, DataFreshnessLabel, DemoBadge, Dialog, EmptyState, ErrorState, ListSkeleton, Notice, StatusBadge, btnLink, inputCls, useToast } from "@/components/ui";
import { CATEGORY, DECISION, STATUS, fmt, priorityText, rel } from "@/utils/labels";
import type { ObservationCategory, ObservationStatus } from "@/types";

const EDITABLE: ObservationStatus[] = ["submitted", "awaiting_review", "more_information_requested", "analysis_completed"];

export default function ObservationDetail() {
  const { observationId } = useParams<{ observationId: string }>();
  const q = useObservation(observationId);
  const o = q.data;
  const { data: user } = useUser();
  const { data: photos } = usePhotos(o?.photoIds);
  const photo = photos?.[0];
  const { data: ai } = useAnalysis(o?.id);
  const { data: review } = useReview(o?.id);
  const { data: tl = [] } = useTimeline(o?.id);
  const site = useSite(o?.location.siteId);
  const env = useIndicators(o?.location.siteId);
  const { data: sites = [] } = useSites();
  const { data: related = [] } = useObservations({ siteId: o?.location.siteId });
  const [boxes, setBoxes] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [extra, setExtra] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editCats, setEditCats] = useState<ObservationCategory[]>([]);
  const [cmpId, setCmpId] = useState("");
  const cmp = related.find((r) => r.id === cmpId);
  const { data: cmpPhotos } = usePhotos(cmp?.photoIds);
  const [wdOpen, setWdOpen] = useState(false);
  const [wdReason, setWdReason] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const edit = useMutation({
    mutationFn: () => api.observations.edit(o!.id, { description: editDesc.trim(), categories: editCats }),
    onSuccess: () => { qc.invalidateQueries(); setEditOpen(false); toast("Report updated"); },
    onError: (e: Error) => toast(e.message, "danger"),
  });
  const withdraw = useMutation({
    mutationFn: () => api.observations.withdraw(o!.id, wdReason.trim() || undefined),
    onSuccess: () => { qc.invalidateQueries(); setWdOpen(false); toast("Report withdrawn", "info"); },
    onError: (e: Error) => toast(e.message, "danger"),
  });
  const reanalyse = useMutation({
    mutationFn: async () => {
      const src = photo?.uploadedUrl ?? photo?.previewUrl;
      if (!src) throw new Error("There is no photo to analyse.");
      let blob: Blob;
      try { blob = await (await fetch(src)).blob(); } catch { throw new Error("The photo could not be loaded for analysis."); }
      const file = new File([blob], photo?.filename ?? "photo.jpg", { type: blob.type || "image/jpeg" });
      const analysis = await api.ai.analyze(file);
      return api.ai.saveReanalysis(o!.id, analysis);
    },
    onSuccess: (a) => { qc.invalidateQueries(); toast(a.status === "completed" ? "Photo re-analysed. The previous analysis is kept in history." : "Re-analysis failed. The previous analysis is unchanged.", a.status === "completed" ? "success" : "info"); },
    onError: (e: Error) => toast(e.message, "danger"),
  });
  const addInfo = useMutation({
    mutationFn: () => api.observations.update(o!.id, { description: `${o!.description ?? ""}\n\nAdditional information: ${extra}`.trim(), status: "awaiting_review" }),
    onSuccess: () => { qc.invalidateQueries(); setAddOpen(false); setExtra(""); toast("Additional information submitted"); },
  });

  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError || !o) return <ErrorState message="We could not find that observation." />;
  const isOwner = o.submittedBy && o.submittedBy === user?.id;
  const isExpert = user?.role === "expert" || user?.role === "admin";
  const canEdit = !!isOwner && EDITABLE.includes(o.status);
  const canWithdraw = !!isOwner && o.status !== "withdrawn" && o.status !== "verified" && o.status !== "corrected";
  const withdrawn = o.status === "withdrawn";
  const others = related.filter((r) => r.id !== o.id && r.status !== "withdrawn");
  const sameCat = others.filter((r) => r.categories.some((c) => o.categories.includes(c)));
  const openEdit = () => { setEditDesc(o.description ?? ""); setEditCats(o.categories); setEditOpen(true); };
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-2"><Link href="/app/observations" className="hover:text-ink">Observations</Link> / <span className="text-ink">{o.id}</span></nav>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="text-2xl font-bold text-navy lg:text-[28px]">{o.categories.map((c) => CATEGORY[c].label).join(" · ")}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-2"><MapPin size={14} />{o.location.placeName} · {fmt(o.createdAt)}</p>
          <div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={o.status} /><DemoBadge /></div></div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button variant="secondary" onClick={openEdit}><Pencil size={16} />Edit report</Button>}
          {canWithdraw && <Button variant="secondary" onClick={() => setWdOpen(true)}><Ban size={16} />Withdraw</Button>}
          {isOwner && o.status === "more_information_requested" && <Button onClick={() => setAddOpen(true)}><MessageSquarePlus size={16} />Add requested information</Button>}
          {isExpert && <Link href={`/app/review?open=${o.id}`} className={btnLink()}><ClipboardCheck size={16} />Open in Review Workspace</Link>}
        </div>
      </div>
      {withdrawn && <div className="mb-3"><Notice tone="warning" title="This report was withdrawn">The reporter withdrew this observation{o.withdrawnAt ? ` on ${fmt(o.withdrawnAt)}` : ""}. It is kept for the record and no longer counts as active.</Notice></div>}
      {review?.decision === "duplicate" && review.duplicateOfId && <div className="mb-3"><Notice tone="info" title="Marked as a duplicate">A reviewer found this is already covered by <Link href={`/app/observations/${review.duplicateOfId}`} className="font-semibold text-primary underline">{review.duplicateOfId}</Link>.</Notice></div>}
      {isOwner && !withdrawn && <Notice tone={STATUS[o.status].tone === "warning" ? "warning" : "info"} title={STATUS[o.status].label}>{STATUS[o.status].citizen}</Notice>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title="A. Original observation" sub="As submitted by the citizen" action={ai?.findings.length ? <Button size="sm" variant="secondary" onClick={() => setBoxes(!boxes)} aria-pressed={boxes}>{boxes ? <EyeOff size={14} /> : <Eye size={14} />}{boxes ? "Hide" : "Show"} AI overlay</Button> : undefined} />
            <div className="space-y-4 p-5">
              <PhotoWithBoxes src={photo?.uploadedUrl ?? photo?.previewUrl} findings={ai?.findings} showBoxes={boxes} alt={`Photo submitted for ${o.id}`} />
              <div className="flex flex-wrap gap-1.5">{o.categories.map((c) => <CategoryBadge key={c} category={c} />)}<span className="text-xs text-ink-2 self-center">(citizen-selected)</span></div>
              <p className="whitespace-pre-line text-[15px] text-ink">{o.description || <span className="text-ink-2">No description provided.</span>}</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-ink-2">Observed at</dt><dd>{fmt(o.observedAt ?? o.createdAt)}</dd></div>
                <div><dt className="text-xs text-ink-2">Seen before?</dt><dd className="capitalize">{o.seenBefore ?? "—"}</dd></div>
                <div><dt className="text-xs text-ink-2">Photo provenance</dt><dd>{photo ? `${photo.mimeType} · quality ${photo.qualityStatus}` : "—"}</dd></div>
              </dl>
            </div>
          </Card>
          <Card>
            <CardHeader title="B. AI-assisted analysis" sub="Advisory visual screening — not a determination of water quality" action={(isOwner || isExpert) && photo && !withdrawn ? <Button size="sm" variant="secondary" onClick={() => reanalyse.mutate()} disabled={reanalyse.isPending}><RefreshCw size={14} className={reanalyse.isPending ? "animate-spin" : ""} />{reanalyse.isPending ? "Analysing…" : "Re-run analysis"}</Button> : undefined} />
            <div className="space-y-3 p-5"><AIFindingsPanel analysis={ai} readOnly /><AnalysisHistory observationId={o.id} /></div>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Location" sub={`${o.location.precision === "approximate" ? "Approximate" : "Precise"} location · ${o.location.latitude?.toFixed(3)}, ${o.location.longitude?.toFixed(3)}`} />
            <FreshwaterMap sites={sites} observations={[o]} selectedId={o.id} className="h-64" focus={o.location.latitude ? [o.location.latitude, o.location.longitude!] : undefined} zoom={13} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink-2">Observation ID</dt><dd className="font-semibold">{o.id}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Submitted</dt><dd>{fmt(o.createdAt)}</dd></div>
              {o.editedAt && <div className="flex justify-between"><dt className="text-ink-2">Edited</dt><dd>{fmt(o.editedAt)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-2">Location precision</dt><dd className="capitalize">{o.location.precision}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Verification</dt><dd><StatusBadge status={o.status} /></dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">AI analysis</dt><dd>{ai ? (ai.status === "completed" ? `${ai.findings.length} possible finding(s)` : "Unavailable") : "Not run"}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="D. Expert review" />
            <div className="space-y-3 p-5 text-sm">
              {!review || !review.decision ? <p className="text-ink-2">{review?.status === "in_progress" ? "A reviewer has started reviewing this observation." : "Not yet reviewed."}</p> : (
                <>
                  <p><span className="text-ink-2">Decision: </span><strong>{DECISION[review.decision].label}</strong></p>
                  {review.correctedCategories && <div className="flex flex-wrap gap-1"><span className="text-ink-2">Corrected categories:</span>{review.correctedCategories.map((c) => <CategoryBadge key={c} category={c} />)}</div>}
                  {review.publicNote && <blockquote className="rounded-lg border-l-4 border-primary bg-primary-light/50 p-3">{review.publicNote}</blockquote>}
                  <p className="text-xs text-ink-2">Reviewed {fmt(review.reviewedAt)}</p>
                  {isExpert && review.internalNote && <p className="rounded-lg bg-warning-light p-3 text-xs"><strong>Internal note (reviewers only):</strong> {review.internalNote}</p>}
                </>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="C. Environmental context" sub={site.data ? `${site.data.name} · ${priorityText(site.data)}` : "No linked site"} />
            {env.isError ? <ErrorState message="Environmental data could not be refreshed." onRetry={() => env.refetch()} /> : !o.location.siteId ? <EmptyState title="No monitoring site linked" /> : (
              <ul className="divide-y divide-line text-sm">
                {env.data?.slice(0, 4).map((i) => <li key={i.id} className="flex items-center justify-between gap-2 px-5 py-2.5"><span>{i.name}</span>{i.dataStatus === "missing" ? <span className="text-xs text-neutral">Data unavailable</span> : <Badge tone={i.dataStatus === "stale" ? "warning" : "neutral"}>{i.level ?? `${i.value} ${i.unit}`}</Badge>}</li>)}
                <li className="px-5 py-2.5 text-xs text-ink-2">Upstream: {site.data?.upstreamSiteIds?.map((id) => sites.find((s) => s.id === id)?.name).join(", ") || "None mapped"} · Downstream: {site.data?.downstreamSiteIds?.map((id) => sites.find((s) => s.id === id)?.name).join(", ") || "None mapped"}</li>
                <li className="px-5 py-2.5 text-xs text-ink-2"><DataFreshnessLabel at={env.data?.[0]?.observedAt} stale={env.data?.[0]?.dataStatus === "stale"} /></li>
                <li className="px-5 py-2.5"><Link href={`/app/sites/${o.location.siteId}`} className="text-sm font-semibold text-primary">Site details</Link></li>
              </ul>
            )}
          </Card>
          {o.location.siteId && (
            <Card>
              <CardHeader title="Repeated reports at this site" sub={others.length ? `${others.length} other report${others.length > 1 ? "s" : ""} · ${sameCat.length} with a matching category · latest ${rel(others[0]?.createdAt)}` : "No other reports here yet"} />
              {others.length ? (
                <ul className="divide-y divide-line text-sm">
                  {others.slice(0, 6).map((r) => (
                    <li key={r.id}><Link href={`/app/observations/${r.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 hover:bg-muted/60">
                      <span className="min-w-0"><span className="block truncate font-medium">{r.id} · {r.categories.map((c) => CATEGORY[c].label).join(", ")}</span><span className="block text-xs text-ink-2">{fmt(r.createdAt)}{r.categories.some((c) => o.categories.includes(c)) && " · same category"}</span></span>
                      <StatusBadge status={r.status} />
                    </Link></li>))}
                  {others.length > 6 && <li className="px-5 py-2.5 text-xs text-ink-2">+{others.length - 6} more. <Link href="/app/observations" className="font-semibold text-primary">Browse all observations</Link></li>}
                </ul>
              ) : <p className="px-5 py-4 text-sm text-ink-2">{o.seenBefore === "yes" ? "The reporter said they’d seen this here before, but no earlier reports are on record." : "This is the first report at this site."}</p>}
              {o.seenBefore && <p className="border-t border-line px-5 py-2.5 text-xs text-ink-2">Reporter: seen here before? <strong className="capitalize">{o.seenBefore === "unsure" ? "not sure" : o.seenBefore}</strong></p>}
            </Card>
          )}
          {o.location.siteId && others.length > 0 && (
            <Card>
              <CardHeader title="Compare before and after" sub="Pick another report at this site; the older photo is “before”" />
              <div className="space-y-3 p-5">
                <select aria-label="Report to compare with" className={inputCls} value={cmpId} onChange={(e) => setCmpId(e.target.value)}><option value="">Choose a report…</option>{others.map((r) => <option key={r.id} value={r.id}>{r.id} · {fmt(r.createdAt)} · {r.categories.map((c) => CATEGORY[c].label).join(", ")}</option>)}</select>
                {cmp && (() => {
                  const cmpOlder = cmp.createdAt < o.createdAt;
                  const old = cmpOlder ? { o: cmp, src: cmpPhotos?.[0]?.uploadedUrl ?? cmpPhotos?.[0]?.previewUrl } : { o, src: photo?.uploadedUrl ?? photo?.previewUrl };
                  const rec = cmpOlder ? { o, src: photo?.uploadedUrl ?? photo?.previewUrl } : { o: cmp, src: cmpPhotos?.[0]?.uploadedUrl ?? cmpPhotos?.[0]?.previewUrl };
                  const days = Math.round((+new Date(rec.o.createdAt) - +new Date(old.o.createdAt)) / 864e5);
                  return <><BeforeAfter before={old.src} after={rec.src} beforeLabel={`${old.o.id} · ${fmt(old.o.createdAt)}`} afterLabel={`${rec.o.id} · ${fmt(rec.o.createdAt)}`} /><p className="text-xs text-ink-2">{days} day{days === 1 ? "" : "s"} apart. Lighting, angle and weather can change how a place looks, so compare with care. This is a visual aid, not a measurement.</p></>;
                })()}
              </div>
            </Card>
          )}
          {isExpert && <Card><CardHeader title="Audit log" sub="Reviewers only" /><div className="p-5"><AuditLog observationId={o.id} /></div></Card>}
          <Card>
            <CardHeader title="Evidence timeline" />
            <div className="p-5 pl-8">{tl.length ? <ObservationTimeline events={tl} /> : <p className="text-sm text-ink-2">No events recorded.</p>}</div>
          </Card>
        </div>
      </div>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit your report" footer={<><Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button><Button onClick={() => edit.mutate()} disabled={edit.isPending || !editCats.length}>Save changes</Button></>}>
        <fieldset className="mb-4"><legend className="mb-1.5 font-medium">Categories</legend><div className="flex flex-wrap gap-1.5">{(Object.keys(CATEGORY) as ObservationCategory[]).map((c) => <Chip key={c} active={editCats.includes(c)} onClick={() => setEditCats(editCats.includes(c) ? editCats.filter((x) => x !== c) : [...editCats, c])}>{CATEGORY[c].label}</Chip>)}</div></fieldset>
        <label htmlFor="edit-desc" className="mb-1.5 block font-medium">Description</label>
        <textarea id="edit-desc" rows={4} maxLength={1000} className={inputCls} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
        <p className="mt-2 text-xs text-ink-2">Photo and location can’t be changed. To change them, withdraw this report and submit a new one. Edits are recorded in the audit log that reviewers can see.</p>
      </Dialog>
      <Dialog open={wdOpen} onClose={() => setWdOpen(false)} title="Withdraw this report?" footer={<><Button variant="secondary" onClick={() => setWdOpen(false)}>Keep report</Button><Button variant="danger" onClick={() => withdraw.mutate()} disabled={withdraw.isPending}>Withdraw report</Button></>}>
        <p>{o.id} will be labelled <strong>Withdrawn</strong> and removed from the map. The record is kept for transparency, and this can’t be undone here.</p>
        <label htmlFor="wd-reason" className="mt-3 mb-1.5 block font-medium">Reason (optional)</label>
        <textarea id="wd-reason" rows={2} className={inputCls} value={wdReason} onChange={(e) => setWdReason(e.target.value)} placeholder="e.g. Submitted by mistake" />
      </Dialog>
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add requested information" footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={() => addInfo.mutate()} disabled={!extra.trim() || addInfo.isPending}>Submit information</Button></>}>
        {review?.publicNote && <p className="mb-3 rounded-lg bg-muted p-3 text-[13px]"><strong>Reviewer asked:</strong> {review.publicNote}</p>}
        <label htmlFor="extra" className="mb-1.5 block font-medium">Your response</label>
        <textarea id="extra" rows={4} className={inputCls} value={extra} onChange={(e) => setExtra(e.target.value)} />
        <p className="mt-2 text-xs text-ink-2">Additional photo uploads will be available once backend storage is connected.</p>
      </Dialog>
    </>
  );
}
