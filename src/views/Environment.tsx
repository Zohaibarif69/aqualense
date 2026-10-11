"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryParams } from "@/hooks/useQueryParams";
import { Area, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { useQueries } from "@tanstack/react-query";
import { History } from "lucide-react";
import { api } from "@/services";
import { useDischargeHistory, useForecast, useIndicators, useObservations, useSiteMeasurements, useSites } from "@/hooks/queries";
import { PARAMS } from "@/lib/anomaly";
import type { MeasuredParameter } from "@/types";
import FreshwaterMap from "@/components/FreshwaterMap";
import { EnvironmentalIndicatorCard, ModelLimitationsNotice } from "@/components/environment";
import { Badge, Card, CardHeader, Chip, DataFreshnessLabel, EmptyState, ErrorState, ListSkeleton, Notice, PageHeader, Skeleton, inputCls } from "@/components/ui";
import { fmt, priorityText } from "@/utils/labels";

export function HistoryChart({ siteId }: { siteId: string }) {
  const q = useDischargeHistory(siteId);
  if (q.isLoading) return <Skeleton className="h-64" />;
  const data = (q.data ?? []).map((d) => ({ ...d, day: format(new Date(d.date), "d MMM"), outlook: d.status === "Forecast" ? d.value : null, archived: d.status === "Forecast" ? null : d.value }));
  if (!data.length) return <EmptyState title="No archived discharge for this site." body="Discharge is not modelled here." />;
  return (
    <>
      <div className="h-64" role="img" aria-label="Line chart of archived and forecast river discharge">
        <ResponsiveContainer><LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid stroke="#DCE5E9" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#607480" }} minTickGap={14} />
          <YAxis tick={{ fontSize: 11, fill: "#607480" }} width={44} />
          <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
          <Line dataKey="archived" name="Archived / current outlook" stroke="#16324F" strokeWidth={2} dot={false} connectNulls />
          <Line dataKey="outlook" name="Forecast" stroke="#087F8C" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
        </LineChart></ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-2">m³/s · {data[0].day} to {data[data.length - 1].day}. These are model outlooks saved from earlier AquaConnect releases, not gauge measurements. Measured history (sensors and gauges) is shown in the card below when it is connected.</p>
    </>
  );
}

const RANGES = [7, 30, 90, 365] as const;
const MEASURED: Record<MeasuredParameter, { label: string; unit: string }> = { ...PARAMS, discharge: { label: "River discharge (gauge)", unit: "m³/s" } };

/** Daily mean (line) with the daily min–max band, for as far back as stored measurements go. */
export function MeasuredHistory({ siteId }: { siteId: string }) {
  const [days, setDays] = useState<number>(90);
  const [param, setParam] = useState<MeasuredParameter>();
  const q = useSiteMeasurements(siteId, days);
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState message="Measured history couldn’t be loaded." onRetry={() => q.refetch()} />;
  const keys = Object.keys(q.data?.series ?? {}) as MeasuredParameter[];
  const p = param && keys.includes(param) ? param : keys[0];
  const rows = (p && q.data?.series[p]) || [];
  const data = rows.map((d) => ({ day: format(new Date(d.date), days > 120 ? "d MMM yy" : "d MMM"), mean: d.mean, range: [d.min, d.max] as [number, number], n: d.n }));
  const simulated = q.data?.source === "simulated";
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => <Chip key={r} active={days === r} onClick={() => setDays(r)}>{r === 365 ? "1 year" : `${r} days`}</Chip>)}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        {keys.map((k) => <Chip key={k} active={p === k} onClick={() => setParam(k)}>{MEASURED[k].label}</Chip>)}
      </div>
      {!p || !data.length ? <EmptyState title="No measurements stored for this site yet." body={simulated ? "No demo probe is linked to this site." : "Register a sensor linked to this site and send readings to /api/sensors/ingest, or load gauge discharge through /api/measurements/ingest. History builds up from the first reading."} /> : (
        <>
          <div className="h-64" role="img" aria-label={`${MEASURED[p].label} daily mean and range, last ${days} days`}>
            <ResponsiveContainer><ComposedChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid stroke="#DCE5E9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#607480" }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: "#607480" }} width={48} domain={["auto", "auto"]} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Area dataKey="range" name="Daily min–max" stroke="none" fill="#087F8C" fillOpacity={0.15} isAnimationActive={false} />
              <Line dataKey="mean" name={`Daily mean ${MEASURED[p].unit}`} stroke="#16324F" strokeWidth={2} dot={data.length < 40} isAnimationActive={false} />
            </ComposedChart></ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-ink-2">{MEASURED[p].label} ({MEASURED[p].unit}) · {data.length} day{data.length === 1 ? "" : "s"} with data · UTC days. {simulated ? "SIMULATED demo probes, not real measurements." : "Measured by registered sensors and gauges; days without readings are left blank."}</p>
        </>
      )}
    </>
  );
}

