// Server-side storage for sensors, readings, alert acknowledgements and site measurements.
// Backends (chosen automatically):
//   • Supabase REST, when NEXT_PUBLIC_DATA_SOURCE=supabase and the URL is set. Needs SUPABASE_SERVICE_ROLE_KEY
//     (server only, never sent to the browser). The v3 tables have row-level security on and NO public policies,
//     so the anon key cannot read or write them.
//   • A JSON file under .data/ (override with DATA_DIR) otherwise. Good for local use and single-server hosting;
//     NOT suitable for serverless platforms with read-only or ephemeral disks.
import { promises as fs } from "node:fs";
import path from "node:path";
import { dailySummary } from "@/lib/anomaly";
import type { Sensor, SensorReading } from "@/types";

export { dailySummary };

export interface Measurement { siteId: string; date: string; parameter: "discharge"; value: number; source: string }
export interface ReadingRow { sensorId: string; at: string; values: SensorReading["values"] }

export interface ServerStore {
  kind: "supabase" | "file";
  listSensors(): Promise<Sensor[]>;
  addSensor(s: Omit<Sensor, "id">): Promise<Sensor>;
  updateSensor(id: string, patch: Partial<Pick<Sensor, "status" | "name">>): Promise<Sensor | null>;
  addReadings(rows: ReadingRow[]): Promise<number>;
  readings(sensorId: string, sinceMs: number): Promise<SensorReading[]>;
  /** Readings of several sensors since a date (used for daily summaries). */
  readingsMany(sensorIds: string[], sinceMs: number): Promise<ReadingRow[]>;
  acks(): Promise<string[]>;
  ack(alertId: string, by: string): Promise<void>;
  addMeasurements(rows: Measurement[]): Promise<number>;
  measurements(siteId: string, fromDate: string): Promise<Measurement[]>;
}

const RETAIN_DAYS_FILE = 120;

// ─────────────── file backend ───────────────
interface FileDb { sensors: Sensor[]; readings: Record<string, SensorReading[]>; acks: string[]; measurements: Measurement[] }
const dir = () => process.env.DATA_DIR || path.join(process.cwd(), ".data");
const fileOf = () => path.join(dir(), "aqualens-store.json");
let cache: FileDb | null = null;
let chain: Promise<unknown> = Promise.resolve();   // serialises writes inside one server process
const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const r = chain.then(fn, fn); chain = r.catch(() => undefined); return r; };

async function loadFile(): Promise<FileDb> {
  if (cache) return cache;
  try { cache = JSON.parse(await fs.readFile(fileOf(), "utf8")) as FileDb; }
  catch { cache = { sensors: [], readings: {}, acks: [], measurements: [] }; }
  return cache;
}
async function saveFile(db: FileDb) {
  await fs.mkdir(dir(), { recursive: true });
  const tmp = `${fileOf()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db)); await fs.rename(tmp, fileOf());
}
const nextId = (all: Sensor[]) => `SNS-${Math.max(99, ...all.map((x) => Number(x.id.slice(4)) || 0)) + 1}`;

const fileStore: ServerStore = {
  kind: "file",
  listSensors: async () => structuredClone((await loadFile()).sensors),
  addSensor: (s) => serial(async () => { const db = await loadFile(); const sensor: Sensor = { ...s, id: nextId(db.sensors) }; db.sensors.push(sensor); await saveFile(db); return structuredClone(sensor); }),
  updateSensor: (id, patch) => serial(async () => { const db = await loadFile(); const s = db.sensors.find((x) => x.id === id); if (!s) return null; Object.assign(s, patch); await saveFile(db); return structuredClone(s); }),
  addReadings: (rows) => serial(async () => {
    const db = await loadFile(); const cutoff = Date.now() - RETAIN_DAYS_FILE * 864e5;
    for (const r of rows) {
      const list = (db.readings[r.sensorId] ??= []); const i = list.findIndex((x) => x.at === r.at);
      if (i >= 0) list[i] = { at: r.at, values: r.values }; else list.push({ at: r.at, values: r.values });
    }
    for (const k of Object.keys(db.readings)) { db.readings[k] = db.readings[k].filter((x) => +new Date(x.at) >= cutoff).sort((a, b) => a.at.localeCompare(b.at)); }
    await saveFile(db); return rows.length;
  }),
  readings: async (id, since) => ((await loadFile()).readings[id] ?? []).filter((x) => +new Date(x.at) >= since),
  readingsMany: async (ids, since) => { const db = await loadFile(); return ids.flatMap((id) => (db.readings[id] ?? []).filter((x) => +new Date(x.at) >= since).map((x) => ({ sensorId: id, ...x }))); },
  acks: async () => [...(await loadFile()).acks],
  ack: (id) => serial(async () => { const db = await loadFile(); if (!db.acks.includes(id)) { db.acks.push(id); await saveFile(db); } }),
  addMeasurements: (rows) => serial(async () => {
    const db = await loadFile();
    for (const m of rows) { const i = db.measurements.findIndex((x) => x.siteId === m.siteId && x.date === m.date && x.parameter === m.parameter); if (i >= 0) db.measurements[i] = m; else db.measurements.push(m); }
    await saveFile(db); return rows.length;
  }),
  measurements: async (siteId, from) => (await loadFile()).measurements.filter((m) => m.siteId === siteId && m.date >= from).sort((a, b) => a.date.localeCompare(b.date)),
};

// ─────────────── Supabase REST backend ───────────────
const sb = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server storage needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return { url: `${url}/rest/v1`, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } };
};
async function rest<T>(pathAndQuery: string, init: RequestInit = {}): Promise<T> {
  const { url, headers } = sb();
  const res = await fetch(`${url}/${pathAndQuery}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, cache: "no-store" });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (res.status === 204 ? undefined : await res.json().catch(() => undefined)) as T;
}
type SensorRow = { id: string; name: string; site_id: string | null; parameters: string[]; status: Sensor["status"]; registered_at: string; registered_by: string; feed: Sensor["feed"] };
const toSensor = (r: SensorRow): Sensor => ({ id: r.id, name: r.name, siteId: r.site_id ?? undefined, parameters: r.parameters as Sensor["parameters"], status: r.status, registeredAt: r.registered_at, registeredBy: r.registered_by, feed: r.feed });
const CHUNK = 500;

