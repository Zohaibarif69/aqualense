"use client";

import { uuid } from "@/lib/uuid";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Save, ShieldCheck, ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Crosshair, ImagePlus, Loader2, Mic, RefreshCw, Trash2, Upload, Fish, Droplet, Leaf, Waves, Trash, HelpCircle, Sparkles, MoreHorizontal } from "lucide-react";
import { api } from "@/services";
import { config } from "@/services/config";
import { useSites } from "@/hooks/queries";
import FreshwaterMap from "@/components/FreshwaterMap";
import { AIFindingsPanel, PhotoWithBoxes } from "@/components/observations";
import { Badge, Button, Card, CategoryBadge, Notice, Spinner, btnLink, cx, inputCls, Field, useToast } from "@/components/ui";
import { stripPhotoMetadata } from "@/utils/stripMetadata";
import type { AIAnalysis, CitizenAssessment, Observation, ObservationCategory } from "@/types";
import { CATEGORY, fmt } from "@/utils/labels";

type Quality = "checking" | "accepted" | "blurry" | "dark" | "far" | "irrelevant" | "unavailable";
interface Draft {
  lat?: number; lng?: number; siteId?: string; precision: "precise" | "approximate"; locConfirmed: boolean;
  file?: File; preview?: string; quality?: Quality; qualityOverride?: boolean;
  categories: ObservationCategory[]; analysis?: AIAnalysis;
  description: string; observedAt: string; seenBefore?: "yes" | "no" | "unsure"; consent: boolean;
}
// Drafts live in this browser only (localStorage). Photos are not stored in drafts, so they must be added again.
const DRAFT_KEY = "aqualens:report-draft:v1";
interface SavedDraft { savedAt: string; step: number; d: Pick<Draft, "lat" | "lng" | "siteId" | "precision" | "categories" | "description" | "observedAt" | "seenBefore"> }
const readDraft = (): SavedDraft | null => { try { const r = localStorage.getItem(DRAFT_KEY); return r ? (JSON.parse(r) as SavedDraft) : null; } catch { return null; } };
const writeDraft = (v: SavedDraft): boolean => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); return true; } catch { return false; } };
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };
const STEPS = ["Location", "Photo", "Quality", "What you saw", "AI findings", "Details", "Review"];
const CAT_ICON: Record<ObservationCategory, typeof Trash> = { litter: Trash, discoloration: Droplet, foam: Waves, vegetation: Leaf, oil_like_surface: Sparkles, aquatic_life_concern: Fish, other: MoreHorizontal, unsure: HelpCircle };
const Q_MSG: Record<Exclude<Quality, "checking">, { t: string; d: string; ok: boolean }> = {
  accepted: { t: "Image accepted", d: "The photo looks clear enough to review.", ok: true },
  blurry: { t: "Image may be blurry", d: "Fine details may be hard for reviewers to see.", ok: false },
  dark: { t: "Image may be too dark", d: "Low light can hide the condition you want to report. Try retaking in better light if you can.", ok: false },
  far: { t: "Image may be too far away", d: "Try moving closer to the condition.", ok: false },
  irrelevant: { t: "Image may not show a waterway", d: "Make sure the stream, river or lake is visible.", ok: false },
  unavailable: { t: "Quality check unavailable", d: "We could not check this photo. You can still continue.", ok: true },
};

