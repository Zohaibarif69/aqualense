"use client";

import { AlertTriangle, CloudRain, Droplets, Info, Waves, Leaf, Fish, Activity, ShieldAlert } from "lucide-react";
import type { EnvironmentalIndicator } from "@/types";
import { fmt, fmtDate } from "@/utils/labels";
import { Badge, Card, cx } from "./ui";

const ICON: Record<string, typeof Info> = { "Weather context": CloudRain, "Hydrological conditions": Waves, "Conditions associated with algal growth": Leaf, "Potential pollution-pulse context": Activity, "Relative dilution context": Droplets, "Aquatic-life stress screening": Fish, "Short-term hazard screening": ShieldAlert };
const STATUS = { available: ["Available", "success"], stale: ["Stale", "warning"], missing: ["Not connected", "neutral"], error: ["Error", "danger"] } as const;

export function EnvironmentalIndicatorCard({ i }: { i: EnvironmentalIndicator }) {
  const I = ICON[i.name] ?? Info;
  const [label, tone] = STATUS[i.dataStatus];
  const unavailable = i.dataStatus === "missing" || i.dataStatus === "error";
  return (
    <Card className={cx("flex flex-col p-5", unavailable && "bg-muted/40")}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-lg bg-info-light text-info"><I size={18} aria-hidden /></span>
        <div className="flex flex-wrap justify-end gap-1"><Badge tone={i.kind === "forecast" ? "info" : "neutral"}>{i.kind === "forecast" ? "Forecast / screening" : "Observed / modelled"}</Badge><Badge tone={tone}>{label}</Badge></div>
      </div>
      <h3 className="font-semibold text-navy">{i.name}</h3>
      <p className="mt-1 text-sm text-ink-2">{i.description}</p>
      <div className="my-4">
        {unavailable ? <p className="text-sm font-medium text-neutral">Data unavailable</p> : (
          <>
            {i.level && <p className="text-lg font-semibold text-ink">{i.level}</p>}
            {i.value != null && <p className="text-sm text-ink-2 tabular-nums">{i.value} {i.unit}</p>}
          </>
        )}
      </div>
      <dl className="mt-auto space-y-1 border-t border-line pt-3 text-xs text-ink-2">
        {i.observedAt && <div><dt className="inline">Data time: </dt><dd className="inline text-ink">{fmt(i.observedAt)}</dd></div>}
        {i.issuedAt && <div><dt className="inline">Issued: </dt><dd className="inline text-ink">{fmt(i.issuedAt)}</dd></div>}
        {i.validFrom && <div><dt className="inline">Valid: </dt><dd className="inline text-ink">{fmtDate(i.validFrom)} – {fmtDate(i.validTo)}</dd></div>}
        <div><dt className="inline">Source: </dt><dd className="inline text-ink">{i.source ?? "—"}</dd></div>
        {i.limitations?.length ? <div className="pt-1"><dt className="sr-only">Limitations</dt><dd className="flex gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-warning" aria-hidden />{i.limitations.join(" ")}</dd></div> : null}
      </dl>
    </Card>
  );
}

export function ModelLimitationsNotice() {
  return (
    <div className="flex gap-3 rounded-xl border border-info/20 bg-info-light p-4 text-sm text-ink">
      <Info size={18} className="mt-0.5 shrink-0 text-info" aria-hidden />
      <p><strong>Screening indicators, not diagnoses.</strong> These model outputs describe environmental context in which conditions may be more or less likely. They do not confirm pollution, blooms, or ecological harm, and are kept separate from citizen reports and AI image screening. Level definitions and thresholds will be provided by the environmental-model integration.</p>
    </div>
  );
}
