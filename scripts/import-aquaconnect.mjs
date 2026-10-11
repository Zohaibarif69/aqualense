// Converts AquaConnect (OneAquaHealth) CSV outputs in data/aquaconnect/ into src/data/aquaconnect.json,
// which AquaLens uses for monitoring sites, environmental indicators and the discharge outlook.
//
// Usage:  npm run data:import
// To refresh: replace the CSVs in data/aquaconnect/ with newer AquaConnect outputs
//             (dashboard_app/public/data/*), run this script, then `npm run db:seed:generate`.
//
// No third-party packages are needed. Missing values ("NA", empty) stay null — they are never turned into zero.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const dir = new URL("../data/aquaconnect/", import.meta.url);
const outFile = new URL("../src/data/aquaconnect.json", import.meta.url);

// ---------- tiny RFC-4180 CSV reader ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0] !== "");
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const read = (name) => parseCsv(readFileSync(new URL(name, dir), "utf8"));
const num = (v) => (v === "" || v == null || v === "NA" || v === "NaN" ? null : Number.isFinite(+v) ? +v : null);
const iso = (d) => `${d}T00:00:00.000Z`;
const r = (v, n = 2) => (v == null ? null : +v.toFixed(n));
const by = (rows, key) => new Map(rows.map((x) => [x[key], x]));
const group = (rows, key) => rows.reduce((m, x) => (m.get(x[key])?.push(x) ?? m.set(x[key], [x]), m), new Map());

// ---------- load ----------
const map = read("22_dashboard_map.csv");
const edges = read("24_network_edges.csv");
const weather = group(read("39_live_weather_7day.csv"), "site_id");
const glofas = group(read("39_live_glofas_7day.csv"), "site_id");
const dilution = by(read("44_relative_dilution_context_by_site.csv"), "site_id");
const eco = by(read("45_ecological_outlook_by_site.csv"), "site_id");
const ecoDaily = group(read("45_ecological_outlook_daily.csv"), "site_id");
const past = group(read("47_monitoring_discharge_slim.csv"), "site_id");
const hazard = by(read("40_live_hazard_by_site.csv"), "site_id");
const qc = Object.fromEntries(read("45_ecological_outlook_QC.csv").map((x) => [x.metric, x.value]));

const forecastStart = qc.forecast_start, forecastEnd = qc.forecast_end;
if (!forecastStart || !forecastEnd) throw new Error("45_ecological_outlook_QC.csv has no forecast_start / forecast_end");
const issuedAt = new Date(read("47_monitoring_discharge_slim.csv").find((x) => x.snapshot_id && x.generated_at && x.temporal_status === "Current outlook")?.generated_at.replace(/([+-]\d\d)(\d\d)$/, "$1:$2") ?? `${forecastStart}T00:00:00Z`).toISOString();
const validFrom = iso(forecastStart), validTo = iso(forecastEnd);

// ---------- sites ----------
const PRIORITY = { "Very high": "high", High: "high", Moderate: "medium", Low: "low", "Very low": "low", "Insufficient data": "not_assessed" };
const up = new Map(), down = new Map();
for (const e of edges) {
  (down.get(e.upstream_site) ?? down.set(e.upstream_site, []).get(e.upstream_site)).push(e.downstream_site);
  (up.get(e.downstream_site) ?? up.set(e.downstream_site, []).get(e.downstream_site)).push(e.upstream_site);
}
const uniq = (a = []) => [...new Set(a)].sort((x, y) => x.localeCompare(y, "en", { numeric: true }));

const sites = map.map((m) => {
  const complete = m.data_status === "Complete";
  return {
    id: m.site_id,
    name: m.site_name,
    city: m.city_name,
    latitude: num(m.latitude),
    longitude: num(m.longitude),
    siteType: "OneAquaHealth monitoring site",
    upstreamSiteIds: uniq(up.get(m.site_id)),
    downstreamSiteIds: uniq(down.get(m.site_id)),
    dataAvailability: complete ? "Weather, hydrology (GloFAS), ecological screening" : "Weather, hydrology (GloFAS), ecological screening · priority not assessed (incomplete static data)",
    monitoringPriority: PRIORITY[m.monitoring_priority_class] ?? "not_assessed",
    priorityClass: m.monitoring_priority_class,
    priorityScore: r(num(m.monitoring_priority_score), 2),
    hasSensor: false,
  };
}).sort((a, b) => a.city.localeCompare(b.city) || a.id.localeCompare(b.id, "en", { numeric: true }));

