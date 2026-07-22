import React, { useState, useEffect, useRef } from "react";
import truLogo from "../../../tru_logo.png";
import {
  ComposableMap, Geographies, Geography, Marker, Line, ZoomableGroup,
} from "react-simple-maps";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";
import {
  X, Plus, Minus, RotateCcw, Play, Pause,
} from "lucide-react";

// ─── Simulation constants (from spec) ─────────────────────────────────────────

const SIM_ORDER_QUANTITY     = 1000;
const SIM_SAFETY_STOCK    = 100;                         // safety stock per region (baseline)
const SIM_LEAD_TIME    = 16;                          // lead time in hours
const SIM_DEMAND_MEAN     = 5;                           // average hourly demand per region
const SIM_DEMAND_MEANEMAND_STD_DEV   = 2;
const SIM_REORDER_POINT   = 200;                         // reorder point per region
const SIM_INITIAL_INVENTORY  = SIM_ORDER_QUANTITY + SIM_SAFETY_STOCK;             // = 1100
const SIM_INVENTORY_CAPACITY   = SIM_INITIAL_INVENTORY;                    // visual capacity = starting inventory (bar full at reset)
const SIM_TOTAL_HOURS = 2920;                        // 365 * 8

const WORLD_GEO        = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const CANADA_GEO       = "https://cdn.jsdelivr.net/gh/codeforamerica/click_that_hood@master/public/data/canada.geojson";
const US_GEO           = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const COUNTRY_LABELS: { name: string; coords: [number, number] }[] = [
  { name: "CANADA",        coords: [-115.0, 58.0] },
  { name: "UNITED STATES", coords: [-98.5,  39.0] },
  { name: "MEXICO",        coords: [-102.5, 24.0] },
  { name: "ALASKA",        coords: [-153.0, 64.5] },
];
const CENTRAL_HUB_COORDS: [number, number] = [-119.91, 50.28]; // S2 hub
const DC_S3_COORDS:       [number, number] = [-120.786, 50.111]; // S3 DC — Merritt, BC

// ─── Types ────────────────────────────────────────────────────────────────────

type ScenarioId = 1 | 2 | 3;

type InventoryItem = {
  category: string; sku: string; quantity: number;
  unit: string; status: "healthy" | "low" | "critical"; lastUpdated: string;
};

type StockMetrics = {
  current: number; reorderPoint: number; safetyStock: number;
  capacity: number; unit: string;
};

type LocationData = {
  id: string; name: string; coordinates: [number, number];
  color: string; lightColor: string; accent: string;
  address: string; warehouseSize: string; manager: string; phone: string;
  inventory: InventoryItem[]; totalSkus: number; totalValue: string;
  stock: StockMetrics; cardSide: "left" | "right";
};

type LocSimState = {
  inventory: number;
  orderDeliveryHour: number;
  replenishmentOrders: number;
  stockoutInstances: number;
  demandLost: number;
  totalDemand: number;
};

type SimStats = {
  demands: number[];
  stockoutInstances: number;
  replenishmentOrders: number;
  demandLost: number;
  totalDemand: number;
  demandServedFromDC: number;
};

// ─── Demand (generated once at module load, shared across all scenarios) ──────

function normalRandom(mean: number, std: number): number {
  const u1 = Math.random(), u2 = Math.random();
  const z  = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(mean + z * std));
}


// ─── Simulation step functions ────────────────────────────────────────────────

function createInitialLocationState(initialInventory = SIM_INITIAL_INVENTORY): LocSimState {
  return { inventory: initialInventory, orderDeliveryHour: 0, replenishmentOrders: 0, stockoutInstances: 0, demandLost: 0, totalDemand: 0 };
}

// Scenario 1: independent facilities
function stepIndependent(locationState: LocSimState, demand: number, hour: number, reorderPoint = SIM_REORDER_POINT, leadTime = SIM_LEAD_TIME): { next: LocSimState; newStockout: boolean } {
  let inventory = locationState.inventory, orderDeliveryHour = locationState.orderDeliveryHour;
  if (orderDeliveryHour > 0 && hour >= orderDeliveryHour) { inventory += SIM_ORDER_QUANTITY; orderDeliveryHour = 0; }
  let replenishmentOrders = locationState.replenishmentOrders;
  if (orderDeliveryHour === 0 && inventory > reorderPoint && inventory - demand <= reorderPoint) { orderDeliveryHour = hour + leadTime; replenishmentOrders++; }
  let stockouts = locationState.stockoutInstances; let newStockout = false;
  if (inventory >= 1 && inventory - demand <= 0) { stockouts++; newStockout = true; }
  let demandLost = locationState.demandLost;
  if (demand <= inventory) { inventory -= demand; } else { demandLost += demand - inventory; inventory = 0; }
  return { next: { inventory, orderDeliveryHour, replenishmentOrders, stockoutInstances: stockouts, demandLost, totalDemand: locationState.totalDemand + demand }, newStockout };
}

// Scenario 2: pooled (combined inventory at hub)
function stepPooled(locationState: LocSimState, region1Demand: number, region2Demand: number, hour: number): { next: LocSimState; newStockout: boolean } {
  const combinedDemand = region1Demand + region2Demand;
  const doubleOrderQuantity = SIM_ORDER_QUANTITY * 2, doubleReorderPoint = SIM_REORDER_POINT * 2;
  let inventory = locationState.inventory, orderDeliveryHour = locationState.orderDeliveryHour;
  if (orderDeliveryHour > 0 && hour >= orderDeliveryHour) { inventory += doubleOrderQuantity; orderDeliveryHour = 0; }
  let replenishmentOrders = locationState.replenishmentOrders;
  if (orderDeliveryHour === 0 && inventory > doubleReorderPoint && inventory - combinedDemand <= doubleReorderPoint) { orderDeliveryHour = hour + SIM_LEAD_TIME; replenishmentOrders++; }
  let stockouts = locationState.stockoutInstances; let newStockout = false;
  if (inventory >= 1 && inventory - combinedDemand <= 0) { stockouts++; newStockout = true; }
  let demandLost = locationState.demandLost;
  if (combinedDemand <= inventory) { inventory -= combinedDemand; } else { demandLost += combinedDemand - inventory; inventory = 0; }
  return { next: { inventory, orderDeliveryHour, replenishmentOrders, stockoutInstances: stockouts, demandLost, totalDemand: locationState.totalDemand + combinedDemand }, newStockout };
}

