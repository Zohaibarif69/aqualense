"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { MonitoringSite, Observation } from "@/types";
import { useGis } from "@/hooks/useGis";
import { DEFAULT_LAYERS, type LayerKey } from "./mapLayers";
import { cx } from "./ui";


const isVerified = (o: Observation) => o.status === "verified" || o.status === "corrected";
const pin = (bg: string, glyph: string, selected: boolean) => L.divIcon({
  className: "",
  iconSize: [30, 38], iconAnchor: [15, 36],
  html: `<div style="width:30px;height:38px;position:relative;filter:drop-shadow(0 1px 2px rgba(22,50,79,.35))">
    <svg width="30" height="38" viewBox="0 0 30 38"><path d="M15 37C15 37 28 23.5 28 14A13 13 0 1 0 2 14C2 23.5 15 37 15 37Z" fill="${bg}" stroke="${selected ? "#16324F" : "#fff"}" stroke-width="${selected ? 3 : 2}"/></svg>
    <span style="position:absolute;top:6px;left:0;width:30px;text-align:center;color:#fff;font:600 13px/16px Inter,sans-serif">${glyph}</span></div>`,
});
const CAMERA = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" style="display:inline"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`;
const CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" style="display:inline"><path d="M20 6 9 17l-5-5"/></svg>`;
const siteIcon = (selected: boolean) => L.divIcon({
  className: "", iconSize: [22, 22], iconAnchor: [11, 11],
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#2563A6;border:${selected ? "4px solid #16324F" : "3px solid #fff"};box-shadow:0 1px 3px rgba(22,50,79,.4);display:grid;place-items:center"><span style="width:6px;height:6px;border-radius:50%;background:#fff"></span></div>`,
});
type Pt = [number, number];
function hull(points: Pt[]): Pt[] {            // monotone-chain convex hull on [lat, lng]
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = []; for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up: Pt[] = []; for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
/** Groups sites that are linked through the AquaConnect upstream/downstream network. */
export function drainageGroups(sites: MonitoringSite[]) {
  const byId = new Map(sites.map((s) => [s.id, s])); const seen = new Set<string>(); const groups: { id: string; label: string; members: MonitoringSite[]; shape: Pt[] }[] = [];
  for (const s of sites) {
    if (seen.has(s.id) || s.latitude == null) continue;
    const stack = [s.id]; const members: MonitoringSite[] = []; seen.add(s.id);
    while (stack.length) { const cur = byId.get(stack.pop()!); if (!cur) continue; members.push(cur); for (const n of [...(cur.upstreamSiteIds ?? []), ...(cur.downstreamSiteIds ?? [])]) if (byId.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); } }
    const pts = members.filter((m) => m.latitude != null).map((m) => [m.latitude!, m.longitude!] as Pt);
    if (pts.length < 2) continue;
    // pad the outline a little so two-site groups still show as an area
    const pad = 0.004; const padded = pts.flatMap(([a, b]) => [[a + pad, b], [a - pad, b], [a, b + pad], [a, b - pad]] as Pt[]);
    groups.push({ id: members.map((m) => m.id).sort()[0], label: `${members[0].city ?? "Group"} · ${members.length} linked sites`, members, shape: hull(padded) });
  }
  return groups;
}
const PRIORITY_STYLE = { high: { r: 26, dash: undefined, w: 3 }, medium: { r: 22, dash: "6 4", w: 2.5 }, low: { r: 18, dash: "2 4", w: 2 } } as const;

const clusterIcon = (n: number, allVerified: boolean) => L.divIcon({
  className: "", iconSize: [40, 40], iconAnchor: [20, 20],
  html: `<div style="width:40px;height:40px;border-radius:50%;background:${allVerified ? "#237A57" : "#087F8C"};border:3px solid #fff;box-shadow:0 0 0 4px ${allVerified ? "rgba(35,122,87,.25)" : "rgba(8,127,140,.25)"},0 1px 3px rgba(22,50,79,.4);display:grid;place-items:center;color:#fff;font:700 14px Inter,sans-serif">${n}</div>`,
});
const CLUSTER_PX = 60;   // markers closer than this on screen are grouped
const NO_CLUSTER_ZOOM = 16;