// ---------- indicators ----------
const SOURCE = "AquaConnect / OneAquaHealth screening pipeline";
const COMMON = "Screening indicator, not a probability or a confirmed condition. Daily upper-20% flags are relative to all 106 sites.";
const EVIDENCE = {
  PARTIAL_WATERBASE_CONTEXT: "Supporting data: partial EEA Waterbase context.",
  OXYGEN_CONTEXT_ONLY: "Supporting data: oxygen context only.",
  WATER_TEMP_AND_NUTRIENT_CONTEXT: "Supporting data: water-temperature and nutrient context.",
  OXYGEN_AND_BIOLOGICAL_CONTEXT: "Supporting data: oxygen and biological context.",
  MULTI_SOURCE_CONTEXT: "Supporting data: multiple sources.",
  PARTIAL_CONTEXT: "Supporting data: partial context.",
};
const evidenceNote = (...codes) => [...new Set(codes.map((c) => EVIDENCE[c]).filter(Boolean))];
const dayWord = (n) => (n === 1 ? "1 day" : `${n} days`);
const watch = (n, total = 7) => (n == null ? undefined : n === 0 ? `No upper-tail days in the ${total}-day window` : `Upper-tail screening on ${dayWord(n)} of ${total}`);
const shortDate = (d) => (d ? new Date(iso(d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");
const mode = (xs) => { const c = {}; for (const x of xs) c[x] = (c[x] ?? 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; };

const indicators = [];
for (const s of sites) {
  const id = s.id, e = eco.get(id), d = dilution.get(id), w = weather.get(id), g = glofas.get(id), days = ecoDaily.get(id);
  const base = { siteId: id, source: SOURCE, observedAt: issuedAt, issuedAt, validFrom, validTo, dataStatus: "available" };
  const missing = (key, name, kind, description) => indicators.push({ ...base, id: `${id}-${key}`, name, kind, description, dataStatus: "missing", observedAt: undefined, issuedAt: undefined, validFrom: undefined, validTo: undefined, limitations: [] });

  // Weather context (Open-Meteo 7-day forecast)
  if (w?.length) {
    const rain = w.reduce((a, x) => a + (num(x.precipitation_sum) ?? 0), 0);
    const tmax = Math.max(...w.map((x) => num(x.temperature_2m_max)).filter((x) => x != null));
    indicators.push({ ...base, id: `${id}-wx`, name: "Weather context", kind: "forecast", level: `Peak ${r(tmax, 1)} °C · ${r(rain, 1)} mm rain expected`, value: r(rain, 1), unit: "mm (7-day forecast total)", description: "Open-Meteo daily forecast for the site over the next seven days.", limitations: ["Forecast values, not measurements at the site."] });
  } else missing("wx", "Weather context", "forecast", "No weather forecast was returned for this site.");

  // Hydrological conditions (GloFAS v4, regional cell)
  if (g?.length && d) {
    const q = g.map((x) => num(x.river_discharge)).filter((x) => x != null);
    const mean = q.reduce((a, b) => a + b, 0) / q.length;
    indicators.push({ ...base, id: `${id}-hyd`, name: "Hydrological conditions", kind: "forecast", level: `${Math.round(num(d.dilution_percentile_min) * 100)}th–${Math.round(num(d.dilution_percentile_max) * 100)}th seasonal percentile`, value: r(mean, 2), unit: "m³/s (7-day mean)", description: "Regional GloFAS v4 river-discharge context for the grid cell containing the site.", limitations: ["Regional hydrological context; not the exact discharge of the local stream.", "Percentiles compare with the 1997–2024 seasonal reference."] });
  } else missing("hyd", "Hydrological conditions", "forecast", "No river-discharge forecast was returned for this site.");

  // Algal-growth conditions
  if (e) {
    indicators.push({ ...base, id: `${id}-alg`, name: "Conditions associated with algal growth", kind: "forecast", level: watch(num(e.algal_watch_days)), value: r(num(e.algal_growth_max), 2), unit: `relative index 0–1 (peak${e.algal_growth_peak_date ? ", " + shortDate(e.algal_growth_peak_date) : ""})`, description: "Warmth, sunlight and low-flow conditions that favour algal growth. Not a confirmed bloom.", limitations: [COMMON, ...evidenceNote(e.algal_context_evidence)] });
    indicators.push({ ...base, id: `${id}-als`, name: "Aquatic-life stress screening", kind: "forecast", level: watch(num(e.aquatic_watch_days)), value: r(num(e.aquatic_stress_max), 2), unit: `relative index 0–1 (peak${e.aquatic_stress_peak_date ? ", " + shortDate(e.aquatic_stress_peak_date) : ""})`, description: "Thermal and flow conditions that can stress aquatic life. Not evidence of fish mortality.", limitations: [COMMON, ...evidenceNote(e.aquatic_context_evidence), ...(e.biological_evidence_quality === "INSUFFICIENT" ? ["Local biological (GBIF) evidence is insufficient."] : [])] });
    const src = days?.length ? mode(days.map((x) => x.dominant_pollution_source).filter((x) => x && x !== "NA" && x !== "No rainfall pulse")) : undefined;
    indicators.push({ ...base, id: `${id}-pp`, name: "Potential pollution-pulse context", kind: "forecast", level: watch(num(e.pollution_watch_days)), value: r(num(e.pollution_pulse_max), 2), unit: `relative index 0–1 (peak${e.pollution_pulse_peak_date ? ", " + shortDate(e.pollution_pulse_peak_date) : ""})`, description: `Rain-driven runoff conditions in which a pollution pulse could occur. Does not confirm an incident.${src ? ` Main background source context: ${src.toLowerCase()}.` : ""}`, limitations: [COMMON, "Background source pressure is held fixed from the static model."] });
  } else {
    missing("alg", "Conditions associated with algal growth", "forecast", "No ecological screening was produced for this site.");
    missing("als", "Aquatic-life stress screening", "forecast", "No ecological screening was produced for this site.");
    missing("pp", "Potential pollution-pulse context", "forecast", "No ecological screening was produced for this site.");
  }

  // Short-term hazard screening (climate + hydrology components, combined with background pressure)
  const hz = hazard.get(id);
  if (hz && num(hz.dynamic_hazard_v5) != null) {
    const clim = num(hz.climate_hazard_v3), hyd = num(hz.hydrology_hazard_v3), stat = num(hz.static_pressure), ev = num(hz.event_risk_geometric_v5);
    const dom = hz.dominant_hydrology_hazard && hz.dominant_hydrology_hazard !== "None" && hz.dominant_hydrology_hazard !== "NA" ? ` Main flow signal: ${hz.dominant_hydrology_hazard.toLowerCase()}.` : "";
    indicators.push({ ...base, id: `${id}-haz`, name: "Short-term hazard screening", kind: "forecast", level: `Climate ${r(clim, 2)} · Hydrology ${r(hyd, 2)}`, value: r(num(hz.dynamic_hazard_v5), 2), unit: "relative index 0–1 (dynamic hazard, 7-day)", description: `Combined climate (heat, heavy rain, wind, dry spell) and hydrology (low/high flow) hazard for the next seven days.${dom}${stat != null ? ` Static background pressure: ${r(stat, 2)}.` : ""}${ev != null ? ` Combined event-risk score: ${r(ev, 2)}.` : ""}`, limitations: [COMMON, "Hazard components are model scores, not measured conditions.", "Hydrology uses regional GloFAS discharge, not a local gauge."] });
  } else missing("haz", "Short-term hazard screening", "forecast", "No hazard score was produced for this site.");

  // Relative dilution
  if (d) {
    indicators.push({ ...base, id: `${id}-dil`, name: "Relative dilution context", kind: "forecast", level: d.seven_day_dilution_context, value: Math.round(num(d.dilution_percentile_min) * 100), unit: "percentile (lowest day of the 7)", description: "Flow relative to this site's own seasonal history — not absolute dilution capacity.", limitations: [COMMON, "Based on regional GloFAS discharge, not a local gauge."] });
  } else missing("dil", "Relative dilution context", "forecast", "No relative-dilution context was produced for this site.");
}
// Keep the card order the app already uses.
const ORDER = ["wx", "hyd", "haz", "alg", "pp", "dil", "als"];
indicators.sort((a, b) => a.siteId.localeCompare(b.siteId, "en", { numeric: true }) || ORDER.indexOf(a.id.split("-").pop()) - ORDER.indexOf(b.id.split("-").pop()));

// ---------- discharge series (recent archived outlook + 7-day forecast) ----------
const discharge = {};
for (const s of sites) {
  const pastRows = (past.get(s.id) ?? []).filter((x) => x.date < forecastStart).slice(-7);
  const f = glofas.get(s.id) ?? [];
  const series = [
    ...pastRows.map((x) => ({ date: iso(x.date), observed: num(x.discharge_m3s), forecast: null })),
    ...f.map((x) => ({ date: iso(x.date), observed: null, forecast: num(x.river_discharge) })),
  ];
  if (series.some((p) => p.observed != null || p.forecast != null)) discharge[s.id] = series;
}

// ---------- write ----------
const out = {
  meta: {
    source: "AquaConnect / OneAquaHealth screening dashboard (compact release)",
    forecastStart, forecastEnd, issuedAt,
    siteCount: sites.length,
    cities: [...new Set(sites.map((s) => s.city))],
    note: "Screening outputs, not probabilities of ecological damage, fish mortality, algal blooms or pollutant concentrations.",
  },
  sites, indicators, discharge,
};
mkdirSync(new URL("../src/data/", import.meta.url), { recursive: true });
writeFileSync(outFile, JSON.stringify(out));
const miss = indicators.filter((i) => i.dataStatus === "missing").length;
console.log(`Wrote src/data/aquaconnect.json: ${sites.length} sites, ${indicators.length} indicators (${miss} missing), ${Object.keys(discharge).length} discharge series, forecast ${forecastStart} → ${forecastEnd}`);
