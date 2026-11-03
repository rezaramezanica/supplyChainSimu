import { jStat } from "jstat";

export const SIM_ORDER_QUANTITY = 20000;
export const SIM_LEAD_TIME     = 16;      // hours
export const SIM_DEMAND_MEAN   = 500;     // average hourly demand per region
export const SIM_DEMAND_STD_DEV = 150;     // std deviation of hourly demand
export const SIM_TOTAL_HOURS   = 2920;    // 365 days × 8 hours/day
export const SIM_ALPHA         = 0.9;    // desired service level (single-tail)
export const SIM_USE_FIXED_DEMANDS = true; // true = reproducible (JSON), false = random each run

export const SIM_Z = jStat.normal.inv(SIM_ALPHA, 0, 1); // Z-score from α (single-tail inverse normal)
export const SIM_SAFETY_STOCK = Math.max(0, Math.round(SIM_Z * SIM_DEMAND_STD_DEV * Math.sqrt(SIM_LEAD_TIME))); 
export const SIM_REORDER_POINT = SIM_DEMAND_MEAN * SIM_LEAD_TIME + SIM_SAFETY_STOCK;
export const SIM_INITIAL_INVENTORY  = SIM_ORDER_QUANTITY + SIM_SAFETY_STOCK;
export const SIM_INVENTORY_CAPACITY = SIM_INITIAL_INVENTORY;

export { default as WORLD_GEO }  from "../../assets/geo/countries-110m.json";
export { default as CANADA_GEO } from "../../assets/geo/canada.json";
export { default as US_GEO }     from "../../assets/geo/states-10m.json";

export const COUNTRY_LABELS: { name: string; coords: [number, number] }[] = [
  { name: "CANADA",        coords: [-115.0, 58.0] },
  { name: "UNITED STATES", coords: [-98.5,  39.0] },
  { name: "MEXICO",        coords: [-102.5, 24.0] },
  { name: "ALASKA",        coords: [-153.0, 64.5] },
];

export const CENTRAL_HUB_COORDS: [number, number] = [-119.91, 50.28]; // S2 hub
export const DC_S3_COORDS:       [number, number] = [-120.786, 50.111]; // S3 DC — Merritt, BC