/** Observation pins, grouped into numbered circles when they overlap. Zoom in or click a circle to expand it. */
function ObservationMarkers({ items, selectedId, onSelect, cluster }: { items: Observation[]; selectedId?: string; onSelect?: (kind: "site" | "observation", id: string) => void; cluster: boolean }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const groups = useMemo(() => {
    if (!cluster || zoom >= NO_CLUSTER_ZOOM) return items.map((o) => [o]);
    const cells = new Map<string, Observation[]>();
    for (const o of items) {
      // The selected observation stays on its own so it is always visible.
      const key = o.id === selectedId ? `sel:${o.id}` : (() => { const p = map.project([o.location.latitude!, o.location.longitude!], zoom); return `${Math.floor(p.x / CLUSTER_PX)}:${Math.floor(p.y / CLUSTER_PX)}`; })();
      const g = cells.get(key); if (g) g.push(o); else cells.set(key, [o]);
    }
    return [...cells.values()];
  }, [items, zoom, selectedId, cluster, map]);

  return <>{groups.map((g) => {
    if (g.length === 1) {
      const o = g[0]; const v = isVerified(o);
      return <Marker key={o.id} position={[o.location.latitude!, o.location.longitude!]} icon={pin(v ? "#237A57" : "#087F8C", v ? CHECK : CAMERA, selectedId === o.id)} eventHandlers={{ click: () => onSelect?.("observation", o.id) }} keyboard title={`${v ? "Expert-verified" : "Citizen"} observation ${o.id}`} alt={`Observation ${o.id}`} zIndexOffset={selectedId === o.id ? 1000 : 0} />;
    }
    const lat = g.reduce((s, o) => s + o.location.latitude!, 0) / g.length;
    const lng = g.reduce((s, o) => s + o.location.longitude!, 0) / g.length;
    return <Marker key={`c-${g.map((o) => o.id).join("|")}`} position={[lat, lng]} icon={clusterIcon(g.length, g.every(isVerified))} keyboard title={`${g.length} observations here. Activate to zoom in.`} alt={`${g.length} observations grouped`}
      eventHandlers={{ click: () => map.fitBounds(L.latLngBounds(g.map((o) => [o.location.latitude!, o.location.longitude!] as [number, number])), { padding: [60, 60], maxZoom: NO_CLUSTER_ZOOM }) }}>
      <Tooltip direction="top" offset={[0, -16]}>{g.length} observations — click to zoom in</Tooltip>
    </Marker>;
  })}</>;
}

function FitAndClick({ onPick, focus, points }: { onPick?: (lat: number, lng: number) => void; focus?: [number, number]; points: [number, number][] }) {
  const map = useMap();
  useMapEvents({ click: (e) => onPick?.(e.latlng.lat, e.latlng.lng) });
  // Show every site that is passed in (e.g. all five cities, or just the filtered ones) unless a place is being focused.
  const key = points.length ? `${points.length}:${points[0]}:${points[points.length - 1]}` : "";
  useEffect(() => { if (!focus && points.length) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 12, animate: false }); }, [key]);
  useEffect(() => { if (focus) map.flyTo(focus, Math.max(map.getZoom(), 13), { duration: 0.6 }); }, [focus?.[0], focus?.[1]]);
  return null;
}

