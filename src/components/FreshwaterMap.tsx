"use client";

import dynamic from "next/dynamic";
import { useGis } from "@/hooks/useGis";
import { cx } from "./ui";

export { DEFAULT_LAYERS, GIS_LAYERS, LAYER_LABEL, type LayerKey } from "./mapLayers";

// Leaflet touches `window` on import, so the map is loaded on the client only.
const FreshwaterMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[200px] w-full animate-pulse bg-muted" aria-hidden />,
});
export default FreshwaterMap;

export function MapLegend({ className }: { className?: string }) {
  const row = "flex items-center gap-2"; const gis = useGis();
  return (
    <div className={cx("space-y-1.5 text-xs text-ink", className)}>
      <div className={row}><span className="grid size-4 place-items-center rounded-full rounded-br-none bg-primary text-[8px] text-white rotate-45" aria-hidden /> Citizen observation</div>
      <div className={row}><span className="grid size-4 place-items-center rounded-full rounded-br-none bg-success rotate-45" aria-hidden /> Expert-verified observation (check)</div>
      <div className={row}><span className="grid size-5 place-items-center rounded-full border-2 border-white bg-primary text-[10px] font-bold text-white shadow" aria-hidden>3</span> Several observations grouped — zoom in or click to expand</div>
      <div className={row}><span className="size-4 rounded-full border-[3px] border-white bg-info shadow" aria-hidden /> Monitoring site</div>
      <div className={row}><span className="size-4 rounded-full border-2 border-dashed border-warning" aria-hidden /> Monitoring priority (solid = high, dashed = medium, dotted = low)</div>
      <div className={row}><span className="size-4 rounded border-2 border-dashed border-[#6B4FA0] bg-[#6B4FA0]/10" aria-hidden /> Drainage group: sites linked by the model (not an official watershed)</div>
      <div className={row}><span className="h-0.5 w-4 border-t-2 border-dashed border-info" aria-hidden /> Modelled link between sites (a straight line, not a river course)</div>
      {gis.rivers && <div className={row}><span className="h-1 w-4 rounded bg-[#1D4E89]" aria-hidden /> Mapped river. {gis.rivers.attribution}</div>}
      {gis.watersheds && <div className={row}><span className="size-4 rounded border-2 border-[#1B7F5C] bg-[#1B7F5C]/10" aria-hidden /> Watershed boundary. {gis.watersheds.attribution}</div>}
    </div>
  );
}
