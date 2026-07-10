import React, { useState, useEffect, useRef } from "react";
import {
  ComposableMap, Geographies, Geography, Marker, Line, ZoomableGroup,
} from "react-simple-maps";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";
import {
  Package, MapPin, X, TrendingUp, AlertCircle, CheckCircle,
  Warehouse, Plus, Minus, RotateCcw, Play, Pause, AlertTriangle,
} from "lucide-react";

// ─── Simulation constants (from spec) ─────────────────────────────────────────

const SIM_Q     = 1000;
const SIM_SS    = 50;                          // safety stock per region (baseline)
const SIM_LT    = 16;                          // lead time in hours
const SIM_D     = 5;                           // average hourly demand per region
const SIM_STD   = 2;
const SIM_ROP   = 200;                         // reorder point per region
const SIM_INIT  = SIM_Q + SIM_SS;             // = 1100
const SIM_CAP   = SIM_Q * 3;                  // visual capacity bar
const SIM_HOURS = 2920;                        // 365 * 8

const CANADA_GEO       = "https://cdn.jsdelivr.net/gh/codeforamerica/click_that_hood@master/public/data/canada.geojson";
const US_GEO           = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const CENTRAL_HUB_COORDS: [number, number] = [-119.91, 50.28]; // S2 hub
const DC_S3_COORDS:       [number, number] = [-119.91, 50.28]; // S3 DC (same midpoint, different scenario)

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

const SHARED_DEMAND = {
  r1: Array.from({ length: SIM_HOURS }, () => normalRandom(SIM_D, SIM_STD)),
  r2: Array.from({ length: SIM_HOURS }, () => normalRandom(SIM_D, SIM_STD)),
};

// ─── Simulation step functions ────────────────────────────────────────────────

function initLocState(initInv = SIM_INIT): LocSimState {
  return { inventory: initInv, orderDeliveryHour: 0, replenishmentOrders: 0, stockoutInstances: 0, demandLost: 0, totalDemand: 0 };
}

// Scenario 1: independent facilities
function stepIndep(s: LocSimState, demand: number, h: number): { next: LocSimState; newStockout: boolean } {
  let inv = s.inventory, orderHour = s.orderDeliveryHour;
  if (orderHour > 0 && h >= orderHour) { inv += SIM_Q; orderHour = 0; }
  let repOrders = s.replenishmentOrders;
  if (orderHour === 0 && inv > SIM_ROP && inv - demand <= SIM_ROP) { orderHour = h + SIM_LT; repOrders++; }
  let stockouts = s.stockoutInstances; let newStockout = false;
  if (inv >= 1 && inv - demand <= 0) { stockouts++; newStockout = true; }
  let demandLost = s.demandLost;
  if (demand <= inv) { inv -= demand; } else { demandLost += demand - inv; inv = 0; }
  return { next: { inventory: inv, orderDeliveryHour: orderHour, replenishmentOrders: repOrders, stockoutInstances: stockouts, demandLost, totalDemand: s.totalDemand + demand }, newStockout };
}

// Scenario 2: pooled (combined inventory at hub)
function stepPooled(s: LocSimState, demandR1: number, demandR2: number, h: number): { next: LocSimState; newStockout: boolean } {
  const combinedDemand = demandR1 + demandR2;
  const Q2 = SIM_Q * 2, ROP2 = SIM_ROP * 2;
  let inv = s.inventory, orderHour = s.orderDeliveryHour;
  if (orderHour > 0 && h >= orderHour) { inv += Q2; orderHour = 0; }
  let repOrders = s.replenishmentOrders;
  if (orderHour === 0 && inv > ROP2 && inv - combinedDemand <= ROP2) { orderHour = h + SIM_LT; repOrders++; }
  let stockouts = s.stockoutInstances; let newStockout = false;
  if (inv >= 1 && inv - combinedDemand <= 0) { stockouts++; newStockout = true; }
  let demandLost = s.demandLost;
  if (combinedDemand <= inv) { inv -= combinedDemand; } else { demandLost += combinedDemand - inv; inv = 0; }
  return { next: { inventory: inv, orderDeliveryHour: orderHour, replenishmentOrders: repOrders, stockoutInstances: stockouts, demandLost, totalDemand: s.totalDemand + combinedDemand }, newStockout };
}

