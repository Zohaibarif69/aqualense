export type LayerKey = "sites" | "observations" | "verified" | "priority" | "river" | "drainage" | "gisRivers" | "gisWatersheds";
export const LAYER_LABEL: Record<LayerKey, string> = { sites: "Monitoring sites", observations: "Citizen observations", verified: "Expert-verified observations", priority: "Monitoring priority", river: "Modelled links between sites", drainage: "Drainage groups (modelled)", gisRivers: "Mapped rivers (GIS)", gisWatersheds: "Watershed boundaries (GIS)" };
/** Layers that only exist when their GIS file is installed in public/gis. */
export const GIS_LAYERS: LayerKey[] = ["gisRivers", "gisWatersheds"];
export const DEFAULT_LAYERS: Record<LayerKey, boolean> = { sites: true, observations: true, verified: true, priority: false, river: true, drainage: false, gisRivers: true, gisWatersheds: true };
