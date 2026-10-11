#!/usr/bin/env node
// Test device: pushes readings for your registered sensors to POST /api/sensors/ingest, the same way real hardware would.
//
//   INGEST_API_KEY=... node scripts/simulate-ingest.mjs [--url http://localhost:3000] [--backfill-days 30] [--every 60] [--spike]
//
//   --backfill-days N  first uploads N days of hourly history (so the Measured history chart has something to show)
//   --every S          then sends one reading per sensor every S seconds (default 60; 0 = send once and exit)
//   --spike            makes the new readings look like a pollution event, to see anomaly alerts fire (send a few ticks)
// Use it only against a test server: it writes invented values.
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1] ?? true; };
const base = String(opt("url", process.env.BASE_URL ?? "http://localhost:3000")).replace(/\/$/, ""); const key = process.env.INGEST_API_KEY;
const backfill = Number(opt("backfill-days", 0)); const every = Number(opt("every", 60)); const spike = args.includes("--spike");
if (!key) { console.error("Set INGEST_API_KEY."); process.exit(1); }
const BASE = { water_temperature: [14, 0.35], turbidity: [8, 1.2], ph: [7.6, 0.08], dissolved_oxygen: [9.2, 0.25], conductivity: [420, 12] };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const reading = (s, t, event) => ({ sensorId: s.id, at: new Date(t).toISOString(), values: Object.fromEntries(s.parameters.map((p) => {
  let v = BASE[p][0] + gauss() * BASE[p][1] + (p === "water_temperature" ? Math.sin(((t / 36e5) % 24) / 24 * 2 * Math.PI - 1.5) * 1.5 : 0);
  if (event && p === "turbidity") v += 45; if (event && p === "dissolved_oxygen") v -= 3.5; if (event && p === "ph") v -= 1.2;
  return [p, Math.round(v * 100) / 100]; })) });
async function post(readings) {
  for (let i = 0; i < readings.length; i += 500) {
    const res = await fetch(`${base}/api/sensors/ingest`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ readings: readings.slice(i, i + 500) }) });
    const b = await res.json().catch(() => ({})); if (!res.ok) { console.error(res.status, b); process.exit(1); } console.log(`sent ${Math.min(500, readings.length - i)} → stored ${b.stored}, rejected ${b.rejected}`);
  }
}
const sensors = await (await fetch(`${base}/api/sensors`)).json();
const live = sensors.filter((s) => s.status === "active"); if (!live.length) { console.error("No active sensors registered. Register one on /app/sensors first."); process.exit(1); }
if (backfill > 0) { const now = Date.now(), out = []; for (const s of live) for (let t = now - backfill * 864e5 + 36e5; t < now; t += 36e5) out.push(reading(s, t, false)); await post(out); }
const tick = async () => { const now = Date.now(); await post(live.map((s) => reading(s, now, spike))); };
await tick(); if (every > 0) setInterval(() => void tick().catch(console.error), every * 1000);