export default function LeafletMap({ sites = [], observations = [], layers = DEFAULT_LAYERS, selectedId, onSelect, onPick, picked, className, focus, zoom = 11, cluster = true }: {
  sites?: MonitoringSite[]; observations?: Observation[]; layers?: Record<LayerKey, boolean>; selectedId?: string; onSelect?: (kind: "site" | "observation", id: string) => void;
  onPick?: (lat: number, lng: number) => void; picked?: [number, number]; className?: string; focus?: [number, number]; zoom?: number; cluster?: boolean;
}) {
  const visibleObs = useMemo(() => observations.filter((o) => o.status !== "withdrawn" && o.location.latitude != null && (isVerified(o) ? layers.verified : layers.observations)), [observations, layers.verified, layers.observations]);
  const points = useMemo(() => sites.filter((s) => s.latitude != null && s.longitude != null).map((s) => [s.latitude!, s.longitude!] as [number, number]), [sites]);
  const center: [number, number] = focus ?? points[0] ?? [47, 8];
  const gis = useGis();
  const groups = useMemo(() => (layers.drainage ? drainageGroups(sites) : []), [sites, layers.drainage]);
  const river = useMemo(() => {
    const byId = new Map(sites.map((s) => [s.id, s]));
    return sites.flatMap((s) => (s.downstreamSiteIds ?? []).map((d) => { const t = byId.get(d); return t && s.latitude && t.latitude ? [[s.latitude, s.longitude!], [t.latitude, t.longitude!]] as [number, number][] : null; }).filter(Boolean)) as [number, number][][];
  }, [sites]);

  return (
    <div className={cx("relative isolate overflow-hidden", className)}>
      <MapContainer center={center} zoom={focus ? zoom : 4} scrollWheelZoom className="h-full w-full" keyboard>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitAndClick onPick={onPick} focus={focus} points={points} />
        {layers.drainage && groups.map((g) => (
          <Polygon key={g.id} positions={g.shape} pathOptions={{ color: "#6B4FA0", weight: 2, dashArray: "6 4", fillOpacity: 0.08 }}>
            <Tooltip sticky>{g.label}. Modelled from linked sites, not an official watershed boundary.</Tooltip>
          </Polygon>))}
        {layers.gisWatersheds && gis.watersheds && <GeoJSON key={`ws-${gis.watersheds.features.length}`} data={gis.watersheds} style={() => ({ color: "#1B7F5C", weight: 2, fillOpacity: 0.07 })} onEachFeature={(f, lyr) => lyr.bindTooltip(`Watershed${f.properties?.name || f.properties?.HYBAS_ID ? `: ${f.properties.name ?? f.properties.HYBAS_ID}` : ""}`, { sticky: true })} />}
        {layers.gisRivers && gis.rivers && <GeoJSON key={`rv-${gis.rivers.features.length}`} data={gis.rivers} style={(f) => ({ color: "#1D4E89", weight: Math.min(6, 2 + Number(f?.properties?.ORD_STRA ?? 8 - Number(f?.properties?.scalerank ?? 6)) * 0.4), opacity: 0.8 })} onEachFeature={(f, lyr) => lyr.bindTooltip(String(f.properties?.name || f.properties?.name_en || "River"), { sticky: true })} />}
        {layers.river && river.map((line, i) => <Polyline key={i} positions={line} pathOptions={{ color: "#2563A6", weight: 2, opacity: 0.6, dashArray: "5 5" }}><Tooltip sticky>Modelled link between sites (AquaConnect network). A straight line, not the river course.</Tooltip></Polyline>)}
        {layers.priority && sites.map((s) => s.monitoringPriority && s.monitoringPriority !== "not_assessed" && s.latitude ? (
          <CircleMarker key={`p-${s.id}`} center={[s.latitude, s.longitude!]} radius={PRIORITY_STYLE[s.monitoringPriority].r} pathOptions={{ color: "#A9650A", weight: PRIORITY_STYLE[s.monitoringPriority].w, dashArray: PRIORITY_STYLE[s.monitoringPriority].dash, fillOpacity: 0.06 }} interactive={false} />
        ) : null)}
        {layers.sites && sites.map((s) => s.latitude ? (
          <Marker key={s.id} position={[s.latitude, s.longitude!]} icon={siteIcon(selectedId === s.id)} eventHandlers={{ click: () => onSelect?.("site", s.id) }} keyboard title={`Monitoring site: ${s.name}`} alt={`Monitoring site: ${s.name}`}>
            <Tooltip direction="top" offset={[0, -10]}>{s.name}</Tooltip>
          </Marker>) : null)}
        <ObservationMarkers items={visibleObs} selectedId={selectedId} onSelect={onSelect} cluster={cluster} />
        {picked && <Marker position={picked} icon={pin("#16324F", "●", true)} />}
      </MapContainer>
    </div>
  );
}
