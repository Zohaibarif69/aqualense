// Pure sensor parameter limits and anomaly checks. No browser or server imports, so the same code runs in the
// browser (simulated feed) and in API routes (live feed).
import type { AnomalyAlert, DailyMeasurement, MeasuredParameter, Sensor, SensorParameter, SensorReading } from "@/types";

export const PARAMS: Record<SensorParameter, { label: string; unit: string; base: number; noise: number; min?: number; max?: number }> = {
  water_temperature: { label: "Water temperature", unit: "°C", base: 14, noise: 0.35, max: 28 },
  turbidity: { label: "Turbidity", unit: "NTU", base: 8, noise: 1.2, max: 50 },
  ph: { label: "pH", unit: "", base: 7.6, noise: 0.08, min: 6, max: 9 },
  dissolved_oxygen: { label: "Dissolved oxygen", unit: "mg/L", base: 9.2, noise: 0.25, min: 5 },
  conductivity: { label: "Conductivity", unit: "µS/cm", base: 420, noise: 12 },
};
export const ALL_PARAMS = Object.keys(PARAMS) as SensorParameter[];

export const HOUR = 36e5;

export function detectAnomalies(sensor: Sensor, readings: SensorReading[]): AnomalyAlert[] {
  const out: AnomalyAlert[] = [];
  for (const p of sensor.parameters) {
    const c = PARAMS[p];
    readings.forEach((r, i) => {
      const v = r.values[p]; if (v == null) return;
      const add = (kind: AnomalyAlert["kind"], severity: AnomalyAlert["severity"], message: string) =>
        out.push({ id: `${sensor.id}:${p}:${r.at}:${kind}`, sensorId: sensor.id, parameter: p, at: r.at, value: v, kind, severity, message });
      if (c.max != null && v > c.max) add("outside_range", p === "ph" ? "high" : "watch", `${c.label} ${v}${c.unit && " " + c.unit} is above the usual limit (${c.max}).`);
      else if (c.min != null && v < c.min) add("outside_range", v < c.min - 2 ? "high" : "watch", `${c.label} ${v}${c.unit && " " + c.unit} is below the usual limit (${c.min}).`);
      const tMs = +new Date(r.at);   // previous six hours by timestamp, so irregular real-world cadence still works
      const win = readings.slice(Math.max(0, i - 200), i).filter((x) => tMs - +new Date(x.at) <= 6 * HOUR).map((x) => x.values[p]).filter((x): x is number => x != null);
      if (win.length >= 5) {
        const mean = win.reduce((a, b) => a + b, 0) / win.length;
        const sd = Math.max(Math.sqrt(win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length), c.noise / 2);   // floor: a handful of samples can look unrealistically steady
        const z = (v - mean) / sd;
        if (Math.abs(z) > 4 && !out.some((a) => a.id.startsWith(`${sensor.id}:${p}:${r.at}`))) add("sudden_change", Math.abs(z) > 8 ? "high" : "watch", `${c.label} changed suddenly to ${v}${c.unit && " " + c.unit} (${z > 0 ? "+" : ""}${z.toFixed(1)} standard deviations from the previous 6 hours).`);
      }
    });
  }
  // collapse back-to-back readings of the same kind into one alert per parameter and event
  const seen = new Set<string>(); const res: AnomalyAlert[] = [];
  for (const a of out.sort((x, y) => x.at.localeCompare(y.at))) {
    const key = `${a.sensorId}:${a.parameter}:${a.kind}`;
    const last = [...res].reverse().find((r) => r.sensorId === a.sensorId && r.parameter === a.parameter && r.kind === a.kind);
    if (last && +new Date(a.at) - +new Date(last.at) <= 2 * HOUR) continue;
    seen.add(key); res.push(a);
  }
  return res.reverse();
}


/** An active sensor that has stopped reporting is itself worth a prompt: real probes fail silently. */
export function staleAlert(sensor: Sensor, readings: SensorReading[], now = Date.now(), maxGapMin = 60): AnomalyAlert | null {
  if (sensor.status !== "active") return null;
  const lastMs = readings.length ? +new Date(readings[readings.length - 1].at) : +new Date(sensor.registeredAt);
  if (now - lastMs <= maxGapMin * 60_000) return null;
  const p = sensor.parameters[0];
  const mins = Math.round((now - lastMs) / 60_000);
  return { id: `${sensor.id}:*:${new Date(lastMs).toISOString()}:no_data`, sensorId: sensor.id, parameter: p, at: new Date(now).toISOString(), value: NaN, kind: "no_data", severity: mins > 360 ? "high" : "watch",
    message: readings.length ? `No reading for ${mins >= 120 ? Math.round(mins / 60) + " hours" : mins + " minutes"}. The sensor may be offline.` : "This active sensor has not sent any readings yet." };
}

/** Daily mean/min/max per parameter from raw readings (UTC days). */
export function dailySummary(rows: { at: string; values: SensorReading["values"] }[]): Partial<Record<MeasuredParameter, DailyMeasurement[]>> {
  const acc = new Map<string, Map<string, number[]>>();
  for (const r of rows) for (const [p, v] of Object.entries(r.values)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const day = r.at.slice(0, 10); const byDay = acc.get(p) ?? new Map<string, number[]>(); const arr = byDay.get(day) ?? []; arr.push(v); byDay.set(day, arr); acc.set(p, byDay);
  }
  const out: Partial<Record<MeasuredParameter, DailyMeasurement[]>> = {};
  for (const [p, byDay] of acc) out[p as MeasuredParameter] = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3), min: Math.min(...v), max: Math.max(...v), n: v.length }));
  return out;
}
