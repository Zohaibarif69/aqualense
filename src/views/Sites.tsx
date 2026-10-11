"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, LayoutList, Map as MapIcon, Radio } from "lucide-react";
import { useIndicators, useObservations, usePhotos, useSite, useSites } from "@/hooks/queries";
import FreshwaterMap from "@/components/FreshwaterMap";
import { EnvironmentalIndicatorCard, ModelLimitationsNotice } from "@/components/environment";
import { ObservationCard } from "@/components/observations";
import { Badge, Card, CardHeader, DataFreshnessLabel, EmptyState, ErrorState, ListSkeleton, PageHeader, btnLink, cx, inputCls } from "@/components/ui";
import { HistoryChart, MeasuredHistory, OutlookChart } from "./Environment";
import { PRIORITY, fmt, priorityText } from "@/utils/labels";

export default function Sites() {
  const q = useSites();
  const { data: obs = [] } = useObservations();
  const nav = useRouter();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [city, setCity] = useState("");
  const [prio, setPrio] = useState("");
  const [avail, setAvail] = useState("");
  const [view, setView] = useState<"list" | "map">("list");
  const list = useMemo(() => (q.data ?? []).filter((s) => (!search || `${s.name} ${s.id} ${s.city ?? ""} ${s.waterbodyName ?? ""}`.toLowerCase().includes(search.toLowerCase())) && (!type || s.siteType === type) && (!city || s.city === city) && (!prio || (s.monitoringPriority ?? "not_assessed") === prio) && (!avail || s.dataAvailability?.toLowerCase().includes(avail))), [q.data, search, type, avail, city, prio]);
  const types = [...new Set(q.data?.map((s) => s.siteType))];
  const cities = [...new Set(q.data?.map((s) => s.city).filter(Boolean))].sort() as string[];
  return (
    <>
      <PageHeader title="Monitoring Sites" description="Explore the monitoring network and the data available at each site." meta={<Badge tone="success">AquaConnect data</Badge>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_160px_160px_160px_auto]">
        <input aria-label="Search sites" className={inputCls} placeholder="Search by name, ID, or city" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="City" className={inputCls} value={city} onChange={(e) => setCity(e.target.value)}><option value="">All cities</option>{cities.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Monitoring priority" className={inputCls} value={prio} onChange={(e) => setPrio(e.target.value)}><option value="">Any priority</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="not_assessed">Not assessed</option></select>
        <select aria-label="Site type" className={inputCls} value={type} onChange={(e) => setType(e.target.value)}><option value="">All site types</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
        <select aria-label="Data availability" className={inputCls} value={avail} onChange={(e) => setAvail(e.target.value)}><option value="">Any data</option><option value="hydrology">Hydrology</option><option value="sensor">Sensor</option><option value="weather">Weather</option></select>
        <div className="flex rounded-lg border border-line bg-surface p-0.5">{(["list", "map"] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={cx("flex items-center gap-1.5 rounded-md px-3 text-sm font-medium capitalize", view === v ? "bg-primary-light text-primary" : "text-ink-2")}>{v === "list" ? <LayoutList size={15} /> : <MapIcon size={15} />}{v}</button>)}</div>
      </div>
      {view === "map" ? <Card className="overflow-hidden"><FreshwaterMap sites={list} className="h-[560px]" onSelect={(k, id) => nav.push(`/app/sites/${id}`)} layers={{ sites: true, observations: false, verified: false, priority: true, river: true, drainage: false, gisRivers: true, gisWatersheds: false }} /></Card> : (
        <Card className="overflow-hidden">
          {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : list.length === 0 ? <EmptyState title="No monitoring sites are available for this area." /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line bg-muted/60 text-left text-xs font-semibold text-ink-2 uppercase"><tr><th className="px-5 py-3">Site</th><th className="px-3">City</th><th className="px-3">Type</th><th className="px-3">Environmental data</th><th className="px-3">Recent obs.</th><th className="px-3">Latest data</th><th className="px-5" /></tr></thead>
              <tbody className="divide-y divide-line">{list.map((s) => (
                <tr key={s.id} className="hover:bg-muted/40"><td className="px-5 py-3"><p className="font-semibold">{s.name}</p><p className="text-xs text-ink-2">{s.id} · {s.latitude?.toFixed(3)}, {s.longitude?.toFixed(3)}</p></td><td className="px-3">{s.city ?? s.waterbodyName}</td><td className="px-3">{s.siteType}{s.hasSensor && <Badge tone="info" icon={<Radio size={11} />}>Sensor</Badge>}</td><td className="px-3 text-ink-2">{s.dataAvailability}</td><td className="px-3 tabular-nums">{obs.filter((o) => o.location.siteId === s.id).length}</td><td className="px-3"><DataFreshnessLabel at={s.lastUpdatedAt} stale={s.dataAvailability?.includes("stale")} /></td><td className="px-5 text-right"><Link href={`/app/sites/${s.id}`} className="font-semibold text-primary">Details</Link></td></tr>
              ))}</tbody></table></div>
          )}
        </Card>
      )}
    </>
  );
}

