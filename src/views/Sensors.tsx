"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { AlertTriangle, CheckCheck, Plus, Radio } from "lucide-react";
import { useSensorAlerts, useSensorReadings, useSensors, useSites, useUser } from "@/hooks/queries";
import { ALL_PARAMS, PARAMS, SENSOR_SOURCE, sensorsApi } from "@/services/sensors";
import { Badge, Button, Card, CardHeader, Chip, Dialog, EmptyState, ListSkeleton, Notice, PageHeader, inputCls, useToast } from "@/components/ui";
import type { Sensor, SensorParameter } from "@/types";
import { fmt, rel } from "@/utils/labels";

const STATUS_TONE = { active: "success", maintenance: "warning", offline: "neutral" } as const;

function SensorChart({ sensor }: { sensor: Sensor }) {
  const { data = [], isLoading, dataUpdatedAt } = useSensorReadings(sensor.id);
  const [param, setParam] = useState<SensorParameter>(sensor.parameters[0]);
  const p = sensor.parameters.includes(param) ? param : sensor.parameters[0];
  const c = PARAMS[p];
  const rows = data.map((r) => ({ t: format(new Date(r.at), "d MMM HH:mm"), v: r.values[p] ?? null }));
  const last = data[data.length - 1];
  return (
    <Card>
      <CardHeader title={sensor.name} sub={`${sensor.id} · last 48 hours · refreshes every 15 s${sensor.feed === "live" ? " · live" : " · simulated"}`} action={<Badge tone={STATUS_TONE[sensor.status]}>{sensor.status}</Badge>} />
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap gap-1.5">{sensor.parameters.map((x) => <Chip key={x} active={p === x} onClick={() => setParam(x)}>{PARAMS[x].label}</Chip>)}</div>
        {isLoading ? <ListSkeleton rows={3} /> : !data.length ? <EmptyState title="No readings" body={sensor.status !== "active" ? `This sensor is ${sensor.status}.` : "Nothing has been received from this sensor in the last 48 hours."} /> : (
          <>
            <p className="text-2xl font-bold text-navy tabular-nums">{last?.values[p]} <span className="text-sm font-medium text-ink-2">{c.unit}</span></p>
            <p className="-mt-2 text-xs text-ink-2">Latest reading {rel(last?.at)} · updated {dataUpdatedAt ? format(dataUpdatedAt, "HH:mm:ss") : "—"}</p>
            <div className="h-56" role="img" aria-label={`${c.label} over the last 48 hours`}>
              <ResponsiveContainer><LineChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid stroke="#DCE5E9" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#607480" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 11, fill: "#607480" }} width={44} domain={["auto", "auto"]} />
                <Tooltip />
                {c.max != null && <ReferenceLine y={c.max} stroke="#B3261E" strokeDasharray="4 4" label={{ value: "limit", fontSize: 10, fill: "#B3261E" }} />}
                {c.min != null && <ReferenceLine y={c.min} stroke="#B3261E" strokeDasharray="4 4" label={{ value: "limit", fontSize: 10, fill: "#B3261E" }} />}
                <Line dataKey="v" name={`${c.label} ${c.unit}`} stroke="#087F8C" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart></ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default function Sensors() {
  const { data: user } = useUser();
  const { data: sensors = [], isLoading } = useSensors();
  const { data: alerts = [] } = useSensorAlerts();
  const { data: sites = [] } = useSites();
  const [sel, setSel] = useState<string>();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [siteId, setSiteId] = useState(""); const [params, setParams] = useState<SensorParameter[]>(ALL_PARAMS);
  const qc = useQueryClient(); const toast = useToast();
  const canManage = !!user && user.role !== "citizen";
  const current = sensors.find((s) => s.id === sel) ?? sensors[0];
  const reg = useMutation({ mutationFn: () => sensorsApi.register({ name, siteId, parameters: params }), onSuccess: (s) => { qc.invalidateQueries(); setOpen(false); setName(""); setSel(s.id); toast("Sensor registered"); }, onError: (e: Error) => toast(e.message, "danger") });
  const status = useMutation({ mutationFn: (v: { id: string; s: Sensor["status"] }) => sensorsApi.setStatus(v.id, v.s), onSuccess: () => qc.invalidateQueries(), onError: (e: Error) => toast(e.message, "danger") });
  const ack = useMutation({ mutationFn: (id: string) => sensorsApi.acknowledge(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["sensor-alerts"] }), onError: (e: Error) => toast(e.message, "danger") });
  const open_ = alerts.filter((a) => !a.acknowledged);

  return (
    <>
      <PageHeader title="Sensors and Alerts" description="Registered sensors, their latest readings, and automatic checks for unusual values." actions={canManage ? <Button onClick={() => setOpen(true)}><Plus size={16} />Register sensor</Button> : undefined} />
      <div className="mb-5">{SENSOR_SOURCE === "server"
        ? <Notice tone="info" title="Live feed">Readings come from devices registered here and sent to the server. Alerts are automatic checks, not confirmed pollution events.</Notice>
        : <Notice tone="warning" title="Simulated feed">Readings here are generated so you can see how monitoring and alerts work, and the registry is saved in this browser only. Set NEXT_PUBLIC_SENSOR_SOURCE=server to use the live, server-stored registry and ingest API.</Notice>}</div>
      {isLoading ? <ListSkeleton rows={4} /> : (
        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <Card>
              <CardHeader title="Sensor registry" sub={`${sensors.length} registered`} />
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-line bg-muted/60 text-left text-xs font-semibold text-ink-2 uppercase"><tr><th className="px-5 py-2.5">Sensor</th><th className="px-3">Site</th><th className="px-3">Parameters</th><th className="px-3">Status</th><th className="px-5 text-right">Open alerts</th></tr></thead>
                <tbody className="divide-y divide-line">{sensors.map((s) => (
                  <tr key={s.id} className={current?.id === s.id ? "bg-primary-light/40" : "hover:bg-muted/40"}>
                    <td className="px-5 py-3"><button className="text-left font-semibold text-primary" onClick={() => setSel(s.id)}><Radio size={13} className="mr-1 inline" />{s.name}</button><p className="text-xs text-ink-2">{s.id} · registered {fmt(s.registeredAt)}</p></td>
                    <td className="px-3 text-ink-2">{sites.find((x) => x.id === s.siteId)?.name ?? "—"}</td>
                    <td className="px-3 text-xs text-ink-2">{s.parameters.map((p) => PARAMS[p].label).join(", ")}</td>
                    <td className="px-3">{canManage ? <select aria-label={`Status of ${s.name}`} className="h-8 rounded border border-line bg-surface px-1 text-sm" value={s.status} onChange={(e) => status.mutate({ id: s.id, s: e.target.value as Sensor["status"] })}><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="offline">Offline</option></select> : <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>}</td>
                    <td className="px-5 text-right tabular-nums">{open_.filter((a) => a.sensorId === s.id).length}</td>
                  </tr>))}</tbody>
              </table></div>
            </Card>
            {current && <SensorChart key={current.id} sensor={current} />}
          </div>
          <Card className="h-fit">
            <CardHeader title="Anomaly alerts" sub={`${open_.length} open · last 48 hours`} />
            {!alerts.length ? <EmptyState title="No unusual readings" body="Active sensors are within their usual ranges." /> : (
              <ul className="divide-y divide-line">{alerts.slice(0, 20).map((a) => (
                <li key={a.id} className={`p-4 text-sm ${a.acknowledged ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-2"><AlertTriangle size={16} className={a.severity === "high" ? "mt-0.5 text-danger" : "mt-0.5 text-warning"} />
                    <div className="min-w-0 flex-1"><p className="font-semibold">{a.sensorName}{a.kind === "no_data" ? "" : ` · ${PARAMS[a.parameter].label}`}</p><p className="text-ink">{a.message}</p><p className="mt-0.5 text-xs text-ink-2">{fmt(a.at)} · {a.severity === "high" ? "High" : "Watch"} · automatic check, not a confirmed pollution event</p></div>
                    {canManage && !a.acknowledged && <Button size="sm" variant="ghost" onClick={() => ack.mutate(a.id)} aria-label="Acknowledge alert"><CheckCheck size={14} /></Button>}
                  </div>
                </li>))}</ul>
            )}
            <p className="border-t border-line px-4 py-3 text-xs text-ink-2">Checks: values outside usual limits, and sudden jumps compared with the previous six hours. Alerts are prompts to look closer, not findings.</p>
          </Card>
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Register a sensor" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => reg.mutate()} disabled={reg.isPending}>Register</Button></>}>
        <label htmlFor="sn" className="mb-1.5 block font-medium">Name</label>
        <input id="sn" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bridge probe 2" />
        <label htmlFor="ss" className="mt-3 mb-1.5 block font-medium">Monitoring site (optional)</label>
        <select id="ss" className={inputCls} value={siteId} onChange={(e) => setSiteId(e.target.value)}><option value="">None</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.city}</option>)}</select>
        <fieldset className="mt-3"><legend className="mb-1.5 font-medium">Parameters</legend><div className="flex flex-wrap gap-1.5">{ALL_PARAMS.map((p) => <Chip key={p} active={params.includes(p)} onClick={() => setParams(params.includes(p) ? params.filter((x) => x !== p) : [...params, p])}>{PARAMS[p].label}</Chip>)}</div></fieldset>
      </Dialog>
    </>
  );
}
