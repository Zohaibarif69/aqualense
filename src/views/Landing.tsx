"use client";

import Link from "next/link";
import { ArrowRight, Camera, CheckCircle2, ClipboardCheck, FlaskConical, History, Layers, MapPinned, ScanSearch, Sprout, User } from "lucide-react";
import { IMG } from "@/mocks/data";
import { useIndicators, useObservations, useSites } from "@/hooks/queries";
import FreshwaterMap, { MapLegend } from "@/components/FreshwaterMap";
import { Badge, DemoBadge, btnLink } from "@/components/ui";
import { CATEGORY, priorityText } from "@/utils/labels";

const STEPS = [
  { t: "Capture a photo", d: "Photograph the stream, river or lake condition you noticed.", I: Camera },
  { t: "Review AI-assisted findings", d: "See possible visual findings and tell us if they look right.", I: ScanSearch },
  { t: "Add local context", d: "Choose what you observed and add any details. Then submit.", I: MapPinned },
  { t: "Experts review evidence", d: "Authorized reviewers inspect the photo alongside environmental context.", I: ClipboardCheck },
  { t: "Verified observations inform monitoring", d: "Reviewed evidence builds a shared record over time.", I: History },
];
const CAPS = [
  { t: "Citizen reporting", d: "A short, mobile-first flow to submit photos, locations and observations.", I: Camera },
  { t: "AI-assisted visual screening", d: "Advisory suggestions that highlight possible litter, foam or discoloration.", I: FlaskConical },
  { t: "Environmental context", d: "Weather, hydrology and river-network relationships shown with sources.", I: Sprout },
  { t: "Expert verification", d: "Reviewers confirm, correct, or request more information, with an audit trail.", I: ClipboardCheck },
  { t: "Historical monitoring", d: "Explore observation and context trends over time by site and category.", I: Layers },
];

