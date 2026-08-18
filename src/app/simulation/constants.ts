export const SIM_ORDER_QUANTITY    = 17000;
export const SIM_SAFETY_STOCK      = 165;   // safety stock per region (baseline)
export const SIM_LEAD_TIME         = 16;    // lead time in hours
export const SIM_DEMAND_MEAN       = 500;     // average hourly demand per region
export const SIM_DEMAND_STD_DEV    = 25;     // std deviation of hourly demand
export const SIM_REORDER_POINT     = 8000;   // reorder point per region
export const SIM_INITIAL_INVENTORY = SIM_ORDER_QUANTITY + SIM_SAFETY_STOCK; // = 1100
export const SIM_INVENTORY_CAPACITY = SIM_INITIAL_INVENTORY; // visual capacity = starting inventory
export const SIM_TOTAL_HOURS       = 2920;  // 365 * 8

export const WORLD_GEO   = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
export const CANADA_GEO  = "https://cdn.jsdelivr.net/gh/codeforamerica/click_that_hood@master/public/data/canada.geojson";
export const US_GEO      = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

export const COUNTRY_LABELS: { name: string; coords: [number, number] }[] = [
  { name: "CANADA",        coords: [-115.0, 58.0] },
  { name: "UNITED STATES", coords: [-98.5,  39.0] },
  { name: "MEXICO",        coords: [-102.5, 24.0] },
  { name: "ALASKA",        coords: [-153.0, 64.5] },
];

export const CENTRAL_HUB_COORDS: [number, number] = [-119.91, 50.28]; // S2 hub
export const DC_S3_COORDS:       [number, number] = [-120.786, 50.111]; // S3 DC — Merritt, BC
