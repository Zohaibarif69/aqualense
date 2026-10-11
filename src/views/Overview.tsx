"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { Camera, CheckCircle2, Clock, Eye, Map as MapIcon, MapPin } from "lucide-react";
import { useIndicators, useObservations, usePhotos, useSites } from "@/hooks/queries";
import FreshwaterMap, { DEFAULT_LAYERS, LAYER_LABEL, type LayerKey } from "@/components/FreshwaterMap";
import { Badge, Card, CardHeader, DataFreshnessLabel, DemoBadge, EmptyState, ErrorState, ListSkeleton, MetricCard, PageHeader, StatusBadge, btnLink } from "@/components/ui";
import { Thumb } from "@/components/observations";
import { CATEGORY, STATUS, priorityText, rel } from "@/utils/labels";

export const CHART = ["#087F8C", "#2563A6", "#A9650A", "#237A57", "#16324F", "#74838C", "#5FB3B9", "#B42332"];
const RANGES = { 7: "Last 7 days", 30: "Last 30 days", 90: "Last 90 days" } as const;

export default function Overview() {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const from = useMemo(() => subDays(new Date(), range).toISOString(), [range]);
  const all = useObservations({ from });
  const sites = useSites();
  const obs = all.data ?? [];
  const photos = usePhotos(obs.slice(0, 5).flatMap((o) => o.photoIds));
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const nav = useRouter();
  const focusSite = sites.data?.find((s) => s.monitoringPriority === "high");
  const env = useIndicators(focusSite?.id);

  const daily = useMemo(() => Array.from({ length: Math.min(range, 30) }, (_, i) => {
    const d = startOfDay(subDays(new Date(), Math.min(range, 30) - 1 - i));
    return { day: format(d, "d MMM"), count: obs.filter((o) => startOfDay(new Date(o.createdAt)).getTime() === d.getTime()).length };
  }), [obs, range]);
  const cats = useMemo(() => Object.entries(obs.reduce<Record<string, number>>((a, o) => { o.categories.forEach((c) => (a[CATEGORY[c].label] = (a[CATEGORY[c].label] ?? 0) + 1)); return a; }, {})).map(([name, value]) => ({ name, value })), [obs]);
  const stat = useMemo(() => Object.entries(obs.reduce<Record<string, number>>((a, o) => ((a[STATUS[o.status].label] = (a[STATUS[o.status].label] ?? 0) + 1), a), {})).map(([name, value]) => ({ name, value })), [obs]);

  const verified = obs.filter((o) => o.status === "verified" || o.status === "corrected").length;
  const awaiting = obs.filter((o) => o.status === "awaiting_review" || o.status === "under_review").length;

  return (
    <>
      <PageHeader title="Freshwater Overview" description="Explore observations, environmental context, and monitoring activity."
        meta={<><DemoBadge /><DataFreshnessLabel at={new Date().toISOString()} /></>}
        actions={<>
          <label className="sr-only" htmlFor="range">Date range</label>
          <select id="range" value={range} onChange={(e) => setRange(+e.target.value as 7)} className="h-10 rounded-lg border border-line bg-surface px-3 text-sm">{Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <Link href="/app/map" className={btnLink("secondary")}><MapIcon size={16} /> Explore Map</Link>
          <Link href="/app/observations/new" className={btnLink()}><Camera size={16} /> Report Observation</Link>
        </>} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard loading={all.isLoading} label="Total Observations" value={obs.length} icon={<Eye size={18} />} hint={`Submitted in the ${RANGES[range].toLowerCase()} (demo)`} />
        <MetricCard loading={all.isLoading} label="Awaiting Expert Review" value={awaiting} icon={<Clock size={18} />} hint="Awaiting or under review" />
        <MetricCard loading={all.isLoading} label="Expert-Verified" value={verified} icon={<CheckCircle2 size={18} />} hint="Confirmed or corrected by an expert" />
        <MetricCard loading={sites.isLoading} label="Monitoring Sites" value={sites.data?.length} icon={<MapPin size={18} />} hint="AquaConnect sites across five cities" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <CardHeader title="Freshwater map" sub="Toggle layers independently" action={<Link href="/app/map" className="text-sm font-semibold text-primary">Full map</Link>} />
          <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-line px-5 py-3">
            {(["sites", "observations", "verified", "priority"] as LayerKey[]).map((k) => <label key={k} className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-primary" checked={layers[k]} onChange={() => setLayers({ ...layers, [k]: !layers[k] })} />{LAYER_LABEL[k]}</label>)}
          </div>
          <FreshwaterMap sites={sites.data} observations={obs} layers={layers} className="h-[380px]" onSelect={(k, id) => nav.push(k === "site" ? `/app/sites/${id}` : `/app/observations/${id}`)} />
        </Card>
        <Card>
          <CardHeader title="Recent observations" action={<Link href="/app/observations" className="text-sm font-semibold text-primary">View all</Link>} />
          {all.isLoading ? <ListSkeleton /> : all.isError ? <ErrorState onRetry={() => all.refetch()} /> : obs.length === 0 ? <EmptyState title="No observations in this period" /> : (
            <ul className="divide-y divide-line">{obs.slice(0, 5).map((o) => (
              <li key={o.id}><Link href={`/app/observations/${o.id}`} className="flex gap-3 px-5 py-3 hover:bg-muted/60">
                <Thumb photo={photos.data?.find((p) => p.id === o.photoIds[0])} alt={`Observation ${o.id}`} className="size-14 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{o.location.placeName}</p><p className="truncate text-xs text-ink-2">{CATEGORY[o.categories[0]].label} · {rel(o.createdAt)}</p><div className="mt-1"><StatusBadge status={o.status} /></div></div>
              </Link></li>))}</ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Observations over time" sub="Count per day (demo)" />
          <div className="h-60 p-4" role="img" aria-label={`Bar chart of daily observations. Total ${obs.length}.`}>
            {obs.length === 0 ? <EmptyState title="No data for this period" /> : (
              <ResponsiveContainer><BarChart data={daily}><CartesianGrid vertical={false} stroke="#DCE5E9" /><XAxis dataKey="day" tick={{ fontSize: 11, fill: "#607480" }} interval="preserveStartEnd" /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#607480" }} width={28} label={{ value: "Observations", angle: -90, position: "insideLeft", fontSize: 11, fill: "#607480" }} /><Tooltip /><Bar dataKey="count" name="Observations" fill="#087F8C" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Verification status" sub="Distribution across observations" />
          <div className="h-60 p-2">
            {stat.length === 0 ? <EmptyState title="No data" /> : <ResponsiveContainer><PieChart><Pie data={stat} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>{stat.map((_, i) => <Cell key={i} fill={CHART[i % CHART.length]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer>}
          </div>
          <p className="sr-only">{stat.map((s) => `${s.name}: ${s.value}`).join(", ")}</p>
        </Card>
        <Card>
          <CardHeader title="Environmental context" sub={focusSite ? `${focusSite.name} · ${priorityText(focusSite)}` : "—"} action={<Link href="/app/environment" className="text-sm font-semibold text-primary">Outlook</Link>} />
          {env.isLoading ? <ListSkeleton rows={3} /> : env.isError ? <ErrorState message="Environmental data could not be refreshed." onRetry={() => env.refetch()} /> : (
            <ul className="divide-y divide-line">{env.data?.slice(0, 4).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3"><span className="text-sm">{i.name}</span>{i.dataStatus === "missing" ? <span className="text-xs text-neutral">Not connected</span> : <Badge tone={i.dataStatus === "stale" ? "warning" : "neutral"}>{i.level ?? `${i.value} ${i.unit}`}</Badge>}</li>
            ))}<li className="px-5 py-3"><DataFreshnessLabel at={env.data?.[0]?.observedAt} /></li></ul>
          )}
        </Card>
        <Card className="lg:col-span-2 xl:col-span-3">
          <CardHeader title="Observation categories" sub="Citizen-selected categories (one observation may have several)" />
          <div className="h-56 p-4">{cats.length === 0 ? <EmptyState title="No data" /> : <ResponsiveContainer><BarChart data={cats} layout="vertical" margin={{ left: 40 }}><CartesianGrid horizontal={false} stroke="#DCE5E9" /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: "#182B36" }} /><Tooltip /><Bar dataKey="value" name="Observations" fill="#2563A6" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer>}</div>
        </Card>
      </div>
    </>
  );
}
