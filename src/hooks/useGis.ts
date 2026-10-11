import { useQuery } from "@tanstack/react-query";
import type { FeatureCollection } from "geojson";

export type GisLayer = FeatureCollection & { attribution?: string };
/** Optional map layers from public/gis/*.geojson (built by `npm run data:gis`). A missing file just means "not installed". */
async function load(name: string): Promise<GisLayer | null> {
  try { const r = await fetch(`/gis/${name}`, { cache: "force-cache" }); if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return null; const g = (await r.json()) as GisLayer; return g.type === "FeatureCollection" && g.features?.length ? g : null; } catch { return null; }
}
export function useGis() {
  const rivers = useQuery({ queryKey: ["gis", "rivers"], queryFn: () => load("rivers.geojson"), staleTime: Infinity, retry: false });
  const watersheds = useQuery({ queryKey: ["gis", "watersheds"], queryFn: () => load("watersheds.geojson"), staleTime: Infinity, retry: false });
  return { rivers: rivers.data ?? null, watersheds: watersheds.data ?? null };
}
