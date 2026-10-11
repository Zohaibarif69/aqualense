"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Crosshair, Filter, Layers, MapPin, X } from "lucide-react";
import { subDays } from "date-fns";
import { useAnalysis, useObservations, usePhotos, useSites } from "@/hooks/queries";
import FreshwaterMap, { DEFAULT_LAYERS, GIS_LAYERS, LAYER_LABEL, MapLegend, type LayerKey } from "@/components/FreshwaterMap";
import { useGis } from "@/hooks/useGis";
import { Thumb } from "@/components/observations";
import { AIBadge, Badge, Chip, DemoBadge, EmptyState, Spinner, StatusBadge, btnLink, cx, inputCls, useToast, CategoryBadge } from "@/components/ui";
import type { ObservationCategory, ObservationStatus } from "@/types";
import { CATEGORY, PRIORITY, fmt, priorityText } from "@/utils/labels";

const STATUS_GROUPS: { key: string; label: string; s: ObservationStatus[] }[] = [
  { key: "pending", label: "Awaiting / under review", s: ["awaiting_review", "under_review", "submitted", "more_information_requested"] },
  { key: "verified", label: "Expert-verified / corrected", s: ["verified", "corrected"] },
  { key: "nv", label: "Not verified", s: ["not_verified"] },
];

function Selected({ sel, onClose }: { sel: { kind: "site" | "observation"; id: string }; onClose: () => void }) {
  const { data: sites = [] } = useSites();
  const { data: obs = [] } = useObservations();
  const o = sel.kind === "observation" ? obs.find((x) => x.id === sel.id) : undefined;
  const s = sel.kind === "site" ? sites.find((x) => x.id === sel.id) : sites.find((x) => x.id === o?.location.siteId);
  const { data: ai } = useAnalysis(o?.id);
  const { data: ph } = usePhotos(o?.photoIds);
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div><p className="text-xs font-medium text-ink-2">{o ? `Citizen observation · ${o.id}` : `Monitoring site · ${s?.id}`}</p><p className="font-semibold text-navy">{o ? o.location.placeName : s?.name}</p></div>
        <button onClick={onClose} aria-label="Close details" className="rounded p-1 text-ink-2 hover:bg-muted"><X size={16} /></button>
      </div>
      {o ? (
        <div className="space-y-2.5 text-sm">
          <Thumb photo={ph?.[0]} alt={`Observation ${o.id}`} className="h-32 w-full rounded-lg" />
          <div className="flex flex-wrap gap-1.5">{o.categories.map((c) => <CategoryBadge key={c} category={c} />)}</div>
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[13px]">
            <dt className="text-ink-2">Observed</dt><dd>{fmt(o.observedAt ?? o.createdAt)}</dd>
            <dt className="text-ink-2">Location</dt><dd>{o.location.precision === "approximate" ? "Approximate" : "Precise"} · {o.location.latitude?.toFixed(3)}, {o.location.longitude?.toFixed(3)}</dd>
            <dt className="text-ink-2">Verification</dt><dd><StatusBadge status={o.status} /></dd>
            <dt className="text-ink-2">AI findings</dt><dd>{ai?.status === "completed" ? (ai.findings.length ? <span className="flex flex-wrap items-center gap-1"><AIBadge />{ai.findings.length} possible</span> : "None identified") : ai ? "Unavailable" : "Not analyzed"}</dd>
            <dt className="text-ink-2">Site priority</dt><dd>{s?.monitoringPriority ? priorityText(s) : "—"} <span className="text-xs text-ink-2">(model context)</span></dd>
          </dl>
          <Link href={`/app/observations/${o.id}`} className={btnLink() + " w-full"}>View Details</Link>
        </div>
      ) : s ? (
        <div className="space-y-2.5 text-[13px]">
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
            <dt className="text-ink-2">Waterbody</dt><dd>{s.waterbodyName}</dd>
            <dt className="text-ink-2">Type</dt><dd>{s.siteType}</dd>
            <dt className="text-ink-2">Priority</dt><dd><Badge tone="warning">{priorityText(s)}</Badge></dd>
            <dt className="text-ink-2">Data</dt><dd>{s.dataAvailability}</dd>
            <dt className="text-ink-2">Updated</dt><dd>{fmt(s.lastUpdatedAt)}</dd>
          </dl>
          <p className="text-xs text-ink-2">Monitoring priority is model context, not evidence of pollution.</p>
          <Link href={`/app/sites/${s.id}`} className={btnLink() + " w-full"}>View Details</Link>
        </div>
      ) : null}
    </div>
  );
}