export default function Landing() {
  const { data: sites } = useSites();
  const { data: obs } = useObservations();
  const sample = obs?.find((o) => o.location.siteId);
  const sampleSite = sites?.find((s) => s.id === sample?.location.siteId);
  const { data: ctx } = useIndicators(sample?.location.siteId);
  return (
    <>
      <section className="relative overflow-hidden bg-navy">
        <img src={`${IMG.hero}&w=1800`} alt="A river running through a lush green forest" className="absolute inset-0 h-full w-full object-cover opacity-45" fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/80 to-navy/10" />
        <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-32">
          <p className="mb-4 text-sm font-semibold tracking-wider text-[#7FE0E2] uppercase">Freshwater intelligence & citizen verification</p>
          <h1 className="max-w-2xl text-4xl leading-[1.08] font-bold tracking-tight text-white sm:text-6xl">Understand freshwater. Observe change.</h1>
          <p className="mt-6 max-w-xl text-lg text-white/80">AquaLens brings together photos from people who know their local waterways, advisory AI screening, environmental context and expert review — so every observation is evidence you can trace.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/app/map" className={btnLink() + " h-12 px-6"}>Explore the Map <ArrowRight size={16} /></Link>
            <Link href="/app/observations/new" className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"><Camera size={16} /> Report an Observation</Link>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-2xl font-semibold text-navy sm:text-3xl">How it works</h2>
        <p className="mt-2 max-w-xl text-ink-2">From a photo on the riverbank to reviewed evidence, each step is visible and labeled by its source.</p>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(({ t, d, I }, i) => (
            <li key={t} className="relative">
              <div className="mb-4 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-primary-light text-primary"><I size={20} aria-hidden /></span><span className="text-sm font-bold text-ink-2 tabular-nums">0{i + 1}</span></div>
              <h3 className="font-semibold text-navy">{t}</h3><p className="mt-1 text-sm text-ink-2">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-bg py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-2xl font-semibold text-navy sm:text-3xl">Platform capabilities</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPS.map(({ t, d, I }) => <div key={t} className="rounded-xl border border-line bg-surface p-6"><I size={22} className="text-primary" aria-hidden /><h3 className="mt-4 font-semibold text-navy">{t}</h3><p className="mt-1 text-sm text-ink-2">{d}</p></div>)}
            <div className="rounded-xl bg-navy p-6 text-white"><p className="font-semibold">Built to connect</p><p className="mt-1 text-sm text-white/75">Image analysis, environmental models and sensors integrate through documented service interfaces.</p></div>
          </div>
        </div>
      </section>

      {sample && sampleSite && (
        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-2xl font-semibold text-navy sm:text-3xl">Environmental context next to every report</h2>
          <p className="mt-2 max-w-2xl text-ink-2">Each photo report is linked to the nearest monitoring site, so reviewers see real weather, river-flow and screening context beside the evidence.</p>
          <div className="mt-8 grid overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-2">
            <div className="p-6">
              <div className="mb-3 flex flex-wrap gap-2"><DemoBadge /><Badge>Citizen report</Badge></div>
              <p className="font-semibold text-navy">{sample.location.placeName ?? sampleSite.name}</p>
              <p className="mt-1 text-sm text-ink-2">{sample.categories.map((c) => CATEGORY[c]?.label ?? c).join(", ") || "Observation"}</p>
              {sample.description && <p className="mt-3 text-sm text-ink">{sample.description}</p>}
            </div>
            <div className="border-t border-line bg-bg p-6 md:border-t-0 md:border-l">
              <div className="mb-3 flex flex-wrap gap-2"><Badge tone="success">AquaConnect data</Badge><Badge tone="warning">{priorityText(sampleSite)}</Badge></div>
              <p className="font-semibold text-navy">{sampleSite.name} · {sampleSite.city}</p>
              <ul className="mt-3 divide-y divide-line text-sm">
                {ctx?.filter((i) => i.dataStatus !== "missing").slice(0, 4).map((i) => <li key={i.id} className="flex items-center justify-between gap-3 py-2"><span>{i.name}</span><span className="text-right text-xs text-ink-2">{i.level ?? `${i.value} ${i.unit}`}</span></li>)}
              </ul>
              <p className="mt-3 text-xs text-ink-2">Screening signals, not confirmed conditions.</p>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="text-2xl font-semibold text-navy sm:text-3xl">Map preview</h2><p className="mt-2 text-ink-2">Real monitoring sites in five European cities, with demo citizen observations.</p></div>
          <DemoBadge />
        </div>
        <div className="grid overflow-hidden rounded-2xl border border-line lg:grid-cols-[1fr_260px]">
          <FreshwaterMap sites={sites} observations={obs} className="h-[420px]" />
          <div className="border-t border-line bg-surface p-5 lg:border-t-0 lg:border-l"><p className="mb-3 text-sm font-semibold text-navy">Legend</p><MapLegend /><Link href="/app/map" className={btnLink("secondary") + " mt-6 w-full"}>Open full map</Link></div>
        </div>
      </section>

      <section className="bg-navy py-20 text-white">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-2xl font-semibold sm:text-3xl">Trust and transparency</h2>
          <p className="mt-2 max-w-2xl text-white/75">Every piece of information in AquaLens is labeled by where it came from. These are separate sources of evidence and are never merged into one status.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[{ I: User, t: "Reported", d: "What a citizen observed and photographed. A valuable first-hand account." },
              { I: FlaskConical, t: "AI-suggested", d: "Possible visual features flagged by image screening. Advisory only — reviewers can override it." },
              { I: CheckCircle2, t: "Expert-verified", d: "An authorized reviewer assessed the evidence and recorded a decision." }].map(({ I, t, d }) => (
              <div key={t} className="rounded-xl border border-white/15 bg-white/5 p-6"><I size={22} className="text-[#7FE0E2]" aria-hidden /><h3 className="mt-4 font-semibold">{t}</h3><p className="mt-1 text-sm text-white/70">{d}</p></div>
            ))}
          </div>
          <p className="mt-8 rounded-xl border border-warning/40 bg-warning/15 p-4 text-sm text-white/90"><strong>Visual analysis is not a laboratory water-quality test.</strong> AquaLens does not determine whether water is safe for drinking, swimming or other use.</p>
        </div>
      </section>
    </>
  );
}
