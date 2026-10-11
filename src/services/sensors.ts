// Sensor registry, readings and anomaly alerts. Two modes, chosen by NEXT_PUBLIC_SENSOR_SOURCE:
//   "simulated" (default): demo probes. The registry and acknowledgements are stored in this browser and readings are
//                          generated deterministically from the sensor id and the clock.
//   "server":              everything lives on the server (see src/app/api/sensors/*). Real devices push readings to
//                          POST /api/sensors/ingest with INGEST_API_KEY. Alerts are computed server-side.
import * as db from "@/mocks/data";
import { ALL_PARAMS, HOUR, PARAMS, dailySummary, detectAnomalies } from "@/lib/anomaly";
import type { AnomalyAlert, Sensor, SensorParameter, SensorReading, SiteMeasurements } from "@/types";
import { ApiError } from "./apiClient";
import { getUser, syncSession } from "./identity";

export { ALL_PARAMS, PARAMS, detectAnomalies };
export const SENSOR_SOURCE: "server" | "simulated" = process.env.NEXT_PUBLIC_SENSOR_SOURCE === "server" ? "server" : "simulated";
type Alert = AnomalyAlert & { acknowledged: boolean; sensorName: string };

/** Calls the sensor API. A 401 on a write retries once after refreshing the signed role cookie. */
async function call<T>(path: string, init?: RequestInit, write = false): Promise<T> {
  const go = () => fetch(path, { ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers }, cache: "no-store" });
  let res = await go().catch(() => { throw new ApiError("network", "Couldn’t reach the server."); });
  if (res.status === 401 && write && (await syncSession(getUser().role))) res = await go();
  if (!res.ok) { const b = (await res.json().catch(() => ({}))) as { message?: string }; throw new ApiError(res.status === 401 ? "auth" : res.status === 403 ? "forbidden" : "server", b.message ?? `Request failed (${res.status}).`); }
  return (await res.json()) as T;
}