// Scenario 3: partial safety-stock centralisation
type S3Result = {
  nextR1: LocSimState; nextR2: LocSimState;
  nextDcInv: number;
  dsfdc1Delta: number; dsfdc2Delta: number;
  newStockout: boolean;
};
function stepS3(
  r1: LocSimState, r2: LocSimState,
  dcInv: number, r1d: number, r2d: number, h: number,
  ssR1: number, ssR2: number,
): S3Result {
  const ropR1 = SIM_D * SIM_LT + ssR1;
  const ropR2 = SIM_D * SIM_LT + ssR2;
  let inv1 = r1.inventory, oh1 = r1.orderDeliveryHour;
  let inv2 = r2.inventory, oh2 = r2.orderDeliveryHour;
  let dc   = dcInv;

  if (oh1 > 0 && h >= oh1) { inv1 += SIM_Q; oh1 = 0; }
  if (oh2 > 0 && h >= oh2) { inv2 += SIM_Q; oh2 = 0; }

  let rep1 = r1.replenishmentOrders, rep2 = r2.replenishmentOrders;
  if (oh1 === 0 && inv1 > ropR1 && inv1 - r1d <= ropR1) { oh1 = h + SIM_LT; rep1++; }
  if (oh2 === 0 && inv2 > ropR2 && inv2 - r2d <= ropR2) { oh2 = h + SIM_LT; rep2++; }

  let so1 = r1.stockoutInstances, dl1 = r1.demandLost;
  let so2 = r2.stockoutInstances, dl2 = r2.demandLost;
  let dsfdc1 = 0, dsfdc2 = 0;
  let newStockout = false;

  // Region 1 fulfillment
  if (r1d <= inv1) {
    inv1 -= r1d;
  } else {
    const rem = r1d - inv1; inv1 = 0;
    if (dc >= rem) { dc -= rem; dsfdc1 += rem; }
    else { dsfdc1 += dc; dl1 += rem - dc; dc = 0; so1++; newStockout = true; }
  }

  // Region 2 fulfillment
  if (r2d <= inv2) {
    inv2 -= r2d;
  } else {
    const rem = r2d - inv2; inv2 = 0;
    if (dc >= rem) { dc -= rem; dsfdc2 += rem; }
    else { dsfdc2 += dc; dl2 += rem - dc; dc = 0; so2++; newStockout = true; }
  }

  return {
    nextR1: { inventory: inv1, orderDeliveryHour: oh1, replenishmentOrders: rep1, stockoutInstances: so1, demandLost: dl1, totalDemand: r1.totalDemand + r1d },
    nextR2: { inventory: inv2, orderDeliveryHour: oh2, replenishmentOrders: rep2, stockoutInstances: so2, demandLost: dl2, totalDemand: r2.totalDemand + r2d },
    nextDcInv: dc, dsfdc1Delta: dsfdc1, dsfdc2Delta: dsfdc2, newStockout,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────���───────

function deriveItemStatus(qty: number, maxQty: number): "healthy" | "low" | "critical" {
  const p = qty / maxQty;
  if (p <= 0.1) return "critical";
  if (p <= 0.3) return "low";
  return "healthy";
}

const statusConfig = {
  healthy:  { color: "text-green-600", bg: "bg-green-50",  border: "border-green-100",  label: "Healthy",   dot: "bg-green-500" },
  low:      { color: "text-amber-600", bg: "bg-amber-50",  border: "border-amber-100",  label: "Low Stock", dot: "bg-amber-500" },
  critical: { color: "text-red-600",   bg: "bg-red-50",    border: "border-red-100",    label: "Critical",  dot: "bg-red-500" },
};

function counts(loc: LocationData) {
  return {
    healthy:  loc.inventory.filter((i) => i.status === "healthy").length,
    low:      loc.inventory.filter((i) => i.status === "low").length,
    critical: loc.inventory.filter((i) => i.status === "critical").length,
  };
}

function nowStr() { return new Date().toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" }); }

function emptyStats(): SimStats {
  return { demands: [], stockoutInstances: 0, replenishmentOrders: 0, demandLost: 0, totalDemand: 0, demandServedFromDC: 0 };
}

function normalPDF(x: number, mean: number, std: number) {
  return (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / std) ** 2);
}

function buildCurveData(demands: number[]) {
  if (demands.length < 2) return { mean: 0, std: 0, points: [] as { demand: number; probability: number }[] };
  const mean = demands.reduce((a, b) => a + b, 0) / demands.length;
  const std  = Math.sqrt(demands.reduce((a, b) => a + (b - mean) ** 2, 0) / demands.length) || 1;
  const points = Array.from({ length: 81 }, (_, i) => {
    const x = (mean - 3.5 * std) + (i / 80) * 7 * std;
    return { demand: Math.round(x), probability: parseFloat(normalPDF(x, mean, std).toFixed(6)) };
  });
  return { mean, std, points };
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
    stock: { current: SIM_INIT, reorderPoint: SIM_ROP, safetyStock: SIM_SS, capacity: SIM_CAP, unit: "units" },
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
    stock: { current: SIM_INIT, reorderPoint: SIM_ROP, safetyStock: SIM_SS, capacity: SIM_CAP, unit: "units" },
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

function s3Params(centralPct: number) {
  const ssDC = Math.round(2 * SIM_SS * centralPct / 100);
  const ssR  = Math.round((2 * SIM_SS - ssDC) / 2);
  return { ssDC, ssR, ropR: SIM_D * SIM_LT + ssR, initR: SIM_Q + ssR };
}

function getScenarioLocations(scenario: ScenarioId, centralPct = 50): LocationData[] {
  if (scenario === 2) {
    const hubStock: StockMetrics = {
      current: SIM_INIT * 2, reorderPoint: SIM_ROP * 2,
      safetyStock: SIM_SS * 2, capacity: SIM_CAP * 2, unit: "units",
    };
    return [
      { ...initialLocations[0], stock: hubStock, totalSkus: 1461, totalValue: "$5.3M", warehouseSize: "73,500 sq ft" },
      { ...initialLocations[1], stock: { current: 0, reorderPoint: 0, safetyStock: 0, capacity: 0, unit: "units" } },
    ];
  }
  if (scenario === 3) {
    const { ssR, ropR, initR } = s3Params(centralPct);
    return [
      { ...initialLocations[0], stock: { current: initR, reorderPoint: ropR, safetyStock: ssR, capacity: SIM_CAP, unit: "units" } },
      { ...initialLocations[1], stock: { current: initR, reorderPoint: ropR, safetyStock: ssR, capacity: SIM_CAP, unit: "units" } },
    ];
  }
  return initialLocations.map((loc) => ({ ...loc, stock: { ...loc.stock, current: SIM_INIT } }));
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
  locations, results, isPooled, isS3, dcInitial, onClose,
}: { locations: LocationData[]; results: Record<string, SimStats>; isPooled: boolean; isS3: boolean; dcInitial: number; onClose: () => void }) {
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
          {isS3 && (() => {
            const r1 = results["kamloops"] ?? emptyStats();
            const r2 = results["kelowna"]  ?? emptyStats();
            const totalDsfdc = r1.demandServedFromDC + r2.demandServedFromDC;
            return (
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full bg-violet-600 shrink-0" />
                  <h3 className="text-base font-bold text-slate-800">Distribution Centre (DC)</h3>
                  <span className="text-xs text-slate-400 ml-1">· emergency safety-stock buffer</span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <StatCard label="DC Safety Stock" value={`${dcInitial} units`} sub="initial allocation" info />
                  <StatCard label="Served R1 from DC" value={`${r1.demandServedFromDC.toLocaleString()} units`} sub="Kamloops overflow" info />
                  <StatCard label="Served R2 from DC" value={`${r2.demandServedFromDC.toLocaleString()} units`} sub="Kelowna overflow" info />
                  <StatCard label="Total from DC" value={`${totalDsfdc.toLocaleString()} units`} sub="combined DC draws" info />
                </div>
              </div>
            );
          })()}

          {locations.map((loc, idx) => {
            const stats = results[loc.id] ?? emptyStats();
            const { mean, std, points } = buildCurveData(stats.demands);
            const fillRate = stats.totalDemand > 0 ? (1 - stats.demandLost / stats.totalDemand) * 100 : 100;
            const svcLevel = stats.replenishmentOrders > 0 ? (1 - stats.stockoutInstances / stats.replenishmentOrders) * 100 : 100;
            const ticks    = stats.demands.length;

            return (
              <div key={loc.id}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: loc.color }} />
                  <h3 className="text-base font-bold text-slate-800">
                    {loc.name} {isPooled && idx > 0 ? "Service Area" : "Warehouse"}
                  </h3>
                  <span className="text-xs text-slate-400 ml-1">· {ticks} hours simulated</span>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Demand Distribution</p>
                    <p className="text-xs text-slate-500 mb-3">
                      μ = <span className="font-semibold text-slate-700">{mean.toFixed(2)}</span> &nbsp;·&nbsp;
                      σ = <span className="font-semibold text-slate-700">{std.toFixed(2)}</span> units/hr
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
                          <p className="text-2xl font-black mt-0.5" style={{ color: loc.color }}>{svcLevel.toFixed(1)}%</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">1 − Stockouts / Orders</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard label="Stockout Instances" value={stats.stockoutInstances.toString()} sub="positive→zero transitions" alert={stats.stockoutInstances > 0} />
                      <StatCard label="Replenishment Orders" value={stats.replenishmentOrders.toString()} sub="orders placed" />
                      <StatCard label="Total Demand Lost" value={`${stats.demandLost.toLocaleString()} units`} sub="unmet demand" alert={stats.demandLost > 0} />
                      {isS3
                        ? <StatCard label="Served from DC" value={`${stats.demandServedFromDC.toLocaleString()} units`} sub="via DC backup" info />
                        : <StatCard label="Total Demand" value={`${stats.totalDemand.toLocaleString()} units`} sub={`over ${ticks} hours`} />
                      }
                    </div>
                  </div>
                </div>

                {idx < locations.length - 1 && <div className="mt-6 border-t border-slate-100" />}
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

function InventoryCard({ s, color, label, isCritical, stockouts, demandLost }: {
  s: StockMetrics; color: string; label: string; isCritical?: boolean;
  stockouts?: number; demandLost?: number;
}) {
  const W = 168, H = 142;
  const barVW = 10, barVH = 112, barX = 6, barY = 16;
  const fillPct  = s.capacity > 0 ? Math.min(s.current / s.capacity, 1) : 0;
  const ropPct   = s.capacity > 0 ? Math.min(s.reorderPoint / s.capacity, 1) : 0;
  const ssPct    = s.capacity > 0 ? Math.min(s.safetyStock  / s.capacity, 1) : 0;
  const fillColor = s.current <= s.safetyStock ? "#ef4444" : s.current <= s.reorderPoint ? "#f59e0b" : color;
  const ropY = barVH * (1 - ropPct);
  const ssY  = barVH * (1 - ssPct);
  // Ensure labels are at least 10px apart even when thresholds are close
  const minLabelGap = 10;
  const ropLabelY = ropY;
  const ssLabelY  = ssY - ropY < minLabelGap ? ropY + minLabelGap : ssY;
  const so = stockouts ?? 0;
  const dl = demandLost ?? 0;
  return (
    <g>
      <rect x={2} y={2} width={W} height={H} rx={7} fill="rgba(0,0,0,0.10)" />
      <rect width={W} height={H} rx={7} fill="white" stroke={isCritical ? "#ef4444" : color} strokeWidth={isCritical ? 2.5 : 1.5} strokeOpacity={isCritical ? 0.9 : 0.35} />
      <text x={28} y={16} fontSize={7.5} fontWeight="700" fill="#94a3b8" letterSpacing="0.08em" fontFamily="system-ui, sans-serif">{label}</text>
      <text x={28} y={33} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Current Level</text>
      <text x={W - 10} y={33} textAnchor="end" fontSize={9} fontWeight="700" fill={fillColor} fontFamily="system-ui, sans-serif">{s.current.toLocaleString()} {s.unit}</text>
      <line x1={28} y1={39} x2={W - 10} y2={39} stroke="#f1f5f9" strokeWidth={1} />
      <circle cx={31.5} cy={51} r={3.5} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
      <text x={38} y={55} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Reorder Point</text>
      <text x={W - 10} y={55} textAnchor="end" fontSize={9} fontWeight="600" fill="#d97706" fontFamily="system-ui, sans-serif">{s.reorderPoint.toLocaleString()} {s.unit}</text>
      <circle cx={31.5} cy={69} r={3.5} fill="#fee2e2" stroke="#ef4444" strokeWidth={1} />
      <text x={38} y={73} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Safety Stock</text>
      <text x={W - 10} y={73} textAnchor="end" fontSize={9} fontWeight="600" fill="#dc2626" fontFamily="system-ui, sans-serif">{s.safetyStock.toLocaleString()} {s.unit}</text>
      <line x1={28} y1={80} x2={W - 10} y2={80} stroke="#f1f5f9" strokeWidth={1} />
      <circle cx={31.5} cy={90} r={3.5} fill={so > 0 ? "#fee2e2" : "#f8fafc"} stroke={so > 0 ? "#ef4444" : "#cbd5e1"} strokeWidth={1} />
      <text x={38} y={94} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Stockouts</text>
      <text x={W - 10} y={94} textAnchor="end" fontSize={9} fontWeight="700" fill={so > 0 ? "#dc2626" : "#94a3b8"} fontFamily="system-ui, sans-serif">{so}</text>
      <circle cx={31.5} cy={108} r={3.5} fill={dl > 0 ? "#fef3c7" : "#f8fafc"} stroke={dl > 0 ? "#f59e0b" : "#cbd5e1"} strokeWidth={1} />
      <text x={38} y={112} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Demand Lost</text>
      <text x={W - 10} y={112} textAnchor="end" fontSize={9} fontWeight="700" fill={dl > 0 ? "#d97706" : "#94a3b8"} fontFamily="system-ui, sans-serif">{dl.toLocaleString()} {s.unit}</text>
      {/* Vertical inventory bar on left */}
      <g transform={`translate(${barX}, ${barY})`}>
        <rect width={barVW} height={barVH} rx={3} fill="#f1f5f9" />
        <rect x={0} y={barVH * (1 - fillPct)} width={barVW} height={barVH * fillPct} rx={3} fill={fillColor} fillOpacity={0.8} />
        {/* ROP marker + label */}
        <line x1={-3} y1={ropY} x2={barVW + 3} y2={ropY} stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" />
        <text x={barVW + 5} y={ropLabelY + 3} fontSize={7} fill="#d97706" fontWeight="700" fontFamily="system-ui, sans-serif">ROP</text>
        {/* SS marker + label (pushed down if too close to ROP) */}
        <line x1={-3} y1={ssY} x2={barVW + 3} y2={ssY} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
        {ssLabelY !== ssY && <line x1={barVW + 3} y1={ssY} x2={barVW + 3} y2={ssLabelY} stroke="#ef4444" strokeWidth={0.75} strokeOpacity={0.5} />}
        <text x={barVW + 5} y={ssLabelY + 3} fontSize={7} fill="#dc2626" fontWeight="700" fontFamily="system-ui, sans-serif">SS</text>
      </g>
    </g>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BCMap() {
  const [activeScenario, setActiveScenario]     = useState<ScenarioId>(1);
  const [centralSSPct, setCentralSSPct]         = useState(50);   // S3 slider: % of SS at DC
  const [locations, setLocations]               = useState<LocationData[]>(getScenarioLocations(1));
  const [selected, setSelected]                 = useState<LocationData | null>(null);
  const [hovered, setHovered]                   = useState<string | null>(null);
  const [zoom, setZoom]                         = useState(1);
  const [center, setCenter]                     = useState<[number, number]>([-119.8, 50.35]);
  const [isPlaying, setIsPlaying]               = useState(false);
  const [showResults, setShowResults]           = useState(false);
  const [resultsData, setResultsData]           = useState<Record<string, SimStats>>({});
  const [currentHour, setCurrentHour]           = useState(0);
  const [speedMs, setSpeedMs]                   = useState(200);
  const [pausedOnStockout, setPausedOnStockout] = useState(false);
  const [dcInventory, setDcInventory]           = useState(0);   // S3 DC display

  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const hourRef          = useRef(0);
  const simStateRef      = useRef<Record<string, LocSimState>>({});
  const statsRef         = useRef<Record<string, SimStats>>({});
  const dcInvRef         = useRef(0);
  const scenarioRef      = useRef<ScenarioId>(1);
  const centralPctRef    = useRef(50);
  const firstStockoutRef = useRef(false);
  const dcInitialRef     = useRef(0); // for results modal

  const initSim = (scenario: ScenarioId, pct: number) => {
    const { ssDC, ssR, initR } = s3Params(pct);
    if (scenario === 2) {
      simStateRef.current = { kamloops: initLocState(SIM_INIT * 2), kelowna: initLocState() };
      dcInvRef.current = 0;
    } else if (scenario === 3) {
      simStateRef.current = { kamloops: initLocState(initR), kelowna: initLocState(initR) };
      dcInvRef.current = ssDC;
      dcInitialRef.current = ssDC;
    } else {
      simStateRef.current = { kamloops: initLocState(), kelowna: initLocState() };
      dcInvRef.current = 0;
    }
    statsRef.current = {};
    hourRef.current  = 0;
    firstStockoutRef.current = false;
  };

  const resetAll = (scenario: ScenarioId, pct = centralSSPct) => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    initSim(scenario, pct);
    setIsPlaying(false);
    setPausedOnStockout(false);
    setCurrentHour(0);
    setDcInventory(dcInvRef.current);
    setLocations(getScenarioLocations(scenario, pct));
    setSelected(null);
  };

  const handleScenarioChange = (s: ScenarioId) => {
    scenarioRef.current = s;
    setActiveScenario(s);
    resetAll(s);
  };

  const handleCentralPctChange = (pct: number) => {
    centralPctRef.current = pct;
    setCentralSSPct(pct);
    resetAll(3, pct);
  };

  // Sync detail panel
  useEffect(() => {
    if (selected) {
      const updated = locations.find((l) => l.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [locations]);

  // ── Simulation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }

    intervalRef.current = setInterval(() => {
      const h        = hourRef.current;
      const scenario = scenarioRef.current;

      if (h >= SIM_HOURS) {
        clearInterval(intervalRef.current!); intervalRef.current = null;
        setIsPlaying(false);
        const captured = { ...statsRef.current };
        if (Object.values(captured).some((s) => s.demands.length > 0)) {
          setResultsData(captured); setShowResults(true);
        }
        return;
      }

      const r1d = SHARED_DEMAND.r1[h];
      const r2d = SHARED_DEMAND.r2[h];
      let anyNewStockout = false;

      // ── Scenario 2: pooled ────────────────────────────────────────────────
      if (scenario === 2) {
        const hub = simStateRef.current["kamloops"] ?? initLocState(SIM_INIT * 2);
        const { next, newStockout } = stepPooled(hub, r1d, r2d, h);
        simStateRef.current["kamloops"] = next;
        if (!statsRef.current["kamloops"]) statsRef.current["kamloops"] = emptyStats();
        const st = statsRef.current["kamloops"];
        st.demands.push(r1d + r2d);
        st.totalDemand = next.totalDemand; st.demandLost = next.demandLost;
        st.stockoutInstances = next.stockoutInstances; st.replenishmentOrders = next.replenishmentOrders;
        if (newStockout) anyNewStockout = true;

        const cap = SIM_CAP * 2;
        const pct = cap > 0 ? next.inventory / cap : 0;
        setLocations((prev) => prev.map((loc, i) => {
          if (i !== 0) return loc;
          return {
            ...loc,
            stock: { ...loc.stock, current: next.inventory },
            inventory: loc.inventory.map((item) => {
              const maxQ = itemMaxQty[item.sku] ?? item.quantity;
              const qty  = Math.max(0, Math.round(maxQ * pct * (0.85 + Math.random() * 0.3)));
              return { ...item, quantity: qty, status: deriveItemStatus(qty, maxQ), lastUpdated: `Today, ${nowStr()}` };
            }),
          };
        }));

      // ── Scenario 3: partial SS centralisation ────────────────────────────
      } else if (scenario === 3) {
        const pct   = centralPctRef.current;
        const { ssR, ropR } = s3Params(pct);
        const r1s   = simStateRef.current["kamloops"] ?? initLocState();
        const r2s   = simStateRef.current["kelowna"]  ?? initLocState();
        const dcInv = dcInvRef.current;
        const prevDsfdc1 = statsRef.current["kamloops"]?.demandServedFromDC ?? 0;
        const prevDsfdc2 = statsRef.current["kelowna"]?.demandServedFromDC  ?? 0;

        const res = stepS3(r1s, r2s, dcInv, r1d, r2d, h, ssR, ssR);
        simStateRef.current["kamloops"] = res.nextR1;
        simStateRef.current["kelowna"]  = res.nextR2;
        dcInvRef.current = res.nextDcInv;

        for (const [id, next, demand, dsfDelta] of [
          ["kamloops", res.nextR1, r1d, res.dsfdc1Delta],
          ["kelowna",  res.nextR2, r2d, res.dsfdc2Delta],
        ] as [string, LocSimState, number, number][]) {
          if (!statsRef.current[id]) statsRef.current[id] = emptyStats();
          const st = statsRef.current[id];
          st.demands.push(demand);
          st.totalDemand = next.totalDemand; st.demandLost = next.demandLost;
          st.stockoutInstances = next.stockoutInstances; st.replenishmentOrders = next.replenishmentOrders;
          st.demandServedFromDC += dsfDelta;
        }

        if (res.newStockout) anyNewStockout = true;
        setDcInventory(res.nextDcInv);
        setLocations((prev) => prev.map((loc) => {
          const next = loc.id === "kamloops" ? res.nextR1 : res.nextR2;
          const stockPct = SIM_CAP > 0 ? next.inventory / SIM_CAP : 0;
          return {
            ...loc,
            stock: { current: next.inventory, reorderPoint: ropR, safetyStock: ssR, capacity: SIM_CAP, unit: "units" },
            inventory: loc.inventory.map((item) => {
              const maxQ = itemMaxQty[item.sku] ?? item.quantity;
              const qty  = Math.max(0, Math.round(maxQ * stockPct * (0.85 + Math.random() * 0.3)));
              return { ...item, quantity: qty, status: deriveItemStatus(qty, maxQ), lastUpdated: `Today, ${nowStr()}` };
            }),
          };
        }));

        // suppress prevDsfdc warning
        void prevDsfdc1; void prevDsfdc2;

      // ── Scenario 1 (& default): independent ──────────────────────────────
      } else {
        const updates: Record<string, LocSimState> = {};
        for (const [id, demand] of [["kamloops", r1d], ["kelowna", r2d]] as [string, number][]) {
          const state = simStateRef.current[id] ?? initLocState();
          const { next, newStockout } = stepIndep(state, demand, h);
          updates[id] = next;
          simStateRef.current[id] = next;
          if (!statsRef.current[id]) statsRef.current[id] = emptyStats();
          const st = statsRef.current[id];
          st.demands.push(demand);
          st.totalDemand = next.totalDemand; st.demandLost = next.demandLost;
          st.stockoutInstances = next.stockoutInstances; st.replenishmentOrders = next.replenishmentOrders;
          if (newStockout) anyNewStockout = true;
        }
        setLocations((prev) => prev.map((loc) => {
          const next = updates[loc.id]; if (!next) return loc;
          const stockPct = SIM_CAP > 0 ? next.inventory / SIM_CAP : 0;
          return {
            ...loc,
            stock: { ...loc.stock, current: next.inventory },
            inventory: loc.inventory.map((item) => {
              const maxQ = itemMaxQty[item.sku] ?? item.quantity;
              const qty  = Math.max(0, Math.round(maxQ * stockPct * (0.85 + Math.random() * 0.3)));
              return { ...item, quantity: qty, status: deriveItemStatus(qty, maxQ), lastUpdated: `Today, ${nowStr()}` };
            }),
          };
        }));
      }

      if (anyNewStockout && !firstStockoutRef.current) {
        firstStockoutRef.current = true;
        setPausedOnStockout(true);
        setIsPlaying(false);
        clearInterval(intervalRef.current!); intervalRef.current = null;
      }

      hourRef.current += 1;
      setCurrentHour(h + 1);
    }, speedMs);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, speedMs]);

  const handlePlayPause = () => {
    if (isPlaying) {
      const captured = { ...statsRef.current };
      if (Object.values(captured).some((s) => s.demands.length > 0)) {
        setResultsData(captured); setShowResults(true);
      }
      setIsPlaying(false);
    } else {
      if (hourRef.current === 0) {
        initSim(activeScenario, centralSSPct);
        setLocations(getScenarioLocations(activeScenario, centralSSPct));
        setDcInventory(dcInvRef.current);
      }
      setPausedOnStockout(false);
      setIsPlaying(true);
    }
  };

  const toggle    = (loc: LocationData) => setSelected((prev) => (prev?.id === loc.id ? null : loc));
  const zoomIn    = () => setZoom((z) => Math.min(z * 1.5, 12));
  const zoomOut   = () => setZoom((z) => Math.max(z / 1.5, 0.5));
  const resetView = () => { setZoom(1); setCenter([-119.8, 50.35]); };

  const isPooled = activeScenario === 2;
  const isS3     = activeScenario === 3;
  const hourOfDay = currentHour % 8;

  // S3 derived params for display
  const { ssDC, ssR: ssRCur } = s3Params(centralSSPct);

  return (
    <div className="relative w-full h-full bg-slate-100 overflow-hidden font-sans">

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header className="absolute top-0 left-0 right-0 z-20 h-14 flex items-center justify-between px-5 bg-white border-b border-slate-200 shadow-sm gap-3">

        {/* Left */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
            <Warehouse className="w-4 h-4 text-white" />
          </div>
          <div className="leading-none">
            <p className="text-sm font-semibold text-slate-900">BC Inventory Network</p>
            <p className="text-[11px] text-slate-400 mt-0.5">British Columbia · 2 warehouse locations</p>
          </div>
        </div>

        {/* Center: scenario tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 shrink-0">
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
              <span className="tabular-nums">{currentHour}/{SIM_HOURS}</span>
            </div>
          )}

          {/* S3: DC safety-stock split slider */}
          {isS3 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 shrink-0">
              <span className="text-[10px] text-violet-500 font-semibold uppercase">DC SS%</span>
              <input
                type="range" min={0} max={100} step={25} value={centralSSPct}
                onChange={(e) => handleCentralPctChange(Number(e.target.value))}
                className="w-20 h-1.5 accent-violet-600"
                title={`${centralSSPct}% of safety stock at DC`}
              />
              <span className="text-[10px] text-violet-700 font-bold w-8 text-left">{centralSSPct}%</span>
            </div>
          )}

          {/* Speed slider */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 shrink-0">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Speed</span>
            <input
              type="range" min={50} max={2000} step={50} value={speedMs}
              onChange={(e) => setSpeedMs(Number(e.target.value))}
              className="w-20 h-1.5 accent-slate-700" style={{ direction: "rtl" }}
              title={`${speedMs}ms per hour`}
            />
            <span className="text-[10px] text-slate-500 w-8 text-left">
              {speedMs <= 100 ? "Fast" : speedMs >= 1500 ? "Slow" : `${speedMs}`}
            </span>
          </div>

          {/* Location pills */}
          {locations.map((loc) => {
            const c = counts(loc); const active = selected?.id === loc.id;
            return (
              <button key={loc.id} onClick={() => toggle(loc)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all"
                style={{ borderColor: active ? loc.color : "#e2e8f0", backgroundColor: active ? loc.accent : "#f8fafc", color: active ? loc.color : "#64748b" }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: loc.color }} />
                {loc.name}
                {c.critical > 0 && <span className="ml-0.5 bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{c.critical}</span>}
              </button>
            );
          })}

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

      {/* ── Stockout banner ──────────────────────────────────────────── */}
      {pausedOnStockout && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30">
          <div className="flex items-center gap-3 bg-red-600 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>First stockout — simulation paused for analysis</span>
            <button onClick={() => { setPausedOnStockout(false); setIsPlaying(true); }}
              className="ml-2 px-3 py-1 bg-white text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors">
              Resume
            </button>
          </div>
        </div>
      )}

      {/* ── Map ──────────────────────────────────────────────────────── */}
      <div className="absolute inset-0 top-14">
        <ComposableMap projection="geoMercator" projectionConfig={{ center: [-119.8, 50.35], scale: 4400 }} style={{ width: "100%", height: "100%" }}>
          <ZoomableGroup zoom={zoom} center={center} onMoveEnd={({ zoom: z, coordinates }) => { setZoom(z); setCenter(coordinates); }}>

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

            {/* ── Scenario 2: pooled central hub ─────────────────────── */}
            {isPooled && (
              <>
                <Line from={locations[0].coordinates} to={CENTRAL_HUB_COORDS} stroke="#0d9488" strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" />
                <Line from={locations[1].coordinates} to={CENTRAL_HUB_COORDS} stroke="#0d9488" strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" />
                {(() => {
                  const hub = locations[0]; const s = hub.stock;
                  const hasStockout = (statsRef.current["kamloops"]?.stockoutInstances ?? 0) > 0;
                  const W = 168, H = 142, pinR = 13;
                  const cardTop = -(H + 80); // above hub pin, clear of both city pins
                  return (
                    <Marker coordinates={CENTRAL_HUB_COORDS} onClick={() => toggle(hub)} style={{ cursor: "pointer" }}>
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
                        <InventoryCard s={s} color="#0d9488" label="CENTRAL HUB" isCritical={hasStockout}
                          stockouts={statsRef.current["kamloops"]?.stockoutInstances}
                          demandLost={statsRef.current["kamloops"]?.demandLost} />
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
                  const isSelected = selected?.id === loc.id, isHovered = hovered === loc.id;
                  const active = isSelected || isHovered, pinR = active ? 18 : 13;
                  return (
                    <Marker key={loc.id} coordinates={loc.coordinates} onClick={() => toggle(loc)}
                      onMouseEnter={() => setHovered(loc.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
                      {active && <circle r={30} fill={loc.color} fillOpacity={0.08} stroke={loc.color} strokeWidth={1} strokeOpacity={0.25} />}
                      <circle r={pinR} fill={loc.color} fillOpacity={0.15} transform="translate(1,1)" />
                      <circle r={pinR} fill={isSelected ? loc.color : "white"} stroke={loc.color} strokeWidth={2.5} />
                      <circle r={5} fill={isSelected ? "white" : loc.color} />
                      <text textAnchor="middle" y={active ? 34 : 28} fill={loc.color} fontSize={11} fontWeight="700" fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>{loc.name}</text>
                      {active && <text textAnchor="middle" y={47} fill="#64748b" fontSize={9.5} fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>{loc.totalSkus} SKUs · {loc.totalValue}</text>}
                    </Marker>
                  );
                })}
              </>
            )}

            {/* ── Scenario 3: partial SS centralisation ──────────────── */}
            {isS3 && (
              <>
                {/* Lines from forward facilities to DC (emergency route) */}
                <Line from={locations[0].coordinates} to={DC_S3_COORDS} stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
                <Line from={locations[1].coordinates} to={DC_S3_COORDS} stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
                {/* Direct supply line between warehouses */}
                <Line from={locations[0].coordinates} to={locations[1].coordinates} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" strokeLinecap="round" />

                {/* DC card — rendered above the pin so it doesn't overlap facility cards */}
                {(() => {
                  const W = 160, H = 72;
                  const pinR = 10;
                  const gap  = 10; // gap between pin top and card bottom
                  const dcPct   = dcInitialRef.current > 0 ? dcInventory / dcInitialRef.current : 0;
                  const dcColor = dcInventory <= 0 ? "#ef4444" : dcInventory < dcInitialRef.current * 0.3 ? "#f59e0b" : "#7c3aed";
                  const barW = 132, barH = 9;
                  const cardTop = -(H + 100); // high enough to clear both facility cards
                  return (
                    <Marker coordinates={DC_S3_COORDS} style={{ cursor: "default" }}>
                      {/* connector line from pin to card */}
                      <line x1={0} y1={-pinR} x2={0} y2={cardTop + H}
                        stroke="#7c3aed" strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 2"
                        style={{ pointerEvents: "none" }} />
                      {/* DC pin diamond */}
                      <g transform="rotate(45)">
                        <rect x={-7} y={-7} width={14} height={14} fill="white" stroke="#7c3aed" strokeWidth={2} rx={2} />
                      </g>
                      <circle r={4} fill="#7c3aed" />
                      <text textAnchor="middle" y={pinR + 12} fill="#7c3aed" fontSize={9} fontWeight="700"
                        fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>DC</text>
                      {/* card above pin */}
                      <g transform={`translate(${-W / 2}, ${cardTop})`} style={{ pointerEvents: "none" }}>
                        <rect x={2} y={2} width={W} height={H} rx={7} fill="rgba(0,0,0,0.10)" />
                        <rect width={W} height={H} rx={7} fill="white"
                          stroke={dcInventory <= 0 ? "#ef4444" : "#7c3aed"}
                          strokeWidth={dcInventory <= 0 ? 2 : 1.5}
                          strokeOpacity={dcInventory <= 0 ? 0.9 : 0.5} />
                        <rect width={4} height={H} rx={2} fill={dcInventory <= 0 ? "#ef4444" : "#7c3aed"} />
                        <text x={14} y={16} fontSize={7.5} fontWeight="700" fill="#94a3b8" letterSpacing="0.08em" fontFamily="system-ui, sans-serif">DISTRIBUTION CENTRE</text>
                        <text x={14} y={31} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Safety Stock Reserve</text>
                        <text x={W - 10} y={31} textAnchor="end" fontSize={9} fontWeight="700" fill={dcColor} fontFamily="system-ui, sans-serif">
                          {dcInventory.toLocaleString()} / {dcInitialRef.current} units
                        </text>
                        <g transform="translate(14, 42)">
                          <rect width={barW} height={barH} rx={4} fill="#f1f5f9" />
                          <rect width={Math.max(barW * dcPct, dcInventory > 0 ? barH : 0)} height={barH} rx={4} fill={dcColor} fillOpacity={0.75} />
                          <text x={barW / 2} y={barH + 13} textAnchor="middle" fontSize={7} fill="#7c3aed" fontWeight="600" fontFamily="system-ui, sans-serif">
                            {dcInventory <= 0 ? "DEPLETED" : `${Math.round(dcPct * 100)}% remaining`}
                          </text>
                        </g>
                      </g>
                    </Marker>
                  );
                })()}

                {/* Forward facility pins with inventory cards */}
                {locations.map((loc) => {
                  const isSelected = selected?.id === loc.id, isHovered = hovered === loc.id;
                  const active = isSelected || isHovered;
                  const c = counts(loc), s = loc.stock;
                  const W = 168, H = 142;
                  const pinR = active ? 18 : 13;
                  const gap    = 14;
                  const cardX  = loc.cardSide === "left" ? -(pinR + gap + W) : pinR + gap;
                  const cardY  = -H / 2;
                  const connX1 = loc.cardSide === "left" ? -pinR : pinR;
                  const connX2 = loc.cardSide === "left" ? -(pinR + gap) : pinR + gap;
                  return (
                    <Marker key={loc.id} coordinates={loc.coordinates} onClick={() => toggle(loc)}
                      onMouseEnter={() => setHovered(loc.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
                      <g transform={`translate(${cardX}, ${cardY})`} style={{ pointerEvents: "none" }}>
                        <InventoryCard s={s} color={loc.color} label="INVENTORY STATUS"
                          stockouts={statsRef.current[loc.id]?.stockoutInstances}
                          demandLost={statsRef.current[loc.id]?.demandLost} />
                      </g>
                      <line x1={connX1} y1={0} x2={connX2} y2={0} stroke={loc.color} strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 2" style={{ pointerEvents: "none" }} />
                      {active && <circle r={30} fill={loc.color} fillOpacity={0.08} stroke={loc.color} strokeWidth={1} strokeOpacity={0.25} />}
                      <circle r={pinR} fill={loc.color} fillOpacity={0.15} transform="translate(1,1)" />
                      <circle r={pinR} fill={isSelected ? loc.color : "white"} stroke={loc.color} strokeWidth={2.5} />
                      <circle r={5} fill={isSelected ? "white" : loc.color} />
                      {c.critical > 0 && (
                        <g transform={`translate(${active ? 16 : 11}, ${active ? -16 : -11})`}>
                          <circle r={7} fill="#ef4444" stroke="white" strokeWidth={1.5} />
                          <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={8} fontWeight="800">{c.critical}</text>
                        </g>
                      )}
                      <text textAnchor="middle" y={active ? 34 : 28} fill={loc.color} fontSize={11} fontWeight="700" fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>{loc.name}</text>
                      {active && <text textAnchor="middle" y={47} fill="#64748b" fontSize={9.5} fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>{loc.totalSkus} SKUs · {loc.totalValue}</text>}
                    </Marker>
                  );
                })}
              </>
            )}

            {/* ── Scenario 1: independent ─────────────────────────────── */}
            {!isPooled && !isS3 && (
              <>
                <Line from={locations[0].coordinates} to={locations[1].coordinates} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" strokeLinecap="round" />
                {locations.map((loc) => {
                  const isSelected = selected?.id === loc.id, isHovered = hovered === loc.id;
                  const active = isSelected || isHovered;
                  const c = counts(loc), s = loc.stock;
                  const W = 168, H = 142;
                  const pinR = active ? 18 : 13;
                  const gap    = 14;
                  const cardX  = loc.cardSide === "left" ? -(pinR + gap + W) : pinR + gap;
                  const cardY  = -H / 2;
                  const connX1 = loc.cardSide === "left" ? -pinR : pinR;
                  const connX2 = loc.cardSide === "left" ? -(pinR + gap) : pinR + gap;
                  return (
                    <Marker key={loc.id} coordinates={loc.coordinates} onClick={() => toggle(loc)}
                      onMouseEnter={() => setHovered(loc.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
                      <g transform={`translate(${cardX}, ${cardY})`} style={{ pointerEvents: "none" }}>
                        <InventoryCard s={s} color={loc.color} label="INVENTORY STATUS"
                          stockouts={statsRef.current[loc.id]?.stockoutInstances}
                          demandLost={statsRef.current[loc.id]?.demandLost} />
                      </g>
                      <line x1={connX1} y1={0} x2={connX2} y2={0} stroke={loc.color} strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 2" style={{ pointerEvents: "none" }} />
                      {active && <circle r={30} fill={loc.color} fillOpacity={0.08} stroke={loc.color} strokeWidth={1} strokeOpacity={0.25} />}
                      <circle r={pinR} fill={loc.color} fillOpacity={0.15} transform="translate(1,1)" />
                      <circle r={pinR} fill={isSelected ? loc.color : "white"} stroke={loc.color} strokeWidth={2.5} />
                      <circle r={5} fill={isSelected ? "white" : loc.color} />
                      {c.critical > 0 && (
                        <g transform={`translate(${active ? 16 : 11}, ${active ? -16 : -11})`}>
                          <circle r={7} fill="#ef4444" stroke="white" strokeWidth={1.5} />
                          <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={8} fontWeight="800">{c.critical}</text>
                        </g>
                      )}
                      <text textAnchor="middle" y={active ? 34 : 28} fill={loc.color} fontSize={11} fontWeight="700" fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>{loc.name}</text>
                      {active && <text textAnchor="middle" y={47} fill="#64748b" fontSize={9.5} fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>{loc.totalSkus} SKUs · {loc.totalValue}</text>}
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

      {/* ── Legend ────────────────────────────────────────────────── */}
      <div className="absolute bottom-5 left-5 z-10 bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 text-xs space-y-3">
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Locations</p>
          {locations.map((loc) => (
            <div key={loc.id} className="flex items-center gap-2 mb-1.5 last:mb-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: loc.color }} />
              <span className="text-slate-600 font-medium">{loc.name}</span>
              <span className="text-slate-400">— {loc.warehouseSize}</span>
            </div>
          ))}
          {isS3 && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-violet-600" />
              <span className="text-slate-600 font-medium">DC</span>
              <span className="text-slate-400">— {ssDC} SS units</span>
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 pt-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Stock Status</p>
          {(["healthy", "low", "critical"] as const).map((s) => (
            <div key={s} className="flex items-center gap-2 mb-1.5 last:mb-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusConfig[s].dot}`} />
              <span className="text-slate-600">{statusConfig[s].label}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Stock Bar</p>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-0.5 h-3.5 bg-amber-400 rounded-full shrink-0" />
            <span className="text-slate-500">ROP — Reorder Point</span>
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-0.5 h-3.5 bg-red-400 rounded-full shrink-0" />
            <span className="text-slate-500">SS — Safety Stock</span>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2 mb-1.5">
            <svg width="20" height="6" viewBox="0 0 20 6">
              <line x1="0" y1="3" x2="20" y2="3"
                stroke={isPooled ? "#0d9488" : isS3 ? "#7c3aed" : "#94a3b8"}
                strokeWidth="1.5"
                strokeDasharray={isPooled ? "6 3" : isS3 ? "4 4" : "4 3"}
                strokeLinecap="round" />
            </svg>
            <span className="text-slate-500">{isPooled ? "Central supply flow" : isS3 ? "DC emergency route" : "Supply route"}</span>
          </div>
        </div>
        {isS3 && (
          <div className="border-t border-slate-100 pt-3 text-[10px] text-slate-500 space-y-0.5">
            <div className="font-semibold text-slate-400 uppercase tracking-widest mb-1">SS Split</div>
            <div>Forward (each): <span className="font-semibold text-slate-700">{ssRCur}</span> units</div>
            <div>DC pool: <span className="font-semibold text-violet-700">{ssDC}</span> units</div>
          </div>
        )}
        <div className="border-t border-slate-100 pt-3 text-[10px] text-slate-400 space-y-0.5">
          <div>Q={SIM_Q} · SS={SIM_SS} · LT={SIM_LT}h · d̄={SIM_D}/hr</div>
          <div>ROP={SIM_ROP} · Init={SIM_INIT} · {SIM_HOURS}h sim</div>
        </div>
      </div>

      {/* ── Detail panel ──────────────────────────────────────────── */}
      {selected && (
        <div key={selected.id} className="absolute top-[68px] right-4 bottom-4 z-20 w-[390px] bg-white rounded-2xl border border-slate-200 shadow-xl flex flex-col overflow-hidden">
          <div className="p-5 shrink-0" style={{ backgroundColor: selected.accent }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <MapPin className="w-4 h-4 shrink-0" style={{ color: selected.color }} />
                  <h2 className="text-base font-bold text-slate-900 truncate">
                    {selected.name} {isPooled && selected.id !== locations[0].id ? "Service Area" : "Warehouse"}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 ml-6">{selected.address}</p>
              </div>
              <button onClick={() => setSelected(null)} className="shrink-0 w-7 h-7 rounded-lg bg-white/80 hover:bg-white flex items-center justify-center transition-colors border border-white/50">
                <X className="w-3.5 h-3.5 text-slate-500" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: "Total SKUs", value: selected.totalSkus.toLocaleString() },
                { label: "Est. Value",  value: selected.totalValue },
                { label: "Footprint",  value: selected.warehouseSize },
              ].map((s) => (
                <div key={s.label} className="bg-white/60 rounded-lg px-3 py-2 backdrop-blur-sm">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide leading-none">{s.label}</p>
                  <p className="text-sm font-bold text-slate-900 mt-1 leading-none">{s.value}</p>
                </div>
              ))}
            </div>
            {(() => {
              const c = counts(selected);
              return (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.critical > 0 && <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-[11px] font-semibold"><AlertCircle className="w-3 h-3" />{c.critical} Critical</span>}
                  {c.low > 0      && <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-[11px] font-semibold"><TrendingUp className="w-3 h-3" />{c.low} Low Stock</span>}
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-[11px] font-semibold"><CheckCircle className="w-3 h-3" />{c.healthy} Healthy</span>
                </div>
              );
            })()}
          </div>

          {/* Live simulation stats */}
          {currentHour > 0 && (() => {
            const st = statsRef.current[selected.id];
            if (!st) return null;
            const fillRate = st.totalDemand > 0 ? ((1 - st.demandLost / st.totalDemand) * 100).toFixed(1) : "100.0";
            const svcLevel = st.replenishmentOrders > 0 ? ((1 - st.stockoutInstances / st.replenishmentOrders) * 100).toFixed(1) : "100.0";
            return (
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 shrink-0">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Live Stats</p>
                <div className={`grid gap-2 text-center ${isS3 ? "grid-cols-5" : "grid-cols-4"}`}>
                  <div>
                    <p className="text-[10px] text-slate-400">Stockouts</p>
                    <p className={`text-sm font-bold ${st.stockoutInstances > 0 ? "text-red-600" : "text-slate-700"}`}>{st.stockoutInstances}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Rep. Orders</p>
                    <p className="text-sm font-bold text-slate-700">{st.replenishmentOrders}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Fill Rate</p>
                    <p className={`text-sm font-bold ${st.demandLost > 0 ? "text-amber-600" : "text-green-600"}`}>{fillRate}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Svc Level</p>
                    <p className={`text-sm font-bold ${st.stockoutInstances > 0 ? "text-amber-600" : "text-green-600"}`}>{svcLevel}%</p>
                  </div>
                  {isS3 && (
                    <div>
                      <p className="text-[10px] text-violet-400">From DC</p>
                      <p className="text-sm font-bold text-violet-700">{st.demandServedFromDC}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-5 text-xs text-slate-500 shrink-0 bg-slate-50/60">
            <span><span className="font-medium text-slate-700">Manager: </span>{selected.manager}</span>
            <span><span className="font-medium text-slate-700">Tel: </span>{selected.phone}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Inventory</p>
              <p className="text-xs text-slate-400">{selected.inventory.length} categories</p>
            </div>
            <div className="divide-y divide-slate-50">
              {selected.inventory.map((item) => {
                const cfg = statusConfig[item.status];
                return (
                  <div key={item.sku} className="px-5 py-3 hover:bg-slate-50/70 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate leading-snug">{item.category}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">SKU {item.sku}</p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Package className="w-3 h-3 text-slate-400" />
                        <span className="text-sm font-bold text-slate-800">{item.quantity.toLocaleString()}</span>
                        <span className="text-xs text-slate-400">{item.unit}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{item.lastUpdated}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Results Modal ─────────────────────────────────────────── */}
      {showResults && (
        <ResultsModal
          locations={locations}
          results={resultsData}
          isPooled={isPooled}
          isS3={isS3}
          dcInitial={dcInitialRef.current}
          onClose={() => setShowResults(false)}
        />
      )}
    </div>
  );
}