// Scenario 3: partial safety-stock centralisation
type Scenario3StepResult = {
  nextRegion1State: LocSimState; nextRegion2State: LocSimState;
  nextDistributionCenterInventory: number;
  demandServedFromDC1Delta: number; demandServedFromDC2Delta: number;
  newStockout: boolean;
};
function stepScenario3(
  region1State: LocSimState, region2State: LocSimState,
  distributionCenterInventoryLevel: number, region1Demand: number, region2Demand: number, hour: number,
  safetyStockRegion1: number, safetyStockRegion2: number,
): Scenario3StepResult {
  const reorderPointRegion1 = SIM_DEMAND_MEAN * SIM_LEAD_TIME + safetyStockRegion1;
  const reorderPointRegion2 = SIM_DEMAND_MEAN * SIM_LEAD_TIME + safetyStockRegion2;
  let inventory1 = region1State.inventory, orderDeliveryHour1 = region1State.orderDeliveryHour;
  let inventory2 = region2State.inventory, orderDeliveryHour2 = region2State.orderDeliveryHour;
  let dcInventoryLevel = distributionCenterInventoryLevel;

  if (orderDeliveryHour1 > 0 && hour >= orderDeliveryHour1) { inventory1 += SIM_ORDER_QUANTITY; orderDeliveryHour1 = 0; }
  if (orderDeliveryHour2 > 0 && hour >= orderDeliveryHour2) { inventory2 += SIM_ORDER_QUANTITY; orderDeliveryHour2 = 0; }

  let replenishmentOrders1 = region1State.replenishmentOrders, replenishmentOrders2 = region2State.replenishmentOrders;
  if (orderDeliveryHour1 === 0 && inventory1 > reorderPointRegion1 && inventory1 - region1Demand <= reorderPointRegion1) { orderDeliveryHour1 = hour + SIM_LEAD_TIME; replenishmentOrders1++; }
  if (orderDeliveryHour2 === 0 && inventory2 > reorderPointRegion2 && inventory2 - region2Demand <= reorderPointRegion2) { orderDeliveryHour2 = hour + SIM_LEAD_TIME; replenishmentOrders2++; }

  let stockoutCount1 = region1State.stockoutInstances, demandLost1 = region1State.demandLost;
  let stockoutCount2 = region2State.stockoutInstances, demandLost2 = region2State.demandLost;
  let demandServedFromDC1 = 0, demandServedFromDC2 = 0;
  let newStockout = false;

  // Region 1 fulfillment
  if (region1Demand <= inventory1) {
    inventory1 -= region1Demand;
  } else {
    const remainingDemand = region1Demand - inventory1; inventory1 = 0;
    if (dcInventoryLevel >= remainingDemand) { dcInventoryLevel -= remainingDemand; demandServedFromDC1 += remainingDemand; }
    else { demandServedFromDC1 += dcInventoryLevel; demandLost1 += remainingDemand - dcInventoryLevel; dcInventoryLevel = 0; stockoutCount1++; newStockout = true; }
  }

  // Region 2 fulfillment
  if (region2Demand <= inventory2) {
    inventory2 -= region2Demand;
  } else {
    const remainingDemand = region2Demand - inventory2; inventory2 = 0;
    if (dcInventoryLevel >= remainingDemand) { dcInventoryLevel -= remainingDemand; demandServedFromDC2 += remainingDemand; }
    else { demandServedFromDC2 += dcInventoryLevel; demandLost2 += remainingDemand - dcInventoryLevel; dcInventoryLevel = 0; stockoutCount2++; newStockout = true; }
  }

  return {
    nextRegion1State: { inventory: inventory1, orderDeliveryHour: orderDeliveryHour1, replenishmentOrders: replenishmentOrders1, stockoutInstances: stockoutCount1, demandLost: demandLost1, totalDemand: region1State.totalDemand + region1Demand },
    nextRegion2State: { inventory: inventory2, orderDeliveryHour: orderDeliveryHour2, replenishmentOrders: replenishmentOrders2, stockoutInstances: stockoutCount2, demandLost: demandLost2, totalDemand: region2State.totalDemand + region2Demand },
    nextDistributionCenterInventory: dcInventoryLevel, demandServedFromDC1Delta: demandServedFromDC1, demandServedFromDC2Delta: demandServedFromDC2, newStockout,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────���───────

function deriveItemStatus(qty: number, maxQty: number): "healthy" | "low" | "critical" {
  const proportion = qty / maxQty;
  if (proportion <= 0.1) return "critical";
  if (proportion <= 0.3) return "low";
  return "healthy";
}



function getCurrentTimeString() { return new Date().toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" }); }

function createEmptyStats(): SimStats {
  return { demands: [], stockoutInstances: 0, replenishmentOrders: 0, demandLost: 0, totalDemand: 0, demandServedFromDC: 0 };
}

function normalPDF(x: number, mean: number, standardDeviation: number) {
  return (1 / (standardDeviation * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / standardDeviation) ** 2);
}

function buildCurveData(demands: number[]) {
  if (demands.length < 2) return { mean: 0, standardDeviation: 0, points: [] as { demand: number; probability: number }[] };
  const mean = demands.reduce((a, b) => a + b, 0) / demands.length;
  const standardDeviation = Math.sqrt(demands.reduce((a, b) => a + (b - mean) ** 2, 0) / demands.length) || 1;
  const points = Array.from({ length: 81 }, (_, i) => {
    const x = (mean - 3.5 * standardDeviation) + (i / 80) * 7 * standardDeviation;
    return { demand: Math.round(x), probability: parseFloat(normalPDF(x, mean, standardDeviation).toFixed(6)) };
  });
  return { mean, standardDeviation, points };
}

// ─── Base location data ───────────────────────────────────────────────────────

const itemMaxQty: Record<string, number> = {};

const initialLocations: LocationData[] = [
  {
    id: "kamloops", name: "Kamloops",
    coordinates: [-120.3273, 50.6745],
    color: "#2563eb", lightColor: "#93c5fd", accent: "#dbeafe",
    address: "1250 Summit Drive, Kamloops, BC V2C 5R8",
    warehouseSize: "42,000 sq ft", manager: "Sandra Kowalski", phone: "(250) 374-8801",
    totalSkus: 847, totalValue: "$3.2M", cardSide: "left",
    stock: { current: SIM_INITIAL_INVENTORY, reorderPoint: SIM_REORDER_POINT, safetyStock: SIM_SAFETY_STOCK, capacity: SIM_INVENTORY_CAPACITY, unit: "units" },
    inventory: [
      { category: "Lumber & Wood Products",  sku: "LWP-001", quantity: 12400, unit: "board ft", status: "healthy",  lastUpdated: "Today, 9:14 AM" },
      { category: "Plumbing Supplies",       sku: "PLM-204", quantity: 380,   unit: "units",    status: "healthy",  lastUpdated: "Today, 8:50 AM" },
      { category: "Electrical Components",   sku: "ELC-088", quantity: 94,    unit: "units",    status: "low",      lastUpdated: "Yesterday, 4:30 PM" },
      { category: "HVAC Equipment",          sku: "HVC-312", quantity: 17,    unit: "units",    status: "healthy",  lastUpdated: "Today, 7:00 AM" },
      { category: "Concrete & Masonry",      sku: "CNM-055", quantity: 8200,  unit: "kg",       status: "healthy",  lastUpdated: "Today, 6:45 AM" },
      { category: "Safety Gear",             sku: "SFT-190", quantity: 23,    unit: "units",    status: "critical", lastUpdated: "2 days ago" },
      { category: "Hand Tools",              sku: "HTL-411", quantity: 610,   unit: "units",    status: "healthy",  lastUpdated: "Today, 10:02 AM" },
      { category: "Roofing Materials",       sku: "RFM-077", quantity: 1850,  unit: "sq ft",    status: "healthy",  lastUpdated: "Yesterday, 2:15 PM" },
    ],
  },
  {
    id: "kelowna", name: "Kelowna",
    coordinates: [-119.496, 49.888],
    color: "#16a34a", lightColor: "#86efac", accent: "#dcfce7",
    address: "885 Rutland Road N, Kelowna, BC V1X 3B6",
    warehouseSize: "31,500 sq ft", manager: "Mark Thiessen", phone: "(250) 765-4422",
    totalSkus: 614, totalValue: "$2.1M", cardSide: "right",
    stock: { current: SIM_INITIAL_INVENTORY, reorderPoint: SIM_REORDER_POINT, safetyStock: SIM_SAFETY_STOCK, capacity: SIM_INVENTORY_CAPACITY, unit: "units" },
    inventory: [
      { category: "Agricultural Supplies",  sku: "AGR-001", quantity: 6700, unit: "kg",       status: "healthy", lastUpdated: "Today, 8:30 AM" },
      { category: "Irrigation Systems",     sku: "IRR-088", quantity: 142,  unit: "units",    status: "healthy", lastUpdated: "Today, 9:00 AM" },
      { category: "Lumber & Wood Products", sku: "LWP-002", quantity: 8900, unit: "board ft", status: "low",     lastUpdated: "Yesterday, 5:00 PM" },
      { category: "Electrical Components",  sku: "ELC-091", quantity: 210,  unit: "units",    status: "healthy", lastUpdated: "Today, 7:45 AM" },
      { category: "Plumbing Supplies",      sku: "PLM-210", quantity: 55,   unit: "units",    status: "low",     lastUpdated: "Today, 6:20 AM" },
      { category: "Concrete & Masonry",     sku: "CNM-056", quantity: 4100, unit: "kg",       status: "healthy", lastUpdated: "Today, 8:00 AM" },
      { category: "Fertilizers & Soil",     sku: "FRT-033", quantity: 3200, unit: "kg",       status: "healthy", lastUpdated: "Yesterday, 3:00 PM" },
      { category: "Safety Gear",            sku: "SFT-195", quantity: 88,   unit: "units",    status: "healthy", lastUpdated: "Today, 9:30 AM" },
    ],
  },
];

initialLocations.forEach((loc) => loc.inventory.forEach((item) => { itemMaxQty[item.sku] = item.quantity; }));

function getScenario3Parameters(centralPct: number) {
  const safetyStockDistributionCenter = Math.round(2 * SIM_SAFETY_STOCK * centralPct / 100);
  const safetyStockPerRegion  = Math.round((2 * SIM_SAFETY_STOCK - safetyStockDistributionCenter) / 2);
  return { safetyStockDistributionCenter, safetyStockPerRegion, reorderPointPerRegion: SIM_DEMAND_MEAN * SIM_LEAD_TIME + safetyStockPerRegion, initialInventoryPerRegion: SIM_ORDER_QUANTITY + safetyStockPerRegion };
}

function getScenarioLocations(scenario: ScenarioId, centralPct = 50): LocationData[] {
  if (scenario === 2) {
    const hubStock: StockMetrics = {
      current: SIM_INITIAL_INVENTORY * 2, reorderPoint: SIM_REORDER_POINT * 2,
      safetyStock: SIM_SAFETY_STOCK * 2, capacity: SIM_INVENTORY_CAPACITY * 2, unit: "units",
    };
    return [
      { ...initialLocations[0], stock: hubStock, totalSkus: 1461, totalValue: "$5.3M", warehouseSize: "73,500 sq ft" },
      { ...initialLocations[1], stock: { current: 0, reorderPoint: 0, safetyStock: 0, capacity: 0, unit: "units" } },
    ];
  }
  if (scenario === 3) {
    const { safetyStockPerRegion, reorderPointPerRegion, initialInventoryPerRegion } = getScenario3Parameters(centralPct);
    return [
      { ...initialLocations[0], stock: { current: initialInventoryPerRegion, reorderPoint: reorderPointPerRegion, safetyStock: safetyStockPerRegion, capacity: SIM_INVENTORY_CAPACITY, unit: "units" } },
      { ...initialLocations[1], stock: { current: initialInventoryPerRegion, reorderPoint: reorderPointPerRegion, safetyStock: safetyStockPerRegion, capacity: SIM_INVENTORY_CAPACITY, unit: "units" } },
    ];
  }
  return initialLocations.map((loc) => ({ ...loc, stock: { ...loc.stock, current: SIM_INITIAL_INVENTORY } }));
}

// ─── Results Modal ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, alert = false, info = false }: { label: string; value: string; sub: string; alert?: boolean; info?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 border ${alert ? "bg-red-50 border-red-100" : info ? "bg-violet-50 border-violet-100" : "bg-slate-50 border-slate-100"}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${alert ? "text-red-400" : info ? "text-violet-400" : "text-slate-400"}`}>{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${alert ? "text-red-600" : info ? "text-violet-700" : "text-slate-800"}`}>{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

function ResultsModal({
  locations, results, isPooled, isScenario3, distributionCenterInitialInventory, onClose,
}: { locations: LocationData[]; results: Record<string, SimStats>; isPooled: boolean; isScenario3: boolean; distributionCenterInitialInventory: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Simulation Results</h2>
            <p className="text-xs text-slate-400 mt-0.5">Inventory demand analysis · BC Warehouse Network</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-8">
          {/* DC summary row for S3 */}
          {isScenario3 && (() => {
            const r1 = results["kamloops"] ?? createEmptyStats();
            const r2 = results["kelowna"]  ?? createEmptyStats();
            const totalDsfdc = r1.demandServedFromDC + r2.demandServedFromDC;
            return (
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full bg-violet-600 shrink-0" />
                  <h3 className="text-base font-bold text-slate-800">Distribution Centre (DC)</h3>
                  <span className="text-xs text-slate-400 ml-1">· emergency safety-stock buffer</span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <StatCard label="DC Safety Stock" value={`${distributionCenterInitialInventory} units`} sub="initial allocation" info />
                  <StatCard label="Served R1 from DC" value={`${r1.demandServedFromDC.toLocaleString()} units`} sub="Kamloops overflow" info />
                  <StatCard label="Served R2 from DC" value={`${r2.demandServedFromDC.toLocaleString()} units`} sub="Kelowna overflow" info />
                  <StatCard label="Total from DC" value={`${totalDsfdc.toLocaleString()} units`} sub="combined DC draws" info />
                </div>
              </div>
            );
          })()}

          {locations.map((loc, locationIndex) => {
            const stats = results[loc.id] ?? createEmptyStats();
            const { mean, standardDeviation, points } = buildCurveData(stats.demands);
            const fillRate = stats.totalDemand > 0 ? (1 - stats.demandLost / stats.totalDemand) * 100 : 100;
            const serviceLevel = stats.replenishmentOrders > 0 ? (1 - stats.stockoutInstances / stats.replenishmentOrders) * 100 : 100;
            const simulatedHours = stats.demands.length;

            return (
              <div key={loc.id}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: loc.color }} />
                  <h3 className="text-base font-bold text-slate-800">
                    {loc.name} {isPooled && locationIndex > 0 ? "Service Area" : "Warehouse"}
                  </h3>
                  <span className="text-xs text-slate-400 ml-1">· {simulatedHours} hours simulated</span>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Demand Distribution</p>
                    <p className="text-xs text-slate-500 mb-3">
                      μ = <span className="font-semibold text-slate-700">{mean.toFixed(2)}</span> &nbsp;·&nbsp;
                      σ = <span className="font-semibold text-slate-700">{standardDeviation.toFixed(2)}</span> units/hr
                    </p>
                    {points.length > 0 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id={`grad-${loc.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={loc.color} stopOpacity={0.25} />
                              <stop offset="95%" stopColor={loc.color} stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="demand" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={15} />
                          <YAxis hide />
                          <Tooltip
                            formatter={(v: number) => [v.toFixed(4), "Probability"]}
                            labelFormatter={(l) => `Demand: ${l} units/hr`}
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                          />
                          <ReferenceLine x={Math.round(mean)} stroke={loc.color} strokeWidth={1.5} strokeDasharray="4 3"
                            label={{ value: "μ", position: "top", fill: loc.color, fontSize: 10, fontWeight: 700 }} />
                          <Area type="monotone" dataKey="probability" stroke={loc.color} strokeWidth={2}
                            fill={`url(#grad-${loc.id})`} dot={false} activeDot={{ r: 3, fill: loc.color }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[160px] flex items-center justify-center text-xs text-slate-400">No data recorded</div>
                    )}
                  </div>

                  <div className="flex flex-col justify-center gap-2">
                    <div className="rounded-xl px-4 py-3 border" style={{ backgroundColor: loc.accent, borderColor: loc.lightColor }}>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: loc.color }}>Fill Rate</p>
                          <p className="text-2xl font-black mt-0.5" style={{ color: loc.color }}>{fillRate.toFixed(1)}%</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">1 − Lost / Total</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: loc.color }}>Service Level</p>
                          <p className="text-2xl font-black mt-0.5" style={{ color: loc.color }}>{serviceLevel.toFixed(1)}%</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">1 − Stockouts / Orders</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard label="Stockout Instances" value={stats.stockoutInstances.toString()} sub="positive→zero transitions" alert={stats.stockoutInstances > 0} />
                      <StatCard label="Replenishment Orders" value={stats.replenishmentOrders.toString()} sub="orders placed" />
                      <StatCard label="Total Demand Lost" value={`${stats.demandLost.toLocaleString()} units`} sub="unmet demand" alert={stats.demandLost > 0} />
                      {isScenario3
                        ? <StatCard label="Served from DC" value={`${stats.demandServedFromDC.toLocaleString()} units`} sub="via DC backup" info />
                        : <StatCard label="Total Demand" value={`${stats.totalDemand.toLocaleString()} units`} sub={`over ${simulatedHours} hours`} />
                      }
                    </div>
                  </div>
                </div>

                {locationIndex < locations.length - 1 && <div className="mt-6 border-t border-slate-100" />}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Inventory card SVG (reused for all scenarios) ────────────────────────────

function InventoryCard({ metrics, color, label, isCritical, stockouts, demandLost }: {
  metrics: StockMetrics; color: string; label: string; isCritical?: boolean;
  stockouts?: number; demandLost?: number;
}) {
  const cardWidth = 168, cardHeight = 142;
  const barViewWidth = 10, barViewHeight = 112, barPositionX = 6, barPositionY = 16;
  const fillPercentage       = metrics.capacity > 0 ? Math.min(metrics.current / metrics.capacity, 1) : 0;
  const reorderPointPercent  = metrics.capacity > 0 ? Math.min(metrics.reorderPoint / metrics.capacity, 1) : 0;
  const safetyStockPercent   = metrics.capacity > 0 ? Math.min(metrics.safetyStock  / metrics.capacity, 1) : 0;
  const fillColor = metrics.current <= metrics.safetyStock ? "#ef4444" : metrics.current <= metrics.reorderPoint ? "#f59e0b" : color;
  const reorderPointY = barViewHeight * (1 - reorderPointPercent);
  const safetyStockY  = barViewHeight * (1 - safetyStockPercent);
  // Ensure labels are at least 10px apart even when thresholds are close
  const minLabelGap = 10;
  const reorderPointLabelY = reorderPointY;
  const safetyStockLabelY  = safetyStockY - reorderPointY < minLabelGap ? reorderPointY + minLabelGap : safetyStockY;
  const stockoutCount = stockouts ?? 0;
  const demandLostCount = demandLost ?? 0;
  return (
    <g>
      <rect x={2} y={2} width={cardWidth} height={cardHeight} rx={7} fill="rgba(0,0,0,0.10)" />
      <rect width={cardWidth} height={cardHeight} rx={7} fill="white" stroke={isCritical ? "#ef4444" : color} strokeWidth={isCritical ? 2.5 : 1.5} strokeOpacity={isCritical ? 0.9 : 0.35} />
      <text x={28} y={16} fontSize={7.5} fontWeight="700" fill="#94a3b8" letterSpacing="0.08em" fontFamily="system-ui, sans-serif">{label}</text>
      <text x={28} y={33} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Current Level</text>
      <text x={cardWidth - 10} y={33} textAnchor="end" fontSize={9} fontWeight="700" fill={fillColor} fontFamily="system-ui, sans-serif">{metrics.current.toLocaleString()} {metrics.unit}</text>
      <line x1={28} y1={39} x2={cardWidth - 10} y2={39} stroke="#f1f5f9" strokeWidth={1} />
      <circle cx={31.5} cy={51} r={3.5} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
      <text x={38} y={55} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Reorder Point</text>
      <text x={cardWidth - 10} y={55} textAnchor="end" fontSize={9} fontWeight="600" fill="#d97706" fontFamily="system-ui, sans-serif">{metrics.reorderPoint.toLocaleString()} {metrics.unit}</text>
      <circle cx={31.5} cy={69} r={3.5} fill="#fee2e2" stroke="#ef4444" strokeWidth={1} />
      <text x={38} y={73} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Safety Stock</text>
      <text x={cardWidth - 10} y={73} textAnchor="end" fontSize={9} fontWeight="600" fill="#dc2626" fontFamily="system-ui, sans-serif">{metrics.safetyStock.toLocaleString()} {metrics.unit}</text>
      <line x1={28} y1={80} x2={cardWidth - 10} y2={80} stroke="#f1f5f9" strokeWidth={1} />
      <circle cx={31.5} cy={90} r={3.5} fill={stockoutCount > 0 ? "#fee2e2" : "#f8fafc"} stroke={stockoutCount > 0 ? "#ef4444" : "#cbd5e1"} strokeWidth={1} />
      <text x={38} y={94} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Stockouts</text>
      <text x={cardWidth - 10} y={94} textAnchor="end" fontSize={9} fontWeight="700" fill={stockoutCount > 0 ? "#dc2626" : "#94a3b8"} fontFamily="system-ui, sans-serif">{stockoutCount}</text>
      <circle cx={31.5} cy={108} r={3.5} fill={demandLostCount > 0 ? "#fef3c7" : "#f8fafc"} stroke={demandLostCount > 0 ? "#f59e0b" : "#cbd5e1"} strokeWidth={1} />
      <text x={38} y={112} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Demand Lost</text>
      <text x={cardWidth - 10} y={112} textAnchor="end" fontSize={9} fontWeight="700" fill={demandLostCount > 0 ? "#d97706" : "#94a3b8"} fontFamily="system-ui, sans-serif">{demandLostCount.toLocaleString()} {metrics.unit}</text>
      {/* Vertical inventory bar on left */}
      <g transform={`translate(${barPositionX}, ${barPositionY})`}>
        <rect width={barViewWidth} height={barViewHeight} rx={3} fill="#f1f5f9" />
        <rect x={0} y={barViewHeight * (1 - fillPercentage)} width={barViewWidth} height={barViewHeight * fillPercentage} rx={3} fill={fillColor} fillOpacity={0.8} />
        {/* ROP marker + label */}
        <line x1={-3} y1={reorderPointY} x2={barViewWidth + 3} y2={reorderPointY} stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" />
        <text x={barViewWidth + 5} y={reorderPointLabelY + 3} fontSize={7} fill="#d97706" fontWeight="700" fontFamily="system-ui, sans-serif">ROP</text>
        {/* SS marker + label (pushed down if too close to ROP) */}
        <line x1={-3} y1={safetyStockY} x2={barViewWidth + 3} y2={safetyStockY} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
        {safetyStockLabelY !== safetyStockY && <line x1={barViewWidth + 3} y1={safetyStockY} x2={barViewWidth + 3} y2={safetyStockLabelY} stroke="#ef4444" strokeWidth={0.75} strokeOpacity={0.5} />}
        <text x={barViewWidth + 5} y={safetyStockLabelY + 3} fontSize={7} fill="#dc2626" fontWeight="700" fontFamily="system-ui, sans-serif">SS</text>
      </g>
    </g>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BCMap() {
  const [activeScenario, setActiveScenario]     = useState<ScenarioId>(1);
  const [centralSafetyStockPercentage, setCentralSafetyStockPercentage]         = useState(50);   // S3 slider: % of SS at DC
  const [locations, setLocations]               = useState<LocationData[]>(getScenarioLocations(1));
  const [hovered, setHovered]                   = useState<string | null>(null);
  const [zoom, setZoom]                         = useState(1);
  const [center, setCenter]                     = useState<[number, number]>([-119.8, 50.35]);
  const [isPlaying, setIsPlaying]               = useState(false);
  const [showResults, setShowResults]           = useState(false);
  const [resultsData, setResultsData]           = useState<Record<string, SimStats>>({});
  const [currentHour, setCurrentHour]           = useState(0);
  const [speedMilliseconds, setSpeedMilliseconds]                   = useState(200);
  const [distributionCenterInventory, setDistributionCenterInventory]           = useState(0);   // S3 DC display

  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const simulationHourRef          = useRef(0);
  const simulationStateRef      = useRef<Record<string, LocSimState>>({});
  const simulationStatsRef         = useRef<Record<string, SimStats>>({});
  const distributionCenterInventoryRef         = useRef(0);
  const activeScenarioRef      = useRef<ScenarioId>(1);
  const centralPercentageRef    = useRef(50);
  const firstStockoutRef = useRef(false);
  const distributionCenterInitialRef     = useRef(0); // for results modal
  const demandArraysRef        = useRef({ r1: [] as number[], r2: [] as number[] });

  const initSim = (scenario: ScenarioId, pct: number) => {
    demandArraysRef.current = {
      r1: Array.from({ length: SIM_TOTAL_HOURS }, () => normalRandom(SIM_DEMAND_MEAN, SIM_DEMAND_MEANEMAND_STD_DEV)),
      r2: Array.from({ length: SIM_TOTAL_HOURS }, () => normalRandom(SIM_DEMAND_MEAN, SIM_DEMAND_MEANEMAND_STD_DEV)),
    };
    const { safetyStockDistributionCenter, safetyStockPerRegion, initialInventoryPerRegion } = getScenario3Parameters(pct);
    if (scenario === 2) {
      simulationStateRef.current = { kamloops: createInitialLocationState(SIM_INITIAL_INVENTORY * 2), kelowna: createInitialLocationState() };
      distributionCenterInventoryRef.current = 0;
    } else if (scenario === 3) {
      simulationStateRef.current = { kamloops: createInitialLocationState(initialInventoryPerRegion), kelowna: createInitialLocationState(initialInventoryPerRegion) };
      distributionCenterInventoryRef.current = safetyStockDistributionCenter;
      distributionCenterInitialRef.current = safetyStockDistributionCenter;
    } else {
      simulationStateRef.current = { kamloops: createInitialLocationState(), kelowna: createInitialLocationState() };
      distributionCenterInventoryRef.current = 0;
    }
    simulationStatsRef.current = {};
    simulationHourRef.current  = 0;
    firstStockoutRef.current = false;
  };

  const resetAll = (scenario: ScenarioId, pct = centralSafetyStockPercentage) => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    initSim(scenario, pct);
    setIsPlaying(false);
    setCurrentHour(0);
    setDistributionCenterInventory(distributionCenterInventoryRef.current);
    setLocations(getScenarioLocations(scenario, pct));
  };

  const handleScenarioChange = (s: ScenarioId) => {
    activeScenarioRef.current = s;
    setActiveScenario(s);
    resetAll(s);
  };

  const handleCentralPctChange = (pct: number) => {
    centralPercentageRef.current = pct;
    setCentralSafetyStockPercentage(pct);
    resetAll(3, pct);
  };

  // ── Simulation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }

    intervalRef.current = setInterval(() => {
      const simulationHour = simulationHourRef.current;
      const scenario       = activeScenarioRef.current;

      if (simulationHour >= SIM_TOTAL_HOURS) {
        clearInterval(intervalRef.current!); intervalRef.current = null;
        setIsPlaying(false);
        const captured = { ...simulationStatsRef.current };
        if (Object.values(captured).some((locationStats) => locationStats.demands.length > 0)) {
          setResultsData(captured); setShowResults(true);
        }
        return;
      }

      const region1Demand = demandArraysRef.current.r1[simulationHour];
      const region2Demand = demandArraysRef.current.r2[simulationHour];
      let anyNewStockout = false;

      // ── Scenario 2: pooled ────────────────────────────────────────────────
      if (scenario === 2) {
        const hub = simulationStateRef.current["kamloops"] ?? createInitialLocationState(SIM_INITIAL_INVENTORY * 2);
        const { next, newStockout } = stepPooled(hub, region1Demand, region2Demand, simulationHour);
        simulationStateRef.current["kamloops"] = next;
        if (!simulationStatsRef.current["kamloops"]) simulationStatsRef.current["kamloops"] = createEmptyStats();
        const locationStats = simulationStatsRef.current["kamloops"];
        locationStats.demands.push(region1Demand + region2Demand);
        locationStats.totalDemand = next.totalDemand; locationStats.demandLost = next.demandLost;
        locationStats.stockoutInstances = next.stockoutInstances; locationStats.replenishmentOrders = next.replenishmentOrders;
        if (newStockout) anyNewStockout = true;

        const hubCapacity = SIM_INVENTORY_CAPACITY * 2;
        const stockPercentage = hubCapacity > 0 ? next.inventory / hubCapacity : 0;
        setLocations((prev) => prev.map((loc, locationIndex) => {
          if (locationIndex !== 0) return loc;
          return {
            ...loc,
            stock: { ...loc.stock, current: next.inventory },
            inventory: loc.inventory.map((item) => {
              const maxQuantity = itemMaxQty[item.sku] ?? item.quantity;
              const quantity    = Math.max(0, Math.round(maxQuantity * stockPercentage * (0.85 + Math.random() * 0.3)));
              return { ...item, quantity, status: deriveItemStatus(quantity, maxQuantity), lastUpdated: `Today, ${getCurrentTimeString()}` };
            }),
          };
        }));

      // ── Scenario 3: partial SS centralisation ────────────────────────────
      } else if (scenario === 3) {
        const centralPercentage = centralPercentageRef.current;
        const { safetyStockPerRegion, reorderPointPerRegion } = getScenario3Parameters(centralPercentage);
        const region1State = simulationStateRef.current["kamloops"] ?? createInitialLocationState();
        const region2State = simulationStateRef.current["kelowna"]  ?? createInitialLocationState();
        const currentDCInventory = distributionCenterInventoryRef.current;

        const result = stepScenario3(region1State, region2State, currentDCInventory, region1Demand, region2Demand, simulationHour, safetyStockPerRegion, safetyStockPerRegion);
        simulationStateRef.current["kamloops"] = result.nextRegion1State;
        simulationStateRef.current["kelowna"]  = result.nextRegion2State;
        distributionCenterInventoryRef.current = result.nextDistributionCenterInventory;

        for (const [id, nextState, demand, demandFromDCDelta] of [
          ["kamloops", result.nextRegion1State, region1Demand, result.demandServedFromDC1Delta],
          ["kelowna",  result.nextRegion2State, region2Demand, result.demandServedFromDC2Delta],
        ] as [string, LocSimState, number, number][]) {
          if (!simulationStatsRef.current[id]) simulationStatsRef.current[id] = createEmptyStats();
          const locationStats = simulationStatsRef.current[id];
          locationStats.demands.push(demand);
          locationStats.totalDemand = nextState.totalDemand; locationStats.demandLost = nextState.demandLost;
          locationStats.stockoutInstances = nextState.stockoutInstances; locationStats.replenishmentOrders = nextState.replenishmentOrders;
          locationStats.demandServedFromDC += demandFromDCDelta;
        }

        if (result.newStockout) anyNewStockout = true;
        setDistributionCenterInventory(result.nextDistributionCenterInventory);
        setLocations((prev) => prev.map((loc) => {
          const nextState    = loc.id === "kamloops" ? result.nextRegion1State : result.nextRegion2State;
          const stockPercentage = SIM_INVENTORY_CAPACITY > 0 ? nextState.inventory / SIM_INVENTORY_CAPACITY : 0;
          return {
            ...loc,
            stock: { current: nextState.inventory, reorderPoint: reorderPointPerRegion, safetyStock: safetyStockPerRegion, capacity: SIM_INVENTORY_CAPACITY, unit: "units" },
            inventory: loc.inventory.map((item) => {
              const maxQuantity = itemMaxQty[item.sku] ?? item.quantity;
              const quantity    = Math.max(0, Math.round(maxQuantity * stockPercentage * (0.85 + Math.random() * 0.3)));
              return { ...item, quantity, status: deriveItemStatus(quantity, maxQuantity), lastUpdated: `Today, ${getCurrentTimeString()}` };
            }),
          };
        }));

      // ── Scenario 1 (& default): independent ──────────────────────────────
      } else {
        const updatedStates: Record<string, LocSimState> = {};
        for (const [id, demand] of [["kamloops", region1Demand], ["kelowna", region2Demand]] as [string, number][]) {
          const locationState = simulationStateRef.current[id] ?? createInitialLocationState();
          const { next, newStockout } = stepIndependent(locationState, demand, simulationHour, SIM_REORDER_POINT, 37);
          updatedStates[id] = next;
          simulationStateRef.current[id] = next;
          if (!simulationStatsRef.current[id]) simulationStatsRef.current[id] = createEmptyStats();
          const locationStats = simulationStatsRef.current[id];
          locationStats.demands.push(demand);
          locationStats.totalDemand = next.totalDemand; locationStats.demandLost = next.demandLost;
          locationStats.stockoutInstances = next.stockoutInstances; locationStats.replenishmentOrders = next.replenishmentOrders;
          if (newStockout) anyNewStockout = true;
        }
        setLocations((prev) => prev.map((loc) => {
          const nextState = updatedStates[loc.id]; if (!nextState) return loc;
          const stockPercentage = SIM_INVENTORY_CAPACITY > 0 ? nextState.inventory / SIM_INVENTORY_CAPACITY : 0;
          return {
            ...loc,
            stock: { ...loc.stock, current: nextState.inventory },
            inventory: loc.inventory.map((item) => {
              const maxQuantity = itemMaxQty[item.sku] ?? item.quantity;
              const quantity    = Math.max(0, Math.round(maxQuantity * stockPercentage * (0.85 + Math.random() * 0.3)));
              return { ...item, quantity, status: deriveItemStatus(quantity, maxQuantity), lastUpdated: `Today, ${getCurrentTimeString()}` };
            }),
          };
        }));
      }

      if (anyNewStockout) firstStockoutRef.current = true;

      simulationHourRef.current += 1;
      setCurrentHour(simulationHour + 1);
    }, speedMilliseconds);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, speedMilliseconds]);

  const handlePlayPause = () => {
    if (isPlaying) {
      const captured = { ...simulationStatsRef.current };
      if (Object.values(captured).some((s) => s.demands.length > 0)) {
        setResultsData(captured); setShowResults(true);
      }
      setIsPlaying(false);
    } else {
      if (simulationHourRef.current === 0) {
        initSim(activeScenario, centralSafetyStockPercentage);
        setLocations(getScenarioLocations(activeScenario, centralSafetyStockPercentage));
        setDistributionCenterInventory(distributionCenterInventoryRef.current);
      }
      setIsPlaying(true);
    }
  };

  const zoomIn    = () => setZoom((z) => Math.min(z * 1.5, 12));
  const zoomOut   = () => setZoom((z) => Math.max(z / 1.5, 0.15));
  const resetView = () => { setZoom(1); setCenter([-119.8, 50.35]); };

  const isPooled = activeScenario === 2;
  const isScenario3     = activeScenario === 3;
  const hourOfDay = currentHour % 8;


  return (
    <div className="relative w-full h-full bg-slate-100 overflow-hidden font-sans">

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header className="absolute top-0 left-0 right-0 z-20 h-20 flex items-center justify-between px-5 bg-white border-b border-slate-200 shadow-sm gap-3 relative">

        {/* Left */}
        <div className="flex items-center shrink-0">
          <img src={truLogo} alt="TRU Logo" className="h-[72px] w-auto shrink-0" />
        </div>

        {/* Center: scenario tabs — absolutely centered so it never shifts */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {([1, 2, 3] as ScenarioId[]).map((s) => {
            const info = {
              1: ["Scenario 1", "Decentralized"],
              2: ["Scenario 2", "Centralized"],
              3: ["Scenario 3", "Partial Pool"],
            } as const;
            const [label, sub] = info[s];
            const isActive = activeScenario === s;
            return (
              <button key={s} onClick={() => handleScenarioChange(s)}
                className={`flex flex-col items-center px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  isActive ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>{label}</span>
                <span className={`text-[10px] font-normal mt-0.5 ${isActive ? "text-slate-500" : "text-slate-400"}`}>{sub}</span>
              </button>
            );
          })}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Hour/Day counter */}
          {currentHour > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 shrink-0">
              <span className="font-semibold text-slate-700">Day {Math.floor(currentHour / 8) + 1}</span>
              <span className="text-slate-300">·</span>
              <span>Hr {hourOfDay + 1}</span>
              <span className="text-slate-300 mx-0.5">|</span>
              <span className="tabular-nums">{currentHour}/{SIM_TOTAL_HOURS}</span>
            </div>
          )}

          {/* S3: DC safety-stock split slider */}
          {isScenario3 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 shrink-0">
              <span className="text-[10px] text-violet-500 font-semibold uppercase">DC SS%</span>
              <input
                type="range" min={0} max={100} step={25} value={centralSafetyStockPercentage}
                onChange={(e) => handleCentralPctChange(Number(e.target.value))}
                className="w-20 h-1.5 accent-violet-600"
                title={`${centralSafetyStockPercentage}% of safety stock at DC`}
              />
              <span className="text-[10px] text-violet-700 font-bold w-8 text-left">{centralSafetyStockPercentage}%</span>
            </div>
          )}

          {/* Speed slider */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 shrink-0">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Speed</span>
            <input
              type="range" min={50} max={2000} step={50} value={speedMilliseconds}
              onChange={(e) => setSpeedMilliseconds(Number(e.target.value))}
              className="w-20 h-1.5 accent-slate-700" style={{ direction: "rtl" }}
              title={`${speedMilliseconds}ms per hour`}
            />
            <span className="text-[10px] text-slate-500 w-8 text-left">
              {speedMilliseconds <= 100 ? "Fast" : speedMilliseconds >= 1500 ? "Slow" : `${speedMilliseconds}`}
            </span>
          </div>

          {/* Play/Pause */}
          <button onClick={handlePlayPause}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
            style={{ borderColor: isPlaying ? "#dc2626" : "#2563eb", backgroundColor: isPlaying ? "#fee2e2" : "#dbeafe", color: isPlaying ? "#dc2626" : "#2563eb" }}
          >
            {isPlaying ? <><Pause className="w-3.5 h-3.5" />Pause</> : <><Play className="w-3.5 h-3.5" />Play</>}
          </button>

          {/* Reset */}
          <button onClick={() => resetAll(activeScenario)}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors"
            title="Reset simulation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>


      {/* ── Map ──────────────────────────────────────────────────────── */}
      <div className="absolute inset-0 top-20">
        <ComposableMap projection="geoMercator" projectionConfig={{ center: [-119.8, 50.35], scale: 4400 }} style={{ width: "100%", height: "100%" }}>
          <ZoomableGroup zoom={zoom} center={center} onMoveEnd={({ zoom: z, coordinates }) => { setZoom(z); setCenter(coordinates); }}>

            {/* World base layer */}
            <Geographies geography={WORLD_GEO}>
              {({ geographies }) => geographies.map((geo) => (
                <Geography key={geo.rsmKey} geography={geo} fill="#e8ecf0" stroke="#d0d7e0" strokeWidth={0.3}
                  style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
              ))}
            </Geographies>

            <Geographies geography={US_GEO}>
              {({ geographies }) => geographies.map((geo) => (
                <Geography key={geo.rsmKey} geography={geo} fill="#dde3ea" stroke="#c8d0da" strokeWidth={0.6}
                  style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
              ))}
            </Geographies>

            <Geographies geography={CANADA_GEO}>
              {({ geographies }) => geographies.map((geo) => {
                const isBC = geo.properties.name === "British Columbia";
                return (
                  <Geography key={geo.rsmKey} geography={geo}
                    fill={isBC ? "#bfdbfe" : "#dde3ea"} stroke={isBC ? "#60a5fa" : "#c8d0da"}
                    strokeWidth={isBC ? 1.2 : 0.6}
                    style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
                );
              })}
            </Geographies>

            {/* Country labels — rendered on top of geography fills */}
            {zoom < 1.5 && COUNTRY_LABELS.map(({ name, coords }) => (
              <Marker key={name} coordinates={coords}>
                <text textAnchor="middle" fill="#94a3b8"
                  fontSize={10 / zoom} fontFamily="system-ui, sans-serif"
                  fontWeight="700" letterSpacing="0.12em"
                  style={{ pointerEvents: "none", userSelect: "none" }}>
                  {name}
                </text>
              </Marker>
            ))}

            {/* ── Scenario 2: pooled central hub ─────────────────────── */}
            {isPooled && (
              <>
                <Line from={locations[0].coordinates} to={CENTRAL_HUB_COORDS} stroke="#0d9488" strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" />
                <Line from={locations[1].coordinates} to={CENTRAL_HUB_COORDS} stroke="#0d9488" strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" />
                {(() => {
                  const hub = locations[0]; const s = hub.stock;
                  const hasStockout = (simulationStatsRef.current["kamloops"]?.stockoutInstances ?? 0) > 0;
                  const W = 168, H = 142, pinR = 13;
                  const cardTop = -(H + 80); // above hub pin, clear of both city pins
                  return (
                    <Marker coordinates={CENTRAL_HUB_COORDS} style={{ cursor: "default" }}>
                      {/* vertical connector from pin top to card bottom */}
                      <line x1={0} y1={-pinR} x2={0} y2={cardTop + H}
                        stroke="#0d9488" strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 2"
                        style={{ pointerEvents: "none" }} />
                      {/* hub pin */}
                      <circle r={pinR} fill="white" stroke="#0d9488" strokeWidth={2.5} />
                      <circle r={5} fill="#0d9488" />
                      <text textAnchor="middle" y={pinR + 14} fill="#0d9488" fontSize={10} fontWeight="700"
                        fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>Hub</text>
                      {/* inventory card above pin */}
                      <g transform={`translate(${-W / 2}, ${cardTop})`} style={{ pointerEvents: "none" }}>
                        <InventoryCard metrics={s} color="#0d9488" label="CENTRAL HUB" isCritical={hasStockout}
                          stockouts={simulationStatsRef.current["kamloops"]?.stockoutInstances}
                          demandLost={simulationStatsRef.current["kamloops"]?.demandLost} />
                        {!hasStockout && (
                          <g>
                            <rect x={W - 46} y={5} width={38} height={14} rx={4} fill="#0d9488" fillOpacity={0.15} stroke="#0d9488" strokeWidth={1} strokeOpacity={0.4} />
                            <text x={W - 27} y={14.5} textAnchor="middle" fontSize={7} fontWeight="700" fill="#0d9488" fontFamily="system-ui, sans-serif">◎ HUB</text>
                          </g>
                        )}
                      </g>
                    </Marker>
                  );
                })()}
                {locations.map((loc) => {
                  const active = hovered === loc.id;
                  const pinR = active ? 18 : 13;
                  return (
                    <Marker key={loc.id} coordinates={loc.coordinates}
                      onMouseEnter={() => setHovered(loc.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: "default" }}>
                      {active && <circle r={30} fill={loc.color} fillOpacity={0.08} stroke={loc.color} strokeWidth={1} strokeOpacity={0.25} />}
                      <circle r={pinR} fill={loc.color} fillOpacity={0.15} transform="translate(1,1)" />
                      <circle r={pinR} fill="white" stroke={loc.color} strokeWidth={2.5} />
                      <circle r={5} fill={loc.color} />
                      <text textAnchor="middle" y={active ? 34 : 28} fill={loc.color} fontSize={11} fontWeight="700" fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>{loc.name}</text>
                    </Marker>
                  );
                })}
              </>
            )}

            {/* ── Scenario 3: partial SS centralisation ──────────────── */}
            {isScenario3 && (
              <>
                {/* Lines from forward facilities to DC (emergency route) */}
                <Line from={locations[0].coordinates} to={DC_S3_COORDS} stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
                <Line from={locations[1].coordinates} to={DC_S3_COORDS} stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
                {/* Direct supply line between warehouses */}
                <Line from={locations[0].coordinates} to={locations[1].coordinates} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" strokeLinecap="round" />

                {/* DC card — rendered below the pin */}
                {(() => {
                  const W = 160, H = 72;
                  const pinR = 10;
                  const gap  = 10;
                  const dcPct   = distributionCenterInitialRef.current > 0 ? distributionCenterInventory / distributionCenterInitialRef.current : 0;
                  const dcColor = distributionCenterInventory <= 0 ? "#ef4444" : distributionCenterInventory < distributionCenterInitialRef.current * 0.3 ? "#f59e0b" : "#7c3aed";
                  const barW = 132, barH = 9;
                  const cardTop = pinR + 55; // below pin, clearing the "DC" label
                  return (
                    <Marker coordinates={DC_S3_COORDS} style={{ cursor: "default" }}>
                      {/* connector line from pin bottom to card top */}
                      <line x1={0} y1={pinR} x2={0} y2={cardTop}
                        stroke="#7c3aed" strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 2"
                        style={{ pointerEvents: "none" }} />
                      {/* DC pin diamond */}
                      <g transform="rotate(45)">
                        <rect x={-7} y={-7} width={14} height={14} fill="white" stroke="#7c3aed" strokeWidth={2} rx={2} />
                      </g>
                      <circle r={4} fill="#7c3aed" />
                      <text textAnchor="middle" y={pinR + 12} fill="#7c3aed" fontSize={9} fontWeight="700"
                        fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>DC</text>
                      {/* card below pin */}
                      <g transform={`translate(${-W / 2}, ${cardTop})`} style={{ pointerEvents: "none" }}>
                        <rect x={2} y={2} width={W} height={H} rx={7} fill="rgba(0,0,0,0.10)" />
                        <rect width={W} height={H} rx={7} fill="white"
                          stroke={distributionCenterInventory <= 0 ? "#ef4444" : "#7c3aed"}
                          strokeWidth={distributionCenterInventory <= 0 ? 2 : 1.5}
                          strokeOpacity={distributionCenterInventory <= 0 ? 0.9 : 0.5} />
                        <rect width={4} height={H} rx={2} fill={distributionCenterInventory <= 0 ? "#ef4444" : "#7c3aed"} />
                        <text x={14} y={16} fontSize={7.5} fontWeight="700" fill="#94a3b8" letterSpacing="0.08em" fontFamily="system-ui, sans-serif">DISTRIBUTION CENTRE</text>
                        <text x={14} y={31} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Safety Stock Reserve</text>
                        <text x={W - 10} y={31} textAnchor="end" fontSize={9} fontWeight="700" fill={dcColor} fontFamily="system-ui, sans-serif">
                          {distributionCenterInventory.toLocaleString()} / {distributionCenterInitialRef.current} units
                        </text>
                        <g transform="translate(14, 42)">
                          <rect width={barW} height={barH} rx={4} fill="#f1f5f9" />
                          <rect width={Math.max(barW * dcPct, distributionCenterInventory > 0 ? barH : 0)} height={barH} rx={4} fill={dcColor} fillOpacity={0.75} />
                          <text x={barW / 2} y={barH + 13} textAnchor="middle" fontSize={7} fill="#7c3aed" fontWeight="600" fontFamily="system-ui, sans-serif">
                            {distributionCenterInventory <= 0 ? "DEPLETED" : `${Math.round(dcPct * 100)}% remaining`}
                          </text>
                        </g>
                      </g>
                    </Marker>
                  );
                })()}

                {/* Forward facility pins with inventory cards */}
                {locations.map((loc) => {
                  const active = hovered === loc.id;
                  const s = loc.stock;
                  const W = 168, H = 142;
                  const pinR = active ? 18 : 13;
                  const gap    = 14;
                  const extraLeft = loc.id === "kamloops" ? 40 : 0;
                  const cardX  = loc.cardSide === "left" ? -(pinR + gap + W + extraLeft) : pinR + gap;
                  const cardY  = -H / 2;
                  const connX1 = loc.cardSide === "left" ? -pinR : pinR;
                  const connX2 = loc.cardSide === "left" ? -(pinR + gap + extraLeft) : pinR + gap;
                  return (
                    <Marker key={loc.id} coordinates={loc.coordinates}
                      onMouseEnter={() => setHovered(loc.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: "default" }}>
                      <g transform={`translate(${cardX}, ${cardY})`} style={{ pointerEvents: "none" }}>
                        <InventoryCard metrics={s} color={loc.color} label="INVENTORY STATUS"
                          stockouts={simulationStatsRef.current[loc.id]?.stockoutInstances}
                          demandLost={simulationStatsRef.current[loc.id]?.demandLost} />
                      </g>
                      <line x1={connX1} y1={0} x2={connX2} y2={0} stroke={loc.color} strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 2" style={{ pointerEvents: "none" }} />
                      {active && <circle r={30} fill={loc.color} fillOpacity={0.08} stroke={loc.color} strokeWidth={1} strokeOpacity={0.25} />}
                      <circle r={pinR} fill={loc.color} fillOpacity={0.15} transform="translate(1,1)" />
                      <circle r={pinR} fill="white" stroke={loc.color} strokeWidth={2.5} />
                      <circle r={5} fill={loc.color} />
                      <text textAnchor="middle" y={active ? 34 : 28} fill={loc.color} fontSize={11} fontWeight="700" fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>{loc.name}</text>
                    </Marker>
                  );
                })}
              </>
            )}

            {/* ── Scenario 1: independent ─────────────────────────────── */}
            {!isPooled && !isScenario3 && (
              <>
                <Line from={locations[0].coordinates} to={locations[1].coordinates} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" strokeLinecap="round" />
                {locations.map((loc) => {
                  const active = hovered === loc.id;
                  const s = loc.stock;
                  const W = 168, H = 142;
                  const pinR = active ? 18 : 13;
                  const gap    = 14;
                  const cardX  = loc.cardSide === "left" ? -(pinR + gap + W) : pinR + gap;
                  const cardY  = -H / 2;
                  const connX1 = loc.cardSide === "left" ? -pinR : pinR;
                  const connX2 = loc.cardSide === "left" ? -(pinR + gap) : pinR + gap;
                  return (
                    <Marker key={loc.id} coordinates={loc.coordinates}
                      onMouseEnter={() => setHovered(loc.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: "default" }}>
                      <g transform={`translate(${cardX}, ${cardY})`} style={{ pointerEvents: "none" }}>
                        <InventoryCard metrics={s} color={loc.color} label="INVENTORY STATUS"
                          stockouts={simulationStatsRef.current[loc.id]?.stockoutInstances}
                          demandLost={simulationStatsRef.current[loc.id]?.demandLost} />
                      </g>
                      <line x1={connX1} y1={0} x2={connX2} y2={0} stroke={loc.color} strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 2" style={{ pointerEvents: "none" }} />
                      {active && <circle r={30} fill={loc.color} fillOpacity={0.08} stroke={loc.color} strokeWidth={1} strokeOpacity={0.25} />}
                      <circle r={pinR} fill={loc.color} fillOpacity={0.15} transform="translate(1,1)" />
                      <circle r={pinR} fill="white" stroke={loc.color} strokeWidth={2.5} />
                      <circle r={5} fill={loc.color} />
                      <text textAnchor="middle" y={active ? 34 : 28} fill={loc.color} fontSize={11} fontWeight="700" fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>{loc.name}</text>
                    </Marker>
                  );
                })}
              </>
            )}

          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* ── Zoom controls ─────────────────────────────────────────── */}
      <div className="absolute bottom-5 right-5 z-10 flex flex-col gap-1.5">
        <button onClick={zoomIn}    className="w-9 h-9 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors" title="Zoom in"><Plus className="w-4 h-4" /></button>
        <button onClick={zoomOut}   className="w-9 h-9 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors" title="Zoom out"><Minus className="w-4 h-4" /></button>
        <button onClick={resetView} className="w-9 h-9 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors" title="Reset view"><RotateCcw className="w-3.5 h-3.5" /></button>
      </div>


      {/* ── Results Modal ─────────────────────────────────────────── */}
      {showResults && (
        <ResultsModal
          locations={locations}
          results={resultsData}
          isPooled={isPooled}
          isScenario3={isScenario3}
          distributionCenterInitialInventory={distributionCenterInitialRef.current}
          onClose={() => setShowResults(false)}
        />
      )}
    </div>
  );
}