const REG_KEY = "aqualens.sensors.v1";
const ACK_KEY = "aqualens.sensorAcks.v1";
const load = <T,>(k: string, fallback: T): T => { try { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as T) : fallback; } catch { return fallback; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

function seedSensors(): Sensor[] {
  const firstPerCity = new Map<string, string>();
  db.sites.forEach((s) => { if (s.city && !firstPerCity.has(s.city)) firstPerCity.set(s.city, s.id); });
  return [...firstPerCity.values()].slice(0, 4).map((siteId, i) => ({
    id: `SNS-${100 + i}`, name: `${db.sites.find((s) => s.id === siteId)?.name} demo probe`, siteId, parameters: ALL_PARAMS,
    status: "active" as const, registeredAt: new Date(Date.now() - (30 - i) * 864e5).toISOString(), registeredBy: "system-demo", feed: "simulated" as const,
  }));
}
let registry: Sensor[] | null = null;
const reg = () => (registry ??= load<Sensor[] | null>(REG_KEY, null) ?? (save(REG_KEY, seedSensors()), load<Sensor[]>(REG_KEY, seedSensors())));

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rand = (seed: string) => { const h = hash(seed); return ((h % 10000) / 10000) * 2 - 1; };   // −1..1, deterministic

const slot = (t: number) => Math.floor(t / (HOUR / 4)) * (HOUR / 4);   // one reading every 15 minutes
function simulate(sensor: Sensor, t: number): SensorReading {
  const values: SensorReading["values"] = {};
  const hourIdx = Math.floor(t / HOUR);
  const prone = hash(sensor.id) % 3 === 0;                 // some sensors have periodic events so alerts can be demonstrated
  const event = prone && hourIdx % 31 < 2;
  for (const p of sensor.parameters) {
    const c = PARAMS[p];
    const daily = Math.sin(((t / HOUR) % 24) / 24 * Math.PI * 2 - 1.5);
    let v = c.base + rand(`${sensor.id}:${p}:${t}`) * c.noise * 2 + (p === "water_temperature" ? daily * 1.5 : 0);
    if (event && p === "turbidity") v += 45;
    if (event && p === "dissolved_oxygen") v -= 3.5;
    if (event && p === "ph") v -= 1.2;
    values[p] = Math.round(v * 100) / 100;
  }
  return { at: new Date(t).toISOString(), values };
}

const needRole = () => { const r = getUser().role; if (r === "citizen") throw new ApiError("forbidden", "Only reviewers, researchers and admins can manage sensors."); return r; };

const simulatedApi = {
  async list(): Promise<Sensor[]> { return structuredClone(reg()); },
  async register(input: { name: string; siteId?: string; parameters: SensorParameter[] }): Promise<Sensor> {
    needRole();
    const name = input.name.trim();
    if (!name) throw new ApiError("invalid", "Give the sensor a name.");
    if (!input.parameters.length) throw new ApiError("invalid", "Choose at least one parameter.");
    if (reg().some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new ApiError("invalid", "A sensor with that name already exists.");
    const s: Sensor = { id: `SNS-${Math.max(99, ...reg().map((x) => +x.id.slice(4))) + 1}`, name, siteId: input.siteId || undefined, parameters: input.parameters, status: "active", registeredAt: new Date().toISOString(), registeredBy: getUser().id, feed: "simulated" };
    reg().push(s); save(REG_KEY, reg()); return structuredClone(s);
  },
  async setStatus(id: string, status: Sensor["status"]): Promise<Sensor> {
    needRole();
    const s = reg().find((x) => x.id === id); if (!s) throw new ApiError("not_found", "Sensor not found.");
    s.status = status; save(REG_KEY, reg()); return structuredClone(s);
  },
  /** Last `hours` of readings, newest last. Offline sensors have none for the last 6 hours. */
  async readings(id: string, hours = 48): Promise<SensorReading[]> {
    const s = reg().find((x) => x.id === id); if (!s) throw new ApiError("not_found", "Sensor not found.");
    const end = slot(Date.now()); const out: SensorReading[] = [];
    const cut = s.status === "active" ? 0 : s.status === "offline" ? 6 * HOUR : 12 * HOUR;
    for (let t = end - hours * HOUR; t <= end - cut; t += HOUR / 4) out.push(simulate(s, t));
    return out;
  },
  async alerts(): Promise<Alert[]> {
    const acks = new Set(load<string[]>(ACK_KEY, []));
    const all: Alert[] = [];
    for (const s of reg().filter((x) => x.status === "active")) {
      const r = await simulatedApi.readings(s.id, 48);
      detectAnomalies(s, r).forEach((a) => all.push({ ...a, acknowledged: acks.has(a.id), sensorName: s.name }));
    }
    return all.sort((a, b) => b.at.localeCompare(a.at));
  },
  async acknowledge(alertId: string): Promise<void> { needRole(); const acks = new Set(load<string[]>(ACK_KEY, [])); acks.add(alertId); save(ACK_KEY, [...acks]); },
};

const serverApi: typeof simulatedApi = {
  list: () => call<Sensor[]>("/api/sensors"),
  register: (input) => call<Sensor>("/api/sensors", { method: "POST", body: JSON.stringify(input) }, true),
  setStatus: (id, status) => call<Sensor>(`/api/sensors/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }, true),
  readings: (id, hours = 48) => call<SensorReading[]>(`/api/sensors/${encodeURIComponent(id)}/readings?hours=${hours}`),
  alerts: () => call<Alert[]>("/api/sensors/alerts"),
  acknowledge: async (alertId) => { await call("/api/sensors/acks", { method: "POST", body: JSON.stringify({ alertId }) }, true); },
};
export const sensorsApi = SENSOR_SOURCE === "server" ? serverApi : simulatedApi;

/** Daily summaries of what was measured at a site. Server mode: stored sensor readings and gauge discharge. Simulated mode: demo probes only. */
export const measurementsApi = {
  async forSite(siteId: string, days: number): Promise<SiteMeasurements> {
    if (SENSOR_SOURCE === "server") return call<SiteMeasurements>(`/api/measurements?siteId=${encodeURIComponent(siteId)}&days=${days}`);
    const linked = reg().filter((s) => s.siteId === siteId);
    const end = slot(Date.now()); const rows: { at: string; values: SensorReading["values"] }[] = [];
    for (const s of linked) for (let t = end - days * 24 * HOUR; t <= end; t += HOUR) rows.push(simulate(s, t));   // hourly is enough for daily means
    return { siteId, days, source: "simulated", series: dailySummary(rows) };
  },
};