const supabaseStore: ServerStore = {
  kind: "supabase",
  listSensors: async () => (await rest<SensorRow[]>("sensors?select=*&order=id.asc")).map(toSensor),
  addSensor: async (s) => {
    const all = await supabaseStore.listSensors();
    for (let attempt = 0; attempt < 3; attempt++) {                 // retry if two people register at the same moment
      const id = `SNS-${Math.max(99, ...all.map((x) => Number(x.id.slice(4)) || 0)) + 1 + attempt}`;
      try {
        const [row] = await rest<SensorRow[]>("sensors", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ id, name: s.name, site_id: s.siteId ?? null, parameters: s.parameters, status: s.status, registered_at: s.registeredAt, registered_by: s.registeredBy, feed: s.feed }) });
        return toSensor(row);
      } catch (e) { if (attempt === 2 || !String((e as Error).message).includes("409")) throw e; }
    }
    throw new Error("Could not allocate a sensor id.");
  },
  updateSensor: async (id, patch) => { const rows = await rest<SensorRow[]>(`sensors?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }); return rows[0] ? toSensor(rows[0]) : null; },
  addReadings: async (rows) => {
    for (let i = 0; i < rows.length; i += CHUNK) await rest("sensor_readings?on_conflict=sensor_id,at", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + CHUNK).map((r) => ({ sensor_id: r.sensorId, at: r.at, values: r.values }))) });
    return rows.length;
  },
  readings: async (id, since) => (await rest<{ at: string; values: SensorReading["values"] }[]>(`sensor_readings?select=at,values&sensor_id=eq.${encodeURIComponent(id)}&at=gte.${new Date(since).toISOString()}&order=at.asc&limit=20000`)),
  readingsMany: async (ids, since) => {
    if (!ids.length) return [];
    const rows = await rest<{ sensor_id: string; at: string; values: SensorReading["values"] }[]>(`sensor_readings?select=sensor_id,at,values&sensor_id=in.(${ids.map(encodeURIComponent).join(",")})&at=gte.${new Date(since).toISOString()}&order=at.asc&limit=100000`);
    return rows.map((r) => ({ sensorId: r.sensor_id, at: r.at, values: r.values }));
  },
  acks: async () => (await rest<{ alert_id: string }[]>("sensor_alert_acks?select=alert_id")).map((r) => r.alert_id),
  ack: async (alertId, by) => { await rest("sensor_alert_acks?on_conflict=alert_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ alert_id: alertId, acked_by: by }) }); },
  addMeasurements: async (rows) => {
    for (let i = 0; i < rows.length; i += CHUNK) await rest("site_measurements?on_conflict=site_id,date,parameter", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + CHUNK).map((m) => ({ site_id: m.siteId, date: m.date, parameter: m.parameter, value: m.value, source: m.source }))) });
    return rows.length;
  },
  measurements: async (siteId, from) => (await rest<{ site_id: string; date: string; parameter: "discharge"; value: number; source: string }[]>(`site_measurements?select=*&site_id=eq.${encodeURIComponent(siteId)}&date=gte.${from}&order=date.asc&limit=20000`)).map((m) => ({ siteId: m.site_id, date: m.date, parameter: m.parameter, value: m.value, source: m.source })),
};

export const store = (): ServerStore =>
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase" && process.env.NEXT_PUBLIC_SUPABASE_URL ? supabaseStore : fileStore;