export default function MapPage() {
  const sites = useSites();
  const obsQ = useObservations();
  const toast = useToast();
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(DEFAULT_LAYERS);
  const gis = useGis();
  const [search, setSearch] = useState("");
  const [cats, setCats] = useState<ObservationCategory[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [days, setDays] = useState(0);
  const [siteId, setSiteId] = useState("");
  const [priority, setPriority] = useState("");
  const [sel, setSel] = useState<{ kind: "site" | "observation"; id: string } | null>(null);
  const [panel, setPanel] = useState(false);
  const [focus, setFocus] = useState<[number, number]>();
  const [locating, setLocating] = useState(false);

  const filteredSites = useMemo(() => (sites.data ?? []).filter((s) => (!priority || s.monitoringPriority === priority) && (!siteId || s.id === siteId) && (!search || `${s.name} ${s.waterbodyName}`.toLowerCase().includes(search.toLowerCase()))), [sites.data, priority, siteId, search]);
  const filteredObs = useMemo(() => {
    const allowed = status.flatMap((k) => STATUS_GROUPS.find((g) => g.key === k)!.s);
    const from = days ? subDays(new Date(), days).toISOString() : "";
    return (obsQ.data ?? []).filter((o) => (!cats.length || o.categories.some((c) => cats.includes(c))) && (!allowed.length || allowed.includes(o.status)) && (!from || o.createdAt >= from) && (!siteId || o.location.siteId === siteId)
      && (!priority || sites.data?.find((s) => s.id === o.location.siteId)?.monitoringPriority === priority)
      && (!search || `${o.id} ${o.location.placeName} ${o.description}`.toLowerCase().includes(search.toLowerCase())));
  }, [obsQ.data, cats, status, days, siteId, priority, search, sites.data]);
  const clear = () => { setSearch(""); setCats([]); setStatus([]); setDays(0); setSiteId(""); setPriority(""); };
  const count = (layers.sites ? filteredSites.length : 0) + filteredObs.filter((o) => (o.status === "verified" || o.status === "corrected" ? layers.verified : layers.observations)).length;

  const locate = () => {
    if (!navigator.geolocation) return toast("Location is not available in this browser.", "info");
    setLocating(true);
    navigator.geolocation.getCurrentPosition((p) => { setLocating(false); setFocus([p.coords.latitude, p.coords.longitude]); }, () => { setLocating(false); toast("Location permission was denied. You can still search or pan the map.", "info"); }, { timeout: 8000 });
  };
  const pick = (kind: "site" | "observation", id: string) => {
    setSel({ kind, id });
    const o = obsQ.data?.find((x) => x.id === id); const s = sites.data?.find((x) => x.id === id);
    const ll = o ? [o.location.latitude, o.location.longitude] : [s?.latitude, s?.longitude];
    if (ll[0]) setFocus(ll as [number, number]);
  };

  const filters = (
    <div className="space-y-5">
      <div><label htmlFor="msearch" className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-2 uppercase">Search</label><input id="msearch" className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Site, place, or observation ID" /></div>
      <fieldset><legend className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-2 uppercase"><Layers size={13} />Layers</legend>
        <div className="space-y-1.5">{(Object.keys(LAYER_LABEL) as LayerKey[]).filter((k) => !GIS_LAYERS.includes(k) || (k === "gisRivers" ? gis.rivers : gis.watersheds)).map((k) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={layers[k]} onChange={() => setLayers({ ...layers, [k]: !layers[k] })} />{LAYER_LABEL[k]}</label>)}
          <p className="flex items-center gap-2 text-sm text-neutral"><input type="checkbox" disabled className="size-4" />Environmental context <span className="text-xs">(not yet connected)</span></p></div>
      </fieldset>
      <fieldset><legend className="mb-2 text-xs font-semibold tracking-wide text-ink-2 uppercase">Category</legend><div className="flex flex-wrap gap-1.5">{(Object.keys(CATEGORY) as ObservationCategory[]).map((c) => <Chip key={c} active={cats.includes(c)} onClick={() => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])}>{CATEGORY[c].label}</Chip>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-xs font-semibold tracking-wide text-ink-2 uppercase">Verification status</legend><div className="flex flex-wrap gap-1.5">{STATUS_GROUPS.map((g) => <Chip key={g.key} active={status.includes(g.key)} onClick={() => setStatus(status.includes(g.key) ? status.filter((x) => x !== g.key) : [...status, g.key])}>{g.label}</Chip>)}</div></fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="mdate" className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-2 uppercase">Date range</label><select id="mdate" className={inputCls} value={days} onChange={(e) => setDays(+e.target.value)}><option value={0}>All time</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select></div>
        <div><label htmlFor="mprio" className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-2 uppercase">Priority</label><select id="mprio" className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">Any</option>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="col-span-2"><label htmlFor="msite" className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-2 uppercase">Site</label><select id="msite" className={inputCls} value={siteId} onChange={(e) => setSiteId(e.target.value)}><option value="">All sites</option>{sites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="col-span-2"><label htmlFor="msrc" className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-2 uppercase">Data source</label><select id="msrc" className={inputCls}><option>All sources</option></select></div>
      </div>
      <button onClick={clear} className="text-sm font-semibold text-primary">Clear all filters</button>
    </div>
  );

  return (
    <div className="-mx-4 -mt-6 lg:-mx-8">
      <div className="flex h-[calc(100vh-64px-56px)] lg:h-[calc(100vh-68px)]">
        <aside className="hidden w-[340px] shrink-0 flex-col border-r border-line bg-surface xl:flex">
          <div className="flex-1 overflow-y-auto p-5">{filters}</div>
          <div className="border-t border-line">
            <p className="px-5 pt-3 text-xs font-semibold text-ink-2" aria-live="polite">{count} results shown</p>
            <ul className="max-h-64 overflow-y-auto pb-2">{filteredObs.map((o) => <li key={o.id}><button onClick={() => pick("observation", o.id)} className={cx("w-full px-5 py-2 text-left hover:bg-muted", sel?.id === o.id && "bg-primary-light")}><p className="text-sm font-medium">{o.id} · {CATEGORY[o.categories[0]].label}</p><p className="text-xs text-ink-2">{o.location.placeName}</p></button></li>)}
              {filteredSites.map((s) => <li key={s.id}><button onClick={() => pick("site", s.id)} className={cx("flex w-full items-center gap-2 px-5 py-2 text-left hover:bg-muted", sel?.id === s.id && "bg-primary-light")}><MapPin size={13} className="text-info" /><span className="text-sm">{s.name}</span></button></li>)}</ul>
          </div>
        </aside>
        <div className="relative flex-1">
          {(sites.isLoading || obsQ.isLoading) && <div className="absolute inset-0 z-[500] grid place-items-center bg-bg/70"><Spinner label="Loading map data…" /></div>}
          <FreshwaterMap sites={filteredSites} observations={filteredObs} layers={layers} selectedId={sel?.id} onSelect={pick} focus={focus} className="h-full" />
          <div className="absolute top-3 left-14 z-[600] flex gap-2">
            <button onClick={() => setPanel(true)} className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold shadow xl:hidden"><Filter size={15} /> Filters & layers</button>
            <button onClick={locate} className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold shadow" aria-label="Center on my location">{locating ? <Spinner /> : <Crosshair size={15} />}<span className="hidden sm:inline">My location</span></button>
          </div>
          {count === 0 && !obsQ.isLoading && <div className="absolute top-16 left-1/2 z-[600] w-72 -translate-x-1/2 rounded-xl border border-line bg-surface shadow-lg"><EmptyState title="No results match these filters" action={<button onClick={clear} className="text-sm font-semibold text-primary">Clear filters</button>} /></div>}
          <div className="absolute right-3 bottom-3 z-[600] hidden w-[300px] rounded-xl border border-line bg-surface/95 p-3 shadow md:block">
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-navy">Legend</p><DemoBadge /></div><MapLegend />
            <p className="mt-2 text-[11px] text-ink-2">Sites: AquaConnect (real) · observations: demo</p>
          </div>
          {sel && <div className="absolute inset-x-3 bottom-3 z-[700] md:inset-x-auto md:top-3 md:right-3 md:bottom-auto md:w-[320px]"><Selected sel={sel} onClose={() => setSel(null)} /></div>}
        </div>
      </div>
      {panel && (
        <div className="fixed inset-0 z-[1900] xl:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-navy/40" onClick={() => setPanel(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-surface p-5">
            <div className="mb-4 flex items-center justify-between"><p className="font-semibold text-navy">Filters & layers</p><button onClick={() => setPanel(false)} aria-label="Close"><X /></button></div>
            {filters}
            <button onClick={() => setPanel(false)} className={btnLink() + " mt-5 w-full"}>Show {count} results</button>
          </div>
        </div>
      )}
    </div>
  );
}