export default function Report() {
  const nav = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: sites = [] } = useSites();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>({ precision: "precise", locConfirmed: false, categories: [], description: "", observedAt: "", consent: false });
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const [err, setErr] = useState<string>();
  const [geo, setGeo] = useState<"idle" | "locating" | "denied">("idle");
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<Observation>();
  const idem = useRef(uuid());
  const fileRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<SavedDraft | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleaned, setCleaned] = useState(false);
  useEffect(() => { setSaved(readDraft()); }, []);
  const saveDraft = () => {
    const ok = writeDraft({ savedAt: new Date().toISOString(), step, d: { lat: d.lat, lng: d.lng, siteId: d.siteId, precision: d.precision, categories: d.categories, description: d.description, observedAt: d.observedAt, seenBefore: d.seenBefore } });
    if (ok) { setSaved(readDraft()); toast("Draft saved on this device. The photo isn’t saved, so you’ll add it again when you resume.", "info"); } else toast("Couldn’t save the draft — your browser blocked storage.", "danger");
  };
  const resumeDraft = () => { if (!saved) return; setD((x) => ({ ...x, ...saved.d, locConfirmed: saved.d.lat != null })); setStep(saved.d.lat != null ? Math.min(saved.step, 1) : 0); setSaved(null); toast("Draft restored. Add your photo to continue."); };
  const discardDraft = () => { clearDraft(); setSaved(null); };
  const dirty = !!(d.lat || d.file || d.categories.length || d.description);

  useEffect(() => {
    if (!dirty || done) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty, done]);

  const submit = useMutation({
    mutationFn: () => api.observations.create({
      idempotencyKey: idem.current,
      location: { latitude: d.precision === "approximate" ? +d.lat!.toFixed(2) : d.lat, longitude: d.precision === "approximate" ? +d.lng!.toFixed(2) : d.lng, siteId: d.siteId, placeName: sites.find((s) => s.id === d.siteId)?.name ?? "Custom location", precision: d.precision },
      photo: d.file ? { file: d.file, previewUrl: d.preview!, qualityStatus: d.quality === "accepted" ? "accepted" : d.quality === "unavailable" ? "unavailable" : "warning" } : undefined,
      categories: d.categories, description: d.description || undefined, observedAt: d.observedAt ? new Date(d.observedAt).toISOString() : undefined, seenBefore: d.seenBefore, analysis: d.analysis,
    }),
    onSuccess: (o) => { setDone(o); clearDraft(); qc.invalidateQueries(); },
  });

  const runChecks = (file: File) => {
    set({ quality: "checking", analysis: { id: "", status: "processing", findings: [] } });
    api.ai.checkQuality(file).then((r) => set({ quality: r.status }));
    api.ai.analyze(file).then((a) => set({ analysis: a })).catch(() => set({ analysis: { id: "", status: "failed", findings: [], message: "AI analysis is temporarily unavailable. You can continue without it." } }));
  };
  const onFile = async (original?: File) => {
    setErr(undefined);
    if (!original) return;
    if (!config.acceptedImageTypes.includes(original.type)) return setErr("Please choose a JPEG, PNG or WebP image.");
    if (original.size > config.maxUploadBytes) return setErr(`This image is ${(original.size / 1048576).toFixed(1)} MB. The maximum is ${config.maxUploadBytes / 1048576} MB.`);
    // Remove GPS, camera and other hidden metadata before the photo goes anywhere (analysis or upload).
    setCleaning(true); setCleaned(false);
    let f: File;
    try { f = await stripPhotoMetadata(original); setCleaned(true); }
    catch { setCleaning(false); return setErr("We couldn’t remove the hidden location and camera data from this photo, so it wasn’t added. Please try another photo or take a new one."); }
    setCleaning(false);
    if (f.size > config.maxUploadBytes) return setErr(`This image is ${(f.size / 1048576).toFixed(1)} MB. The maximum is ${config.maxUploadBytes / 1048576} MB.`);
    if (d.preview) URL.revokeObjectURL(d.preview);
    set({ file: f, preview: URL.createObjectURL(f), qualityOverride: false });
    setProgress(0);
    let p = 0; const t = setInterval(() => { p += 20; setProgress(p); if (p >= 100) clearInterval(t); }, 120);
    runChecks(f);
  };
  const retryAnalysis = () => {
    if (!d.file) return;
    set({ analysis: { id: "", status: "processing", findings: [] } });
    api.ai.analyze(d.file).then((a) => set({ analysis: a })).catch(() => set({ analysis: { id: "", status: "failed", findings: [], message: "AI analysis is still unavailable. You can continue without it." } }));
  };
  const removePhoto = () => { if (d.preview) URL.revokeObjectURL(d.preview); set({ file: undefined, preview: undefined, quality: undefined, analysis: undefined }); setCleaned(false); };
  const locate = () => {
    if (!navigator.geolocation) return setGeo("denied");
    setGeo("locating");
    navigator.geolocation.getCurrentPosition((p) => { setGeo("idle"); set({ lat: p.coords.latitude, lng: p.coords.longitude, siteId: undefined, locConfirmed: false }); }, () => setGeo("denied"), { timeout: 8000 });
  };
  const assess = (id: string, v: CitizenAssessment) => set({ analysis: d.analysis && { ...d.analysis, findings: d.analysis.findings.map((f) => (f.id === id ? { ...f, citizenAssessment: v } : f)) } });

  const canNext = [
    d.lat != null && d.locConfirmed,
    !!d.file && progress >= 100,
    d.quality != null && d.quality !== "checking" && (Q_MSG[d.quality].ok || !!d.qualityOverride),
    d.categories.length > 0,
    d.analysis?.status !== "processing",
    true,
    d.consent,
  ][step];
  const hint = ["Select a location on the map and confirm it.", "Add a photo to continue.", "Wait for the check, or choose to use this photo anyway.", "Select at least one option (or “Not sure”).", "Waiting for image analysis…", "", "Please agree to the submission terms."][step];

  if (done) return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-light text-success"><CheckCircle2 size={28} /></span>
      <h1 className="mt-4 text-2xl font-bold text-navy">Observation submitted</h1>
      <p className="mt-2 text-ink-2">Thank you. Your observation has been recorded.</p>
      <dl className="mx-auto mt-6 grid max-w-xs grid-cols-2 gap-y-2 text-left text-sm">
        <dt className="text-ink-2">Reference ID</dt><dd className="font-semibold">{done.id}</dd>
        <dt className="text-ink-2">Submitted</dt><dd>{fmt(done.createdAt)}</dd>
        <dt className="text-ink-2">Status</dt><dd>Submitted — awaiting review</dd>
      </dl>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href={`/app/observations/${done.id}`} className={btnLink()}>View My Report</Link>
        <Link href="/app/map" className={btnLink("secondary")}>Explore Map</Link>
        <button onClick={() => { idem.current = uuid(); setDone(undefined); setStep(0); submit.reset(); setD({ precision: "precise", locConfirmed: false, categories: [], description: "", observedAt: "", consent: false }); }} className={btnLink("secondary")}>Report Another</button>
      </div>
    </Card>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-navy lg:text-[28px]">Report an observation</h1>
      <p className="mt-1 text-sm text-ink-2">Takes about two minutes. Your details stay saved between steps.</p>
      <ol className="mt-5 mb-6 flex gap-1" aria-label="Progress">
        {STEPS.map((s, i) => <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}><div className={cx("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-line")} /><span className={cx("mt-1.5 hidden text-[11px] font-medium md:block", i === step ? "text-primary" : "text-ink-2")}>{s}</span></li>)}
      </ol>
      <p className="mb-3 text-xs font-semibold text-ink-2 md:hidden">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>

      {saved && !dirty && (
        <div className="mb-4"><Notice tone="info" title="You have a saved draft">Saved {fmt(saved.savedAt)} on this device. <span className="mt-2 flex gap-2"><Button size="sm" onClick={resumeDraft}>Resume draft</Button><Button size="sm" variant="secondary" onClick={discardDraft}>Discard</Button></span></Notice></div>
      )}
      <Card className="p-5 sm:p-6">
        {step === 0 && (
          <div className="space-y-4">
            <div><h2 className="text-lg font-semibold text-navy">Where did you see it?</h2><p className="text-sm text-ink-2">Tap the map, use your location, or choose a monitoring site.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={locate} disabled={geo === "locating"}>{geo === "locating" ? <Loader2 size={16} className="animate-spin" /> : <Crosshair size={16} />}Use My Location</Button>
              <select aria-label="Choose a monitoring site" className={cx(inputCls, "w-auto flex-1")} value={d.siteId ?? ""} onChange={(e) => { const s = sites.find((x) => x.id === e.target.value); set(s ? { siteId: s.id, lat: s.latitude, lng: s.longitude, locConfirmed: false } : { siteId: undefined }); }}>
                <option value="">Search or select a monitoring site (optional)</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.waterbodyName}</option>)}
              </select>
            </div>
            {geo === "denied" && <Notice tone="warning">We couldn't access your location. That's fine — tap the map to choose the spot manually.</Notice>}
            <FreshwaterMap sites={sites} layers={{ sites: true, observations: false, verified: false, priority: false, river: true, drainage: false, gisRivers: true, gisWatersheds: false }} className="h-72 rounded-xl border border-line sm:h-80" picked={d.lat != null ? [d.lat, d.lng!] : undefined} focus={d.lat != null ? [d.lat, d.lng!] : undefined} onPick={(lat, lng) => set({ lat, lng, locConfirmed: false })} onSelect={(_, id) => { const s = sites.find((x) => x.id === id); s && set({ siteId: s.id, lat: s.latitude, lng: s.longitude, locConfirmed: false }); }} />
            {d.lat != null && (
              <div className="space-y-3 rounded-lg bg-muted p-4">
                <p className="text-sm"><span className="text-ink-2">Selected: </span><strong>{d.precision === "approximate" ? `${d.lat.toFixed(2)}, ${d.lng!.toFixed(2)} (approx. ~1 km)` : `${d.lat.toFixed(5)}, ${d.lng!.toFixed(5)}`}</strong>{d.siteId && <> · near {sites.find((s) => s.id === d.siteId)?.name}</>}</p>
                <fieldset className="flex flex-wrap gap-4 text-sm"><legend className="sr-only">Location precision</legend>
                  <label className="flex items-center gap-2"><input type="radio" className="accent-primary" checked={d.precision === "precise"} onChange={() => set({ precision: "precise" })} />Share precise location</label>
                  <label className="flex items-center gap-2"><input type="radio" className="accent-primary" checked={d.precision === "approximate"} onChange={() => set({ precision: "approximate" })} />Share approximate location only</label>
                </fieldset>
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-primary" checked={d.locConfirmed} onChange={(e) => set({ locConfirmed: e.target.checked })} />This location is correct</label>
              </div>
            )}
            <p className="text-xs text-ink-2">Location is used only to place your observation on the map and match nearby environmental context.</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div><h2 className="text-lg font-semibold text-navy">Add a photo</h2><p className="text-sm text-ink-2">A clear photo of the condition helps reviewers most.</p></div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} aria-label="Choose photo" />
            {!d.preview ? (
              <button type="button" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files[0]); }} className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line bg-muted/50 px-6 py-14 text-center hover:border-primary hover:bg-primary-light/40">
                <span className="grid size-14 place-items-center rounded-full bg-primary-light text-primary"><ImagePlus size={26} /></span>
                <span className="font-semibold text-ink"><span className="sm:hidden">Take or choose a photo</span><span className="hidden sm:inline">Drag a photo here, or click to browse</span></span>
                <span className="text-xs text-ink-2">JPEG, PNG or WebP · up to {config.maxUploadBytes / 1048576} MB</span>
              </button>
            ) : (
              <div className="space-y-3">
                <img src={d.preview} alt="Preview of your photo" className="max-h-80 w-full rounded-xl bg-navy object-contain" />
                <div className="flex items-center gap-3 text-sm"><span className="truncate text-ink-2">{d.file?.name} · {(d.file!.size / 1048576).toFixed(1)} MB</span>
                  <div className="ml-auto flex gap-2"><Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><RefreshCw size={14} />Replace</Button><Button size="sm" variant="ghost" onClick={removePhoto}><Trash2 size={14} />Remove</Button></div>
                </div>
                <div><div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-xs text-ink-2">{progress < 100 ? `Preparing… ${progress}%` : "Ready"}</p></div>
              </div>
            )}
            {cleaning && <Spinner label="Removing hidden location and camera data…" />}
            {cleaned && !cleaning && <p className="flex items-center gap-1.5 text-xs text-success"><ShieldCheck size={14} />Hidden location and camera data (EXIF/GPS) was removed from this photo before upload.</p>}
            {err && <Notice tone="danger">{err}</Notice>}
            <p className="text-xs text-ink-2">Additional photos can be added once multi-photo support is approved.</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-navy">Photo quality check</h2>
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <img src={d.preview} alt="Your photo" className="aspect-square w-full rounded-xl object-cover" />
              <div>
                {d.quality === "checking" ? <Spinner label="Checking image…" /> : d.quality && (
                  <div className="space-y-3">
                    <Notice tone={Q_MSG[d.quality].ok ? "success" : "warning"} title={Q_MSG[d.quality].t}>{Q_MSG[d.quality].d}</Notice>
                    {!Q_MSG[d.quality].ok && <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { removePhoto(); setStep(1); }}><Camera size={16} />Retake Photo</Button><Button variant={d.qualityOverride ? "primary" : "secondary"} onClick={() => set({ qualityOverride: true })}>{d.qualityOverride && <Check size={16} />}Use This Photo Anyway</Button></div>}
                  </div>
                )}
                <p className="mt-4 text-xs text-ink-2">{config.aiProvider === "gemini" ? "Checked with AI (Google Gemini). It can be wrong, so use your own judgement." : "Demo: this check estimates brightness in your browser. A backend quality service will replace it."}</p>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <fieldset className="space-y-4">
            <legend><h2 className="text-lg font-semibold text-navy">What did you observe?</h2><p className="text-sm text-ink-2">Select all that apply. These are reporting options, not diagnoses — it's fine to be unsure.</p></legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(CATEGORY) as ObservationCategory[]).map((c) => { const I = CAT_ICON[c]; const on = d.categories.includes(c); return (
                <button key={c} type="button" aria-pressed={on} onClick={() => set({ categories: on ? d.categories.filter((x) => x !== c) : [...d.categories, c] })} className={cx("flex items-start gap-3 rounded-xl border p-4 text-left transition-colors", on ? "border-primary bg-primary-light" : "border-line hover:bg-muted")}>
                  <span className={cx("grid size-10 shrink-0 place-items-center rounded-lg", on ? "bg-primary text-white" : "bg-muted text-ink-2")}><I size={18} /></span>
                  <span><span className="block text-sm font-semibold">{CATEGORY[c].label}</span><span className="block text-xs text-ink-2">{CATEGORY[c].desc}</span></span>
                  {on && <Check size={16} className="ml-auto text-primary" />}
                </button>); })}
            </div>
          </fieldset>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div><h2 className="text-lg font-semibold text-navy">Possible findings from the image</h2><p className="text-sm text-ink-2">AI-generated suggestions to help reviewers. Please tell us whether each looks right — your view is recorded separately.</p></div>
            <PhotoWithBoxes src={d.preview} findings={d.analysis?.findings} showBoxes={d.analysis?.status === "completed"} alt="Your photo with possible findings outlined" />
            <AIFindingsPanel analysis={d.analysis} onAssess={assess} onRetry={retryAnalysis} />
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-navy">Add details <span className="text-sm font-normal text-ink-2">(all optional)</span></h2>
            <Field id="desc" label="Description" hint={`${d.description.length}/1000 characters`}><textarea id="desc" maxLength={1000} rows={4} className={inputCls} value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="What did you notice? Smell, extent, weather, anything unusual." /></Field>
            <Field id="obsat" label="When did you notice it?" hint="Leave blank if it was just now."><input id="obsat" type="datetime-local" className={inputCls} max={new Date().toISOString().slice(0, 16)} value={d.observedAt} onChange={(e) => set({ observedAt: e.target.value })} /></Field>
            <fieldset><legend className="mb-2 text-sm font-medium">Have you seen this here before?</legend><div className="flex flex-wrap gap-4 text-sm">{(["yes", "no", "unsure"] as const).map((v) => <label key={v} className="flex items-center gap-2 capitalize"><input type="radio" name="seen" className="accent-primary" checked={d.seenBefore === v} onChange={() => set({ seenBefore: v })} />{v === "unsure" ? "Not sure" : v}</label>)}</div></fieldset>
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-line p-4 text-sm text-ink-2"><Mic size={18} /><span>Voice notes {config.features.voiceNotes ? "" : "are not yet available (feature flag off)."}</span></div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-navy">Review and submit</h2>
            <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
              <img src={d.preview} alt="Your photo" className="aspect-square w-full rounded-xl object-cover" />
              <dl className="space-y-2.5 text-sm">
                <div><dt className="text-xs text-ink-2">Location</dt><dd>{sites.find((s) => s.id === d.siteId)?.name ?? "Custom location"} · {d.lat?.toFixed(d.precision === "approximate" ? 2 : 5)}, {d.lng?.toFixed(d.precision === "approximate" ? 2 : 5)} <Badge>{d.precision === "approximate" ? "Approximate" : "Precise"}</Badge></dd></div>
                <div><dt className="text-xs text-ink-2">What you observed</dt><dd className="mt-1 flex flex-wrap gap-1">{d.categories.map((c) => <CategoryBadge key={c} category={c} />)}</dd></div>
                <div><dt className="text-xs text-ink-2">AI-assisted findings & your responses</dt><dd>{d.analysis?.status === "completed" ? d.analysis.findings.map((f) => <p key={f.id}>{f.label}: <strong>{f.citizenAssessment ? { agree: "You agreed", disagree: "You disagreed", unsure: "Not sure" }[f.citizenAssessment] : "No response"}</strong></p>) : "Not available — continuing without AI findings"}</dd></div>
                <div><dt className="text-xs text-ink-2">Description</dt><dd>{d.description || "—"}</dd></div>
                {d.observedAt && <div><dt className="text-xs text-ink-2">Noticed at</dt><dd>{fmt(new Date(d.observedAt).toISOString())}</dd></div>}
              </dl>
            </div>
            <label className="flex items-start gap-3 rounded-lg bg-muted p-4 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={d.consent} onChange={(e) => set({ consent: e.target.checked })} /><span>I agree to the <Link href="/terms" className="font-semibold text-primary" target="_blank">submission terms</Link> and <Link href="/privacy" className="font-semibold text-primary" target="_blank">privacy notice</Link>, and confirm the photo was taken by me or I have permission to share it.</span></label>
            {submit.isError && <Notice tone="danger" title="Submission failed">{(submit.error as Error).message} Your information is still here — you can retry.</Notice>}
          </div>
        )}
      </Card>

      <div className="sticky bottom-16 mt-4 flex items-center justify-between gap-3 rounded-xl bg-bg/90 py-2 backdrop-blur lg:bottom-0">
        <Button variant="ghost" onClick={() => (step === 0 ? nav.back() : setStep(step - 1))} disabled={submit.isPending}><ArrowLeft size={16} />{step === 0 ? "Cancel" : "Back"}</Button>
        <div className="flex items-center gap-3">
          {dirty && <Button variant="ghost" size="sm" onClick={saveDraft} disabled={submit.isPending}><Save size={14} />Save draft</Button>}
          {!canNext && hint && <span className="hidden text-xs text-ink-2 sm:inline">{hint}</span>}
          {step < 6 ? <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Continue<ArrowRight size={16} /></Button>
            : <Button onClick={() => submit.mutate()} disabled={!canNext || submit.isPending}>{submit.isPending ? <><Loader2 size={16} className="animate-spin" />Submitting…</> : submit.isError ? <><RefreshCw size={16} />Retry submission</> : <><Upload size={16} />Submit Observation</>}</Button>}
        </div>
      </div>
      {d.analysis?.status === "failed" && step === 4 && <p className="mt-2 flex items-center gap-1 text-xs text-ink-2"><AlertTriangle size={12} />You can continue without AI findings.</p>}
    </div>
  );
}