export function OutlookChart({ siteId }: { siteId: string }) {
  const q = useForecast(siteId);
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState message="The outlook cannot currently be refreshed." onRetry={() => q.refetch()} />;
  const data = (q.data ?? []).map((d) => ({ ...d, day: format(new Date(d.date), "EEE d") }));
  if (data.every((d) => d.observed == null && d.forecast == null)) return <EmptyState title="No hydrological data is available for this site." body="Discharge is not modelled or gauged here." />;
  const firstForecast = data.find((d) => d.forecast != null)?.day;
  return (
    <>
      <div className="h-64" role="img" aria-label="Line chart of recent and forecast river discharge over 14 days">
        <ResponsiveContainer><LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid stroke="#DCE5E9" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#607480" }} />
          <YAxis tick={{ fontSize: 11, fill: "#607480" }} width={44} label={{ value: "Discharge (m³/s)", angle: -90, position: "insideLeft", fontSize: 11, fill: "#607480", dy: 50 }} />
          <Tooltip formatter={(v) => (v == null ? "Missing" : `${v} m³/s`)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {firstForecast && <ReferenceLine x={firstForecast} stroke="#16324F" strokeDasharray="3 3" label={{ value: "Forecast starts", fontSize: 11, fill: "#16324F", position: "top" }} />}
          <Line dataKey="observed" name="Recent (archived model outlook)" stroke="#087F8C" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
          <Line dataKey="forecast" name="7-day forecast" stroke="#2563A6" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} />
        </LineChart></ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-2">Gaps indicate missing data, not zero. Source: AquaConnect · GloFAS v4 regional grid cell, so this is regional river-discharge context, not the exact flow of the local stream. The “recent” line is the archived model outlook, not a gauge measurement.</p>
    </>
  );
}

