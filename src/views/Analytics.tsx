"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addDays, endOfDay, format, startOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Download, Flame } from "lucide-react";
import { useObservations, useSites, useUser } from "@/hooks/queries";
import { config } from "@/services/config";
import { syncSession } from "@/services/identity";
import { Button, Card, CardHeader, DemoBadge, EmptyState, ListSkeleton, Notice, PageHeader, inputCls, useToast } from "@/components/ui";
import { CATEGORY, STATUS } from "@/utils/labels";
import type { ObservationCategory } from "@/types";

const VERIFIED = ["verified", "corrected"];
type Grain = "day" | "week" | "month";
const bucketStart = (d: Date, g: Grain) => (g === "day" ? startOfDay(d) : g === "week" ? startOfWeek(d) : startOfMonth(d));
const bucketLabel = (d: Date, g: Grain) => format(d, g === "month" ? "MMM yyyy" : "d MMM");
const GRAIN_NOUN = { day: "day", week: "week", month: "month" } as const;

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [fromDate, setFromDate] = useState("");   // optional custom range (yyyy-mm-dd), overrides "last N days"
  const [toDate, setToDate] = useState("");
  const [grain, setGrain] = useState<Grain>("week");
  const [siteId, setSiteId] = useState("");
  const [city, setCity] = useState("");
  const [cat, setCat] = useState("");
  const range = useMemo(() => {
    const to = toDate ? endOfDay(new Date(toDate)) : new Date();
    const from = fromDate ? startOfDay(new Date(fromDate)) : subDays(to, days);
    return { from, to, valid: from <= to };
  }, [days, fromDate, toDate]);
  const q = useObservations({ from: range.from.toISOString(), to: range.to.toISOString(), siteId: siteId || undefined, categories: cat ? [cat as ObservationCategory] : undefined });
  const { data: sites = [] } = useSites();
  const { data: user } = useUser();
  const toast = useToast();
  const cities = useMemo(() => [...new Set(sites.map((s) => s.city).filter(Boolean) as string[])].sort(), [sites]);
  const cityOf = (id?: string) => sites.find((s) => s.id === id)?.city ?? "No site / unknown";
  const obs = useMemo(() => (range.valid ? q.data ?? [] : []).filter((o) => o.status !== "withdrawn" && (!city || cityOf(o.location.siteId) === city)), [q.data, city, sites, range.valid]);
  const series = useMemo(() => {
    const m = new Map<number, { period: string; verified: number; unverified: number }>();
    for (let d = bucketStart(range.from, grain), guard = 0; d <= range.to && guard < 400; d = grain === "day" ? addDays(d, 1) : grain === "week" ? addDays(d, 7) : startOfMonth(addDays(d, 32)), guard++) m.set(+d, { period: bucketLabel(d, grain), verified: 0, unverified: 0 });
    obs.forEach((o) => { const r = m.get(+bucketStart(new Date(o.createdAt), grain)); if (r) VERIFIED.includes(o.status) ? r.verified++ : r.unverified++; });
    return [...m.values()];
  }, [obs, range, grain]);
  const bySite = sites.filter((s) => !city || s.city === city).map((s) => ({ site: s.name.replace(/ at | Creek | Tributary/g, " ").slice(0, 18), count: obs.filter((o) => o.location.siteId === s.id).length }));
  const byArea = useMemo(() => { const m = new Map<string, number>(); obs.forEach((o) => { const c = cityOf(o.location.siteId); m.set(c, (m.get(c) ?? 0) + 1); }); return [...m].map(([area, count]) => ({ area, count })).sort((a, b) => b.count - a.count); }, [obs, sites]);
  const cats = (Object.keys(CATEGORY) as ObservationCategory[]).map((c) => ({ name: CATEGORY[c].label, count: obs.filter((o) => o.categories.includes(c)).length })).filter((c) => c.count);
  // Hotspot trends: the selected period against the equally long period before it, per site.
  const prev = useMemo(() => { const span = +range.to - +range.from; return { from: new Date(+range.from - span), span }; }, [range]);
  const hotQ = useObservations({ from: prev.from.toISOString(), to: range.to.toISOString() });
  const hotspots = useMemo(() => {
    const m = new Map<string, { id: string; cur: number; before: number; cats: Map<string, number> }>();
    (hotQ.data ?? []).filter((o) => o.status !== "withdrawn" && o.location.siteId && (!city || cityOf(o.location.siteId) === city)).forEach((o) => {
      const id = o.location.siteId!; const r = m.get(id) ?? { id, cur: 0, before: 0, cats: new Map() }; m.set(id, r);
      if (new Date(o.createdAt) >= range.from) { r.cur++; o.categories.forEach((c) => r.cats.set(c, (r.cats.get(c) ?? 0) + 1)); } else r.before++;
    });
    return [...m.values()].map((r) => {
      const site = sites.find((s) => s.id === r.id); const diff = r.cur - r.before;
      const top = [...r.cats].sort((a, b) => b[1] - a[1])[0]?.[0] as ObservationCategory | undefined;
      const trend = r.before === 0 && r.cur > 0 ? "new" : diff > 0 ? "up" : diff < 0 ? "down" : "flat";
      return { ...r, name: site?.name ?? r.id, city: site?.city ?? "", diff, trend, top, hot: r.cur >= 3 && diff > 0 };
    }).filter((r) => r.cur + r.before > 0).sort((a, b) => b.cur - a.cur || b.diff - a.diff).slice(0, 10);
  }, [hotQ.data, range, city, sites]);
  const rangeText = `${format(range.from, "d MMM yyyy")} – ${format(range.to, "d MMM yyyy")}`;

  const exportCsv = async () => {
    // Real backends: the SERVER checks the role (signed cookie) and builds the file. Demo data lives in the browser, so it is exported here.
    if (config.dataSource !== "mock") {
      if (!(await syncSession(user!.role)) && !(await fetch("/api/session").then((r) => r.json()).then((j: { role?: string }) => !!j.role).catch(() => false))) return toast("Your server session has expired. Choose your role again from the profile menu.", "danger");
      const qs = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString(), ...(siteId && { siteId }), ...(cat && { category: cat }) });
      const res = await fetch(`/api/export?${qs}`);
      if (!res.ok) { const b = (await res.json().catch(() => ({}))) as { message?: string }; return toast(b.message ?? "Export failed.", "danger"); }
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement("a"), { href: url, download: "aqualens-observations.csv" }).click();
      URL.revokeObjectURL(url); return toast("CSV exported");
    }
    const rows = [["id", "created_at", "site_id", "area", "categories", "status"], ...obs.map((o) => [o.id, o.createdAt, o.location.siteId ?? "", cityOf(o.location.siteId), o.categories.join("|"), o.status])];
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "aqualens-demo-observations.csv" }).click();
    URL.revokeObjectURL(url); toast("CSV exported (demo data, no personal fields)");
  };

  return (
    <>
      <PageHeader title="Historical Trends and Insights" description="Understand observations and verification activity over time." meta={<DemoBadge />} actions={user?.role !== "citizen" ? <Button variant="secondary" onClick={exportCsv}><Download size={16} />Export CSV</Button> : undefined} />
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <select aria-label="Date range" className={inputCls} value={days} onChange={(e) => { setDays(+e.target.value); setFromDate(""); setToDate(""); }}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option></select>
        <select aria-label="Group by" className={inputCls} value={grain} onChange={(e) => setGrain(e.target.value as Grain)}><option value="day">Group by day</option><option value="week">Group by week</option><option value="month">Group by month</option></select>
        <select aria-label="Area" className={inputCls} value={city} onChange={(e) => { setCity(e.target.value); setSiteId(""); }}><option value="">All areas</option>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select aria-label="Category" className={inputCls} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-ink-2">Custom from<input type="date" className={inputCls} value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} /></label>
        <label className="text-xs text-ink-2">Custom to<input type="date" className={inputCls} value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} /></label>
        <label className="text-xs text-ink-2">Site<select aria-label="Site" className={inputCls} value={siteId} onChange={(e) => setSiteId(e.target.value)}><option value="">All sites{city ? ` in ${city}` : ""}</option>{sites.filter((s) => !city || s.city === city).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      </div>
      {!range.valid && <div className="mb-4"><Notice tone="warning">The start date is after the end date. Adjust the custom range.</Notice></div>}
      {q.isLoading ? <ListSkeleton rows={6} /> : obs.length === 0 ? <Card><EmptyState title="No observations for these filters." /></Card> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader title={`Verified vs unverified per ${GRAIN_NOUN[grain]}`} sub={`Observations by submission ${GRAIN_NOUN[grain]}`} />
            <div className="h-64 p-4"><ResponsiveContainer><BarChart data={series}><CartesianGrid vertical={false} stroke="#DCE5E9" /><XAxis dataKey="period" tick={{ fontSize: 11 }} minTickGap={12} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="verified" name="Expert-verified / corrected" stackId="a" fill="#237A57" /><Bar dataKey="unverified" name="Not (yet) verified" stackId="a" fill="#87C9CE" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
          <Card><CardHeader title="Monitoring activity by site" sub="Observations per site" />
            <div className="h-64 p-4"><ResponsiveContainer><BarChart data={bySite}><CartesianGrid vertical={false} stroke="#DCE5E9" /><XAxis dataKey="site" tick={{ fontSize: 10 }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} /><Tooltip /><Bar dataKey="count" name="Observations" fill="#087F8C" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
          <Card><CardHeader title="Observation counts over time" sub="Cumulative observations" />
            <div className="h-64 p-4"><ResponsiveContainer><LineChart data={series.map((w, i, a) => ({ period: w.period, total: a.slice(0, i + 1).reduce((s, x) => s + x.verified + x.unverified, 0) }))}><CartesianGrid vertical={false} stroke="#DCE5E9" /><XAxis dataKey="period" tick={{ fontSize: 11 }} minTickGap={12} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} /><Tooltip /><Line dataKey="total" name="Cumulative observations" stroke="#16324F" strokeWidth={2} /></LineChart></ResponsiveContainer></div></Card>
          <Card><CardHeader title="Observations by category" sub="An observation with several categories counts in each" />
            <div className="h-64 p-4"><ResponsiveContainer><BarChart data={cats} layout="vertical" margin={{ left: 24 }}><CartesianGrid horizontal={false} stroke="#DCE5E9" /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} /><Tooltip /><Bar dataKey="count" name="Observations" fill="#2563A6" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div></Card>
          <Card><CardHeader title="Observations by area" sub="Grouped by the city of the nearest monitoring site" />
            <div className="h-64 p-4"><ResponsiveContainer><BarChart data={byArea}><CartesianGrid vertical={false} stroke="#DCE5E9" /><XAxis dataKey="area" tick={{ fontSize: 11 }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} /><Tooltip /><Bar dataKey="count" name="Observations" fill="#237A57" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
          <Card><CardHeader title="Data table" sub="Text alternative for the charts" />
            <table className="w-full text-sm"><thead className="border-b border-line text-left text-xs text-ink-2 uppercase"><tr><th className="px-5 py-2">Category</th><th className="px-5 py-2 text-right">Observations</th></tr></thead><tbody className="divide-y divide-line">{cats.map((c) => <tr key={c.name}><td className="px-5 py-2">{c.name}</td><td className="px-5 py-2 text-right tabular-nums">{c.count}</td></tr>)}</tbody><thead className="border-y border-line text-left text-xs text-ink-2 uppercase"><tr><th className="px-5 py-2">Area</th><th className="px-5 py-2 text-right">Observations</th></tr></thead><tbody className="divide-y divide-line">{byArea.map((c) => <tr key={c.area}><td className="px-5 py-2">{c.area}</td><td className="px-5 py-2 text-right tabular-nums">{c.count}</td></tr>)}</tbody></table>
            <p className="px-5 py-3 text-xs text-ink-2">Statuses: {Object.entries(obs.reduce<Record<string, number>>((a, o) => ((a[STATUS[o.status].label] = (a[STATUS[o.status].label] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
          </Card>
          <Card className="lg:col-span-2"><CardHeader title="Pollution hotspot trends" sub={`Reports per site: this period vs the previous ${Math.max(1, Math.round(prev.span / 864e5))} days. A hotspot has 3+ reports and is rising.`} />
            {hotQ.isLoading ? <ListSkeleton rows={3} /> : !hotspots.length ? <EmptyState title="No site activity in these periods." /> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="border-b border-line text-left text-xs text-ink-2 uppercase"><tr><th className="px-5 py-2">Site</th><th className="px-3">Previous</th><th className="px-3">This period</th><th className="px-3">Change</th><th className="px-3">Most reported</th><th className="px-5">Flag</th></tr></thead>
                <tbody className="divide-y divide-line">{hotspots.map((h) => <tr key={h.id}><td className="px-5 py-2"><p className="font-medium">{h.name}</p><p className="text-xs text-ink-2">{h.city}</p></td><td className="px-3 tabular-nums">{h.before}</td><td className="px-3 tabular-nums">{h.cur}</td>
                  <td className="px-3"><span className="inline-flex items-center gap-1">{h.trend === "up" || h.trend === "new" ? <ArrowUpRight size={15} className="text-danger" /> : h.trend === "down" ? <ArrowDownRight size={15} className="text-success" /> : <ArrowRight size={15} className="text-ink-2" />}{h.trend === "new" ? "New" : h.diff > 0 ? `+${h.diff}` : h.diff}</span></td>
                  <td className="px-3 text-ink-2">{h.top ? CATEGORY[h.top].label : "—"}</td><td className="px-5">{h.hot ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning"><Flame size={13} />Hotspot</span> : <span className="text-xs text-ink-2">—</span>}</td></tr>)}</tbody></table></div>
            )}
            <p className="px-5 py-3 text-xs text-ink-2">Counts show where citizens are reporting, not where pollution is worst. Few reports can also mean few reporters.</p>
          </Card>
          <Card className="lg:col-span-2"><EmptyState title="Environmental indicators over time are not yet available" body="Comparing observation trends with environmental context requires integrated historical environmental data and an agreed methodology." /></Card>
        </div>
      )}
      <p className="mt-4 text-xs text-ink-2">Source: demo observation dataset · Coverage: {rangeText} · Withdrawn reports are excluded · Periods with no observations show zero submissions (not missing data).</p>
    </>
  );
}
