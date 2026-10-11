#!/usr/bin/env node
// Builds the optional map layers public/gis/rivers.geojson and public/gis/watersheds.geojson from GIS files you supply.
//
//   node scripts/import-gis.mjs --rivers rivers.geojson [--rivers more.geojson] [--watersheds basins.geojson]
//        [--margin 0.15] [--attribution "Source and licence text"]
//
// It keeps only features near the monitoring sites (the five city areas plus a margin, in degrees), clips river lines to
// those areas, simplifies geometry, rounds to 5 decimals, and keeps a few useful properties. Inputs must be GeoJSON in
// WGS84 (EPSG:4326). Convert shapefiles first:  ogr2ogr -f GeoJSON -t_srs EPSG:4326 out.geojson in.shp
//
// Good sources: HydroRIVERS / HydroBASINS / HydroSHEDS (hydrosheds.org, free), national agency layers (e.g. Italian ISPRA,
// Belgian VMM, Norwegian NVE, French BD Carthage), or Natural Earth (coarse, major rivers only).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2); const get = (k) => args.flatMap((a, i) => (a === `--${k}` ? [args[i + 1]] : []));
const riversIn = get("rivers"), basinsIn = get("watersheds"); const margin = Number(get("margin")[0] ?? 0.15); const attribution = get("attribution")[0] ?? "";
if (!riversIn.length && !basinsIn.length) { console.error("Give at least one --rivers or --watersheds file."); process.exit(1); }

const sites = JSON.parse(readFileSync(new URL("../src/data/aquaconnect.json", import.meta.url), "utf8")).sites.filter((s) => s.latitude != null);
const byCity = new Map();
for (const s of sites) { const b = byCity.get(s.city) ?? [180, 90, -180, -90]; b[0] = Math.min(b[0], s.longitude); b[1] = Math.min(b[1], s.latitude); b[2] = Math.max(b[2], s.longitude); b[3] = Math.max(b[3], s.latitude); byCity.set(s.city, b); }
const boxes = [...byCity.values()].map(([x0, y0, x1, y1]) => [x0 - margin, y0 - margin, x1 + margin, y1 + margin]);
const inside = ([x, y]) => boxes.some((b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
const hitsBox = (bb) => boxes.some((b) => bb[0] <= b[2] && bb[2] >= b[0] && bb[1] <= b[3] && bb[3] >= b[1]);
const KEEP = ["name", "name_en", "NAME", "id", "scalerank", "ORD_STRA", "ORD_FLOW", "DIS_AV_CMS", "HYBAS_ID", "MAIN_BAS", "SUB_AREA"];
const pick = (p = {}) => Object.fromEntries(KEEP.filter((k) => p[k] != null && p[k] !== "").map((k) => [k, p[k]]));
const r5 = (n) => Math.round(n * 1e5) / 1e5;

function dp(pts, tol) {                       // Douglas–Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let m = 0, mi = -1; const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) { const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L)); const d = Math.hypot(pts[i][0] - (ax + t * dx), pts[i][1] - (ay + t * dy)); if (d > m) { m = d; mi = i; } }
    if (m > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const readFC = (f) => { const g = JSON.parse(readFileSync(f, "utf8")); return g.type === "FeatureCollection" ? g.features : g.type === "Feature" ? [g] : []; };
const bboxOf = (rings) => { const b = [180, 90, -180, -90]; for (const r of rings) for (const [x, y] of r) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } return b; };

const rivers = []; const seen = new Set();
for (const f of riversIn) for (const ft of readFC(f)) {
  const g = ft.geometry; if (!g) continue;
  const lines = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
  const runs = [];
  for (const ln of lines) { let run = []; for (const p of ln) { if (inside(p)) run.push(p); else { if (run.length > 1) runs.push(run); run = []; } } if (run.length > 1) runs.push(run); }
  const out = runs.map((r) => dp(r, 0.0002).map(([x, y]) => [r5(x), r5(y)])).filter((r) => r.length > 1);
  if (!out.length) continue;
  const key = JSON.stringify(out[0][0]) + (ft.properties?.name ?? ""); if (seen.has(key)) continue; seen.add(key);
  rivers.push({ type: "Feature", properties: pick(ft.properties), geometry: { type: "MultiLineString", coordinates: out } });
}
const basins = [];
for (const f of basinsIn) for (const ft of readFC(f)) {
  const g = ft.geometry; if (!g) continue;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  const kept = polys.filter((poly) => hitsBox(bboxOf(poly))).map((poly) => poly.map((ring) => dp(ring, 0.0005).map(([x, y]) => [r5(x), r5(y)])).filter((r) => r.length >= 4));
  if (kept.length) basins.push({ type: "Feature", properties: pick(ft.properties), geometry: { type: "MultiPolygon", coordinates: kept } });
}
mkdirSync(new URL("../public/gis/", import.meta.url), { recursive: true });
const write = (name, features, extra) => { if (!features.length) return console.log(`${name}: nothing near the sites, file not written`); const s = JSON.stringify({ type: "FeatureCollection", attribution, ...extra, features }); writeFileSync(new URL(`../public/gis/${name}`, import.meta.url), s); console.log(`${name}: ${features.length} features, ${(s.length / 1024).toFixed(0)} KB`); };
if (riversIn.length) write("rivers.geojson", rivers, { kind: "rivers" });
if (basinsIn.length) write("watersheds.geojson", basins, { kind: "watersheds" });