export default function Environment() {
  const [params, setParams] = useQueryParams();
  const sites = useSites();
  const siteId = params.get("site") ?? sites.data?.find((s) => s.monitoringPriority === "high")?.id ?? sites.data?.[0]?.id ?? "";
  const site = sites.data?.find((s) => s.id === siteId);
  const cities = [...new Set(sites.data?.map((s) => s.city ?? "Other"))].sort();
  const ind = useIndicators(siteId);
  const { data: obs = [] } = useObservations({ siteId });
  const [tab, setTab] = useState<"latest" | "outlook" | "history">("latest");
  const [picked, setPicked] = useState<string[] | null>(null);
  const [cmpCity, setCmpCity] = useState<string | null>(null);
  const defaultCompare = [siteId, sites.data?.find((s) => s.city === site?.city && s.id !== siteId)?.id].filter(Boolean) as string[];
  const compare = picked ?? defaultCompare;
  const setCompare = (ids: string[]) => setPicked(ids);
  const chipCity = cmpCity ?? site?.city ?? cities[0];
  const cmp = useQueries({ queries: compare.map((id) => ({ queryKey: ["indicators", id], queryFn: () => api.environment.indicators(id), retry: false })) });
  const names = ind.data?.map((i) => i.name) ?? [];

  return (
    <>
      <PageHeader title="Environmental Outlook" description="Screening context and monitoring priorities from the AquaConnect snapshot, kept separate from citizen observations."
        meta={<><Badge tone="success">AquaConnect data</Badge><DataFreshnessLabel at={ind.data?.[0]?.observedAt} stale={ind.data?.[0]?.dataStatus === "stale"} /><Link href="/about#methodology" className="text-xs font-semibold text-primary">Data sources & methodology</Link></>}
        actions={<><label htmlFor="site" className="sr-only">Monitoring site</label><select id="site" className={inputCls + " w-72"} value={siteId} onChange={(e) => setParams({ site: e.target.value })}>{cities.map((c) => <optgroup key={c} label={c}>{sites.data?.filter((s) => (s.city ?? "Other") === c).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}</optgroup>)}</select></>} />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader title={site?.name ?? "—"} sub={[site?.id, site?.city, site?.waterbodyName].filter(Boolean).join(" · ")} action={site && <Badge tone="warning">{priorityText(site)}</Badge>} />
          <dl className="grid gap-4 p-5 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-ink-2">Coordinates</dt><dd>{site?.latitude?.toFixed(3)}, {site?.longitude?.toFixed(3)}</dd></div>
            <div><dt className="text-xs text-ink-2">Data availability</dt><dd>{site?.dataAvailability}</dd></div>
            <div><dt className="text-xs text-ink-2">Last update</dt><dd>{fmt(site?.lastUpdatedAt)}</dd></div>
            <div><dt className="text-xs text-ink-2">Upstream</dt><dd>{site?.upstreamSiteIds?.join(", ") || "None mapped"}</dd></div>
            <div><dt className="text-xs text-ink-2">Downstream</dt><dd>{site?.downstreamSiteIds?.join(", ") || "None mapped"}</dd></div>
            <div><dt className="text-xs text-ink-2">Recent observations</dt><dd><Link className="font-semibold text-primary" href={`/app/sites/${siteId}`}>{obs.length} at this site</Link></dd></div>
          </dl>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-2">Monitoring priority is a modelled screening context. A low priority never hides or downgrades citizen reports.</p>
        </Card>
        <Card className="overflow-hidden"><FreshwaterMap sites={sites.data} selectedId={siteId} focus={site?.latitude != null ? [site.latitude, site.longitude!] : undefined} zoom={11} onSelect={(k, id) => k === "site" && setParams({ site: id })} layers={{ sites: true, observations: false, verified: false, priority: true, river: true, drainage: false, gisRivers: true, gisWatersheds: false }} className="h-64 xl:h-full" /></Card>
      </div>

      <div className="mt-6"><ModelLimitationsNotice /></div>
      <div className="mt-6 mb-4 flex gap-2" role="tablist">{([["latest", "Latest context"], ["outlook", "Daily & 7-day outlook"], ["history", "Historical"]] as const).map(([k, l]) => <Chip key={k} active={tab === k} onClick={() => setTab(k)}>{l}</Chip>)}</div>

      {tab === "latest" && (ind.isLoading ? <ListSkeleton /> : ind.isError ? <Card><ErrorState message="Environmental data could not be refreshed." onRetry={() => ind.refetch()} /></Card> : (
        <>{ind.data?.some((i) => i.dataStatus === "stale") && <div className="mb-4"><Notice tone="warning" title="Data is stale">This site's data has not refreshed recently. Values reflect the last available update and are not live.</Notice></div>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{ind.data?.map((i) => <EnvironmentalIndicatorCard key={i.id} i={i} />)}</div></>
      ))}
      {tab === "outlook" && <Card><CardHeader title="River discharge — observed vs forecast" sub="Observed (solid) and forecast (dashed) are shown separately" /><div className="p-5"><OutlookChart siteId={siteId} /></div></Card>}
      {tab === "history" && <Card><EmptyState icon={<History size={20} />} title="Historical reconstruction is not yet integrated" body="AquaConnect has a 2000–2024 retrospective reconstruction, but the copy supplied here marks its full history as still downloading, so it is not shown. Only the current 7-day snapshot is available." /></Card>}

      <Card className="mt-6">
        <CardHeader title="Site comparison" sub="Compare up to three sites using the same indicator definitions" />
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4"><label htmlFor="cmpcity" className="text-xs font-semibold text-ink-2">City</label><select id="cmpcity" className={inputCls + " w-48"} value={chipCity} onChange={(e) => setCmpCity(e.target.value)}>{cities.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="flex flex-wrap gap-1.5 px-5 pt-3">{sites.data?.filter((s) => (s.city ?? "Other") === chipCity || compare.includes(s.id)).map((s) => <Chip key={s.id} active={compare.includes(s.id)} onClick={() => setCompare(compare.includes(s.id) ? compare.filter((x) => x !== s.id) : compare.length < 3 ? [...compare, s.id] : compare)}>{s.name}</Chip>)}</div>
        <div className="overflow-x-auto p-5"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b border-line text-left text-xs text-ink-2 uppercase"><th className="py-2 pr-3">Indicator</th>{compare.map((id) => <th key={id} className="py-2 pr-3">{sites.data?.find((s) => s.id === id)?.name}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{names.map((n) => <tr key={n}><td className="py-2.5 pr-3 font-medium">{n}</td>{cmp.map((c, i) => { const v = c.data?.find((x) => x.name === n); return <td key={i} className="py-2.5 pr-3">{c.isError ? <span className="text-danger text-xs">Error</span> : !v || v.dataStatus === "missing" ? <span className="text-xs text-neutral">Data unavailable</span> : <span>{v.level ?? `${v.value} ${v.unit}`}{v.dataStatus === "stale" && <Badge tone="warning">Stale</Badge>}</span>}</td>; })}</tr>)}</tbody></table></div>
      </Card>
    </>
  );
}