export function SiteDetail() {
  const { siteId } = useParams<{ siteId: string }>();
  const q = useSite(siteId);
  const { data: sites = [] } = useSites();
  const ind = useIndicators(siteId);
  const { data: obs = [] } = useObservations({ siteId });
  const photos = usePhotos(obs.flatMap((o) => o.photoIds));
  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError || !q.data) return <ErrorState message="We could not find that monitoring site." />;
  const s = q.data;
  const name = (id: string) => sites.find((x) => x.id === id)?.name ?? id;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-2"><Link href="/app/sites">Monitoring Sites</Link> / <span className="text-ink">{s.name}</span></nav>
      <PageHeader title={s.name} description={[s.id, s.city, s.waterbodyName, s.siteType].filter(Boolean).join(" · ")} meta={<><Badge tone="success">AquaConnect data</Badge><Badge tone="warning">{priorityText(s)}{s.priorityScore != null ? ` · score ${s.priorityScore}` : ""} (model)</Badge>{s.hasSensor ? <Badge tone="info">Sensor connected (demo)</Badge> : <Badge>No sensor</Badge>}<DataFreshnessLabel at={s.lastUpdatedAt} /></>} actions={<Link href={`/app/environment?site=${s.id}`} className={btnLink("secondary")}>Open in Environmental Outlook</Link>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden"><FreshwaterMap sites={sites} observations={obs} selectedId={s.id} focus={[s.latitude!, s.longitude!]} zoom={12} className="h-80" /></Card>
        <Card>
          <CardHeader title="River network" sub="From the AquaConnect network model — not inferred from proximity" />
          <div className="space-y-3 p-5 text-sm">
            <div><p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink-2 uppercase"><ArrowUp size={13} />Upstream</p>{s.upstreamSiteIds?.length ? s.upstreamSiteIds.map((id) => <Link key={id} href={`/app/sites/${id}`} className="block font-medium text-primary">{name(id)}</Link>) : <p className="text-ink-2">None mapped</p>}</div>
            <div className="rounded-lg bg-primary-light px-3 py-2 font-semibold text-primary-dark">{s.name}</div>
            <div><p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink-2 uppercase"><ArrowDown size={13} />Downstream</p>{s.downstreamSiteIds?.length ? s.downstreamSiteIds.map((id) => <Link key={id} href={`/app/sites/${id}`} className="block font-medium text-primary">{name(id)}</Link>) : <p className="text-ink-2">None mapped</p>}</div>
            <p className="border-t border-line pt-3 text-xs text-ink-2">Provenance: AquaConnect network model (potential pressure links, not observed pollutant transport) · snapshot {fmt(s.lastUpdatedAt)}</p>
          </div>
        </Card>
      </div>
      <h2 className="mt-8 mb-4 text-xl font-semibold text-navy">Latest environmental data</h2>
      <ModelLimitationsNotice />
      <div className="mt-4">{ind.isLoading ? <ListSkeleton /> : ind.isError ? <Card><ErrorState message="Environmental data could not be refreshed." onRetry={() => ind.refetch()} /></Card> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{ind.data?.map((i) => <EnvironmentalIndicatorCard key={i.id} i={i} />)}</div>}</div>
      <Card className="mt-6"><CardHeader title="Hydrological trend" sub="Observed vs forecast discharge" /><div className="p-5"><OutlookChart siteId={s.id} /></div></Card>
      <Card className="mt-6"><CardHeader title="Historical discharge" sub="Archived and current model outlooks" /><div className="p-5"><HistoryChart siteId={s.id} /></div></Card>
      <Card className="mt-6"><CardHeader title="Measured history" sub="Daily values from sensors and gauges linked to this site" /><div className="p-5"><MeasuredHistory siteId={s.id} /></div></Card>
      <h2 className="mt-8 mb-4 text-xl font-semibold text-navy">Nearby observations</h2>
      {obs.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{obs.map((o) => <ObservationCard key={o.id} o={o} photo={photos.data?.find((p) => p.id === o.photoIds[0])} hasAI={!!o.aiAnalysisId} />)}</div> : <Card><EmptyState title="No observations at this site yet." /></Card>}
    </>
  );
}
