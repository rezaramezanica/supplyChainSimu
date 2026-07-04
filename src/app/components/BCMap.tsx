import React, { useState, useEffect, useRef } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
  ZoomableGroup,
} from "react-simple-maps";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";
import {
  Package, MapPin, X, TrendingUp, AlertCircle, CheckCircle,
  Warehouse, Plus, Minus, RotateCcw, Play, Pause,
} from "lucide-react";

const CANADA_GEO        = "https://cdn.jsdelivr.net/gh/codeforamerica/click_that_hood@master/public/data/canada.geojson";
const US_GEO            = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const CENTRAL_HUB_COORDS: [number, number] = [-119.91, 50.28]; // midpoint between Kamloops & Kelowna

// ─── Types ────────────────────────────────────────────────────────────────────

type ScenarioId = 1 | 2 | 3;

type SimConfig = {
  label: string;
  subtitle: string;
  surgeDemand:           [number, number]; // per-location demand during surge
  normalDemand:          [number, number]; // per-location demand during calm
  surgeDuration:         [number, number];
  calmDuration:          [number, number];
  restockFactor:         [number, number]; // fraction of capacity to restock to
  restockThresholdFactor: number;          // fraction of safetyStock that triggers restock
  pooled:                boolean;          // true = both locations share one inventory pool
};

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

type SimStats = {
  demands: number[]; stockouts: number; demandLost: number; totalDemand: number;
};

// ─── Scenario config ──────────────────────────────────────────────────────────

const SCENARIO_CONFIG: Record<ScenarioId, SimConfig> = {
  1: {
    label: "Scenario 1", subtitle: "Decentralized",
    surgeDemand:            [260, 360],
    normalDemand:           [80,  130],
    surgeDuration:          [8,   14],
    calmDuration:           [4,   8],
    restockFactor:          [0.70, 0.74],
    restockThresholdFactor: 0.4,
    pooled:                 false,
  },
  2: {
    label: "Scenario 2", subtitle: "Centralized",
    // Per-location demands are the same as S1 — the pooling benefit comes
    // from the shared doubled stock absorbing demand swings that cancel out.
    surgeDemand:            [260, 360],
    normalDemand:           [80,  130],
    surgeDuration:          [8,   14],
    calmDuration:           [4,   8],
    restockFactor:          [0.70, 0.74],   // applied to combined capacity (9000) → ≈ 6480
    restockThresholdFactor: 1.0,            // restock when below full SS (more responsive)
    pooled:                 true,
  },
  3: {
    label: "Scenario 3", subtitle: "Coming Soon",
    surgeDemand:            [260, 360],
    normalDemand:           [80,  130],
    surgeDuration:          [8,   14],
    calmDuration:           [4,   8],
    restockFactor:          [0.70, 0.74],
    restockThresholdFactor: 0.4,
    pooled:                 false,
  },
};

// ─── Base location data ───────────────────────────────────────────────────────

const initialLocations: LocationData[] = [
  {
    id: "kamloops", name: "Kamloops",
    coordinates: [-120.3273, 50.6745],
    color: "#2563eb", lightColor: "#93c5fd", accent: "#dbeafe",
    address: "1250 Summit Drive, Kamloops, BC V2C 5R8",
    warehouseSize: "42,000 sq ft", manager: "Sandra Kowalski", phone: "(250) 374-8801",
    totalSkus: 847, totalValue: "$3.2M", cardSide: "left",
    stock: { current: 3000, reorderPoint: 1500, safetyStock: 800, capacity: 5000, unit: "units" },
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
    stock: { current: 3000, reorderPoint: 1200, safetyStock: 600, capacity: 4000, unit: "units" },
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

// Builds the starting locations for a given scenario
function getScenarioLocations(scenario: ScenarioId): LocationData[] {
  if (scenario === 2) {
    // Kamloops is the central hub — holds combined stock for the whole region.
    // Kelowna is a demand point only: no inventory is held there.
    const hubStock: StockMetrics = {
      current:      6000, // 3000 + 3000
      reorderPoint: 2700, // 1500 + 1200
      safetyStock:  1400, // 800  + 600
      capacity:     9000, // 5000 + 4000
      unit: "units",
    };
    const demandPoint: StockMetrics = { current: 0, reorderPoint: 0, safetyStock: 0, capacity: 0, unit: "units" };
    return [
      { ...initialLocations[0], stock: hubStock, totalSkus: 1461, totalValue: "$5.3M", warehouseSize: "73,500 sq ft" },
      { ...initialLocations[1], stock: demandPoint },
    ];
  }
  return initialLocations;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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

const itemMaxQty: Record<string, number> = {};
initialLocations.forEach((loc) => loc.inventory.forEach((item) => { itemMaxQty[item.sku] = item.quantity; }));

function nowStr() {
  return new Date().toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
}

function emptyStats(): SimStats { return { demands: [], stockouts: 0, demandLost: 0, totalDemand: 0 }; }

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

// ─── Results Modal ────────────────────────────────────────────────────────────

function ResultsModal({
  locations, results, isPooled, onClose,
}: { locations: LocationData[]; results: Record<string, SimStats>; isPooled: boolean; onClose: () => void }) {
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
          {locations.map((loc, idx) => {
            const stats = results[loc.id] ?? emptyStats();
            const { mean, std, points } = buildCurveData(stats.demands);
            const serviceLevel = stats.totalDemand > 0
              ? (((stats.totalDemand - stats.demandLost) / stats.totalDemand) * 100).toFixed(1)
              : "100.0";
            const ticks = stats.demands.length;

            return (
              <div key={loc.id}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: loc.color }} />
                  <h3 className="text-base font-bold text-slate-800">{loc.name} {isPooled && idx > 0 ? "Service Area" : "Warehouse"}</h3>
                  <span className="text-xs text-slate-400 ml-1">· {ticks} simulation ticks</span>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Demand Distribution</p>
                    <p className="text-xs text-slate-500 mb-3">
                      μ = <span className="font-semibold text-slate-700">{mean.toFixed(1)}</span> &nbsp;·&nbsp;
                      σ = <span className="font-semibold text-slate-700">{std.toFixed(1)}</span> units
                    </p>
                    {points.length > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
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
                            labelFormatter={(l) => `Demand: ${l} units`}
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                          />
                          <ReferenceLine x={Math.round(mean)} stroke={loc.color} strokeWidth={1.5} strokeDasharray="4 3"
                            label={{ value: "μ", position: "top", fill: loc.color, fontSize: 10, fontWeight: 700 }} />
                          <ReferenceLine x={Math.round(mean - std)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3"
                            label={{ value: "−σ", position: "top", fill: "#94a3b8", fontSize: 9 }} />
                          <ReferenceLine x={Math.round(mean + std)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3"
                            label={{ value: "+σ", position: "top", fill: "#94a3b8", fontSize: 9 }} />
                          <Area type="monotone" dataKey="probability" stroke={loc.color} strokeWidth={2}
                            fill={`url(#grad-${loc.id})`} dot={false} activeDot={{ r: 3, fill: loc.color }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[180px] flex items-center justify-center text-xs text-slate-400">No data recorded</div>
                    )}
                  </div>

                  <div className="flex flex-col justify-center gap-3">
                    <div className="rounded-xl px-4 py-3 border" style={{ backgroundColor: loc.accent, borderColor: loc.lightColor }}>
                      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: loc.color }}>Service Level</p>
                      <p className="text-3xl font-black mt-0.5" style={{ color: loc.color }}>{serviceLevel}%</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">of total demand fulfilled</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard label="Mean Demand / Tick" value={`${mean.toFixed(1)} units`}                       sub="average per period" />
                      <StatCard label="Std Deviation"      value={`${std.toFixed(1)} units`}                        sub="demand variability" />
                      <StatCard label="Stockouts"          value={stats.stockouts.toString()}                        sub="periods with zero stock" alert={stats.stockouts > 0} />
                      <StatCard label="Total Demand Lost"  value={`${stats.demandLost.toLocaleString()} units`}      sub="unmet demand"            alert={stats.demandLost > 0} />
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">Total demand simulated: </span>
                      {stats.totalDemand.toLocaleString()} units over {ticks} periods
                    </div>
                  </div>
                </div>

                {idx < locations.length - 1 && <div className="mt-6 border-t border-slate-100" />}
              </div>
            );
          })}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, alert = false }: { label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 border ${alert ? "bg-red-50 border-red-100" : "bg-slate-50 border-slate-100"}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${alert ? "text-red-400" : "text-slate-400"}`}>{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${alert ? "text-red-600" : "text-slate-800"}`}>{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BCMap() {
  const [activeScenario, setActiveScenario] = useState<ScenarioId>(1);
  const [locations, setLocations]           = useState<LocationData[]>(getScenarioLocations(1));
  const [selected, setSelected]             = useState<LocationData | null>(null);
  const [hovered, setHovered]               = useState<string | null>(null);
  const [zoom, setZoom]                     = useState(1);
  const [center, setCenter]                 = useState<[number, number]>([-119.8, 50.35]);
  const [isPlaying, setIsPlaying]           = useState(false);
  const [showResults, setShowResults]       = useState(false);
  const [resultsData, setResultsData]       = useState<Record<string, SimStats>>({});
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsRef     = useRef<Record<string, SimStats>>({});
  const surgeRef     = useRef<{ locId: string | null; ticksLeft: number }>({ locId: null, ticksLeft: 0 });
  const [surgeLocId, setSurgeLocId] = useState<string | null>(null);
  const scenarioRef  = useRef<ScenarioId>(1); // readable inside interval closure

  const resetSimState = (scenario: ScenarioId) => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    statsRef.current = {};
    surgeRef.current = { locId: null, ticksLeft: 0 };
    setSurgeLocId(null);
    setIsPlaying(false);
    setLocations(getScenarioLocations(scenario));
    setSelected(null);
  };

  const handleScenarioChange = (s: ScenarioId) => {
    scenarioRef.current = s;
    setActiveScenario(s);
    resetSimState(s);
  };

  // Keep detail panel in sync with live locations
  useEffect(() => {
    if (selected) {
      const updated = locations.find((l) => l.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [locations]);

  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }

    intervalRef.current = setInterval(() => {
      const scenario = scenarioRef.current;
      const cfg      = SCENARIO_CONFIG[scenario];

      // ── Surge scheduling ──────────────────────────────────────
      if (surgeRef.current.ticksLeft <= 0) {
        const ids  = initialLocations.map((l) => l.id);
        const rand = Math.random();
        if (rand < 0.42) {
          surgeRef.current.locId     = ids[0];
          surgeRef.current.ticksLeft = randBetween(...cfg.surgeDuration);
        } else if (rand < 0.84) {
          surgeRef.current.locId     = ids[1];
          surgeRef.current.ticksLeft = randBetween(...cfg.surgeDuration);
        } else {
          surgeRef.current.locId     = null;
          surgeRef.current.ticksLeft = randBetween(...cfg.calmDuration);
        }
        setSurgeLocId(surgeRef.current.locId);
      }
      surgeRef.current.ticksLeft -= 1;
      const currentSurgeId = surgeRef.current.locId;

      // ── Pooled inventory (Scenario 2) ─────────────────────────
      if (cfg.pooled) {
        setLocations((prev) => {
          const sharedCap = prev[0].stock.capacity;
          const sharedSS  = prev[0].stock.safetyStock;

          // Restock shared pool before demand (order arrives)
          let poolStock = prev[0].stock.current;
          if (!currentSurgeId && poolStock < sharedSS * cfg.restockThresholdFactor) {
            poolStock = Math.round(sharedCap * (cfg.restockFactor[0] + Math.random() * (cfg.restockFactor[1] - cfg.restockFactor[0])));
          }

          // Per-location demands — surge hits one location, other stays calm
          const demandByLoc: Record<string, number> = {};
          prev.forEach((loc) => {
            demandByLoc[loc.id] = loc.id === currentSurgeId
              ? randBetween(...cfg.surgeDemand)
              : randBetween(...cfg.normalDemand);
          });
          const totalDemand = Object.values(demandByLoc).reduce((a, b) => a + b, 0);

          // Record per-location demand stats
          prev.forEach((loc) => {
            if (!statsRef.current[loc.id]) statsRef.current[loc.id] = emptyStats();
            const st = statsRef.current[loc.id];
            st.demands.push(demandByLoc[loc.id]);
            st.totalDemand += demandByLoc[loc.id];
          });

          // Apply combined demand to shared pool
          let newPool = poolStock - totalDemand;
          if (newPool < 0) {
            const lost = Math.abs(newPool);
            newPool = 0;
            // Attribute stockout to the surge location (highest individual demand)
            const surgeLocEntry = prev.find((l) => l.id === currentSurgeId) ?? prev[0];
            statsRef.current[surgeLocEntry.id].demandLost += lost;
            statsRef.current[surgeLocEntry.id].stockouts  += 1;
          }
          newPool = Math.round(Math.min(newPool, sharedCap));
          const stockPct = newPool / sharedCap;

          // Only the hub (index 0, Kamloops) holds inventory; demand point stays unchanged
          return prev.map((loc, i) => {
            if (i !== 0) return loc; // demand point — no stock to update
            return {
              ...loc,
              stock: { ...loc.stock, current: newPool },
              inventory: loc.inventory.map((item) => {
                const maxQ   = itemMaxQty[item.sku] ?? item.quantity;
                const noise  = 0.85 + Math.random() * 0.3;
                const newQty = Math.max(0, Math.round(maxQ * stockPct * noise));
                return { ...item, quantity: newQty, status: deriveItemStatus(newQty, maxQ), lastUpdated: `Today, ${nowStr()}` };
              }),
            };
          });
        });
        return;
      }

      // ── Independent inventory (Scenarios 1 & 3) ───────────────
      setLocations((prev) =>
        prev.map((loc) => {
          const isSurge = loc.id === currentSurgeId;

          // Restock before demand
          let current = loc.stock.current;
          if (!isSurge && current < loc.stock.safetyStock * cfg.restockThresholdFactor) {
            current = Math.round(loc.stock.capacity * (cfg.restockFactor[0] + Math.random() * (cfg.restockFactor[1] - cfg.restockFactor[0])));
          }

          const demand = isSurge ? randBetween(...cfg.surgeDemand) : randBetween(...cfg.normalDemand);

          if (!statsRef.current[loc.id]) statsRef.current[loc.id] = emptyStats();
          const st = statsRef.current[loc.id];
          st.demands.push(demand);
          st.totalDemand += demand;

          let newCurrent = current - demand;
          if (newCurrent < 0) {
            st.demandLost += Math.abs(newCurrent);
            st.stockouts  += 1;
            newCurrent     = 0;
          }
          newCurrent = Math.round(Math.min(newCurrent, loc.stock.capacity));

          const stockPct    = newCurrent / loc.stock.capacity;
          const newInventory = loc.inventory.map((item) => {
            const maxQ   = itemMaxQty[item.sku] ?? item.quantity;
            const noise  = 0.85 + Math.random() * 0.3;
            const newQty = Math.max(0, Math.round(maxQ * stockPct * noise));
            return { ...item, quantity: newQty, status: deriveItemStatus(newQty, maxQ), lastUpdated: `Today, ${nowStr()}` };
          });

          return { ...loc, stock: { ...loc.stock, current: newCurrent }, inventory: newInventory };
        })
      );
    }, 1200);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying]);

  const handlePlayPause = () => {
    if (isPlaying) {
      const captured = { ...statsRef.current };
      if (Object.values(captured).some((s) => s.demands.length > 0)) {
        setResultsData(captured);
        setShowResults(true);
      }
    } else {
      statsRef.current    = {};
      surgeRef.current    = { locId: null, ticksLeft: 0 };
      setSurgeLocId(null);
      setLocations(getScenarioLocations(activeScenario));
    }
    setIsPlaying((p) => !p);
  };

  const toggle    = (loc: LocationData) => setSelected((prev) => (prev?.id === loc.id ? null : loc));
  const zoomIn    = () => setZoom((z) => Math.min(z * 1.5, 12));
  const zoomOut   = () => setZoom((z) => Math.max(z / 1.5, 0.5));
  const resetView = () => { setZoom(1); setCenter([-119.8, 50.35]); };

  const isPooled = SCENARIO_CONFIG[activeScenario].pooled;

  return (
    <div className="relative w-full h-full bg-slate-100 overflow-hidden font-sans">

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="absolute top-0 left-0 right-0 z-20 h-14 flex items-center justify-between px-5 bg-white border-b border-slate-200 shadow-sm">

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
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {([1, 2, 3] as ScenarioId[]).map((s) => {
            const cfg      = SCENARIO_CONFIG[s];
            const isActive = activeScenario === s;
            const disabled = s === 3;
            return (
              <button
                key={s}
                onClick={() => !disabled && handleScenarioChange(s)}
                disabled={disabled}
                title={disabled ? "Coming soon" : cfg.subtitle}
                className={`flex flex-col items-center px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  isActive   ? "bg-white shadow-sm text-slate-900"
                  : disabled ? "text-slate-300 cursor-not-allowed"
                             : "text-slate-500 hover:text-slate-800 cursor-pointer"
                }`}
              >
                <span>{cfg.label}</span>
                <span className={`text-[10px] font-normal mt-0.5 ${isActive ? "text-slate-500" : disabled ? "text-slate-300" : "text-slate-400"}`}>
                  {cfg.subtitle}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: location pills + play/pause */}
        <div className="flex items-center gap-2 shrink-0">
          {locations.map((loc) => {
            const c      = counts(loc);
            const active = selected?.id === loc.id;
            return (
              <button key={loc.id} onClick={() => toggle(loc)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all"
                style={{
                  borderColor:     active ? loc.color : "#e2e8f0",
                  backgroundColor: active ? loc.accent : "#f8fafc",
                  color:           active ? loc.color : "#64748b",
                }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: loc.color }} />
                {loc.name}
                {c.critical > 0 && (
                  <span className="ml-0.5 bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{c.critical}</span>
                )}
              </button>
            );
          })}

          <button onClick={handlePlayPause}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ml-2"
            style={{
              borderColor:     isPlaying ? "#dc2626" : "#2563eb",
              backgroundColor: isPlaying ? "#fee2e2" : "#dbeafe",
              color:           isPlaying ? "#dc2626" : "#2563eb",
            }}
          >
            {isPlaying ? <><Pause className="w-3.5 h-3.5" />Pause</> : <><Play className="w-3.5 h-3.5" />Play</>}
          </button>
        </div>
      </header>

      {/* ── Map ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 top-14">
        <ComposableMap projection="geoMercator" projectionConfig={{ center: [-119.8, 50.35], scale: 4400 }}
          style={{ width: "100%", height: "100%" }}>
          <ZoomableGroup zoom={zoom} center={center}
            onMoveEnd={({ zoom: z, coordinates }) => { setZoom(z); setCenter(coordinates); }}>

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

            {isPooled ? (
              /* ── Scenario 2: one central hub card, both cities connect to it ── */
              <>
                <Line from={locations[0].coordinates} to={CENTRAL_HUB_COORDS}
                  stroke="#0d9488" strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" />
                <Line from={locations[1].coordinates} to={CENTRAL_HUB_COORDS}
                  stroke="#0d9488" strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" />

                {/* Central hub inventory card */}
                {(() => {
                  const hub = locations[0];
                  const s   = hub.stock;
                  const W = 168, H = 118, barW = 138, barH = 9;
                  const fillPct   = s.capacity > 0 ? s.current / s.capacity : 0;
                  const ropPct    = s.capacity > 0 ? s.reorderPoint / s.capacity : 0;
                  const ssPct     = s.capacity > 0 ? s.safetyStock / s.capacity : 0;
                  const fillColor = s.current <= s.safetyStock ? "#ef4444" : s.current <= s.reorderPoint ? "#f59e0b" : "#0d9488";
                  const anySurge  = surgeLocId !== null;
                  return (
                    <Marker coordinates={CENTRAL_HUB_COORDS}
                      onClick={() => toggle(hub)} style={{ cursor: "pointer" }}
                    >
                      <g transform={`translate(${-W / 2}, ${-H / 2})`} style={{ pointerEvents: "none" }}>
                        <rect x={2} y={2} width={W} height={H} rx={7} fill="rgba(0,0,0,0.10)" />
                        <rect width={W} height={H} rx={7} fill="white"
                          stroke={anySurge ? "#ef4444" : "#0d9488"}
                          strokeWidth={anySurge ? 2.5 : 1.5}
                          strokeOpacity={anySurge ? 0.9 : 0.6} />
                        <rect width={4} height={H} rx={2} fill={anySurge ? "#ef4444" : "#0d9488"} />
                        <text x={14} y={16} fontSize={7.5} fontWeight="700" fill="#94a3b8" letterSpacing="0.08em" fontFamily="system-ui, sans-serif">CENTRAL HUB</text>
                        {anySurge ? (
                          <g>
                            <rect x={W - 54} y={5} width={46} height={14} rx={4} fill="#ef4444" />
                            <text x={W - 31} y={14.5} textAnchor="middle" fontSize={7.5} fontWeight="800" fill="white" fontFamily="system-ui, sans-serif">⚡ SURGE</text>
                          </g>
                        ) : (
                          <g>
                            <rect x={W - 46} y={5} width={38} height={14} rx={4} fill="#0d9488" fillOpacity={0.15} stroke="#0d9488" strokeWidth={1} strokeOpacity={0.4} />
                            <text x={W - 27} y={14.5} textAnchor="middle" fontSize={7} fontWeight="700" fill="#0d9488" fontFamily="system-ui, sans-serif">◎ HUB</text>
                          </g>
                        )}
                        <text x={14} y={33} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Current Level</text>
                        <text x={W - 10} y={33} textAnchor="end" fontSize={9} fontWeight="700" fill={fillColor} fontFamily="system-ui, sans-serif">
                          {s.current.toLocaleString()} {s.unit}
                        </text>
                        <line x1={14} y1={39} x2={W - 10} y2={39} stroke="#f1f5f9" strokeWidth={1} />
                        <circle cx={17.5} cy={51} r={3.5} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
                        <text x={24} y={55} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Reorder Point</text>
                        <text x={W - 10} y={55} textAnchor="end" fontSize={9} fontWeight="600" fill="#d97706" fontFamily="system-ui, sans-serif">
                          {s.reorderPoint.toLocaleString()} {s.unit}
                        </text>
                        <circle cx={17.5} cy={69} r={3.5} fill="#fee2e2" stroke="#ef4444" strokeWidth={1} />
                        <text x={24} y={73} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Safety Stock</text>
                        <text x={W - 10} y={73} textAnchor="end" fontSize={9} fontWeight="600" fill="#dc2626" fontFamily="system-ui, sans-serif">
                          {s.safetyStock.toLocaleString()} {s.unit}
                        </text>
                        <g transform="translate(14, 84)">
                          <rect width={barW} height={barH} rx={4} fill="#f1f5f9" />
                          <rect width={Math.max(barW * fillPct, barH)} height={barH} rx={4} fill={fillColor} fillOpacity={0.8} />
                          <line x1={barW * ropPct} y1={-3} x2={barW * ropPct} y2={barH + 3} stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" />
                          <line x1={barW * ssPct}  y1={-3} x2={barW * ssPct}  y2={barH + 3} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
                          <text x={barW * ropPct} y={barH + 13} textAnchor="middle" fontSize={7} fill="#d97706" fontWeight="600" fontFamily="system-ui, sans-serif">ROP</text>
                          <text x={barW * ssPct}  y={barH + 13} textAnchor="middle" fontSize={7} fill="#dc2626" fontWeight="600" fontFamily="system-ui, sans-serif">SS</text>
                        </g>
                      </g>
                    </Marker>
                  );
                })()}

                {/* City pins — no individual inventory cards */}
                {locations.map((loc) => {
                  const isSelected = selected?.id === loc.id;
                  const isHovered  = hovered === loc.id;
                  const active     = isSelected || isHovered;
                  const c          = counts(loc);
                  const isSurging  = surgeLocId === loc.id;
                  const pinR       = active ? 18 : 13;
                  return (
                    <Marker key={loc.id} coordinates={loc.coordinates}
                      onClick={() => toggle(loc)}
                      onMouseEnter={() => setHovered(loc.id)}
                      onMouseLeave={() => setHovered(null)}
                      style={{ cursor: "pointer" }}
                    >
                      {isSurging && <circle r={38} fill="none" stroke="#ef4444" strokeWidth={2} strokeOpacity={0.5} strokeDasharray="5 3" />}
                      {active && <circle r={30} fill={loc.color} fillOpacity={0.08} stroke={loc.color} strokeWidth={1} strokeOpacity={0.25} />}
                      <circle r={pinR} fill={loc.color} fillOpacity={0.15} transform="translate(1,1)" />
                      <circle r={pinR} fill={isSelected ? loc.color : "white"} stroke={loc.color} strokeWidth={2.5} />
                      <circle r={5} fill={isSelected ? "white" : loc.color} />
                      {isSurging && (
                        <g transform={`translate(${active ? 16 : 11}, ${active ? -16 : -11})`}>
                          <circle r={8} fill="#ef4444" stroke="white" strokeWidth={1.5} />
                          <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={8} fontWeight="800">⚡</text>
                        </g>
                      )}
                      {!isSurging && c.critical > 0 && (
                        <g transform={`translate(${active ? 16 : 11}, ${active ? -16 : -11})`}>
                          <circle r={7} fill="#ef4444" stroke="white" strokeWidth={1.5} />
                          <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={8} fontWeight="800">{c.critical}</text>
                        </g>
                      )}
                      <text textAnchor="middle" y={active ? 34 : 28} fill={loc.color} fontSize={11} fontWeight="700"
                        fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>
                        {loc.name}
                      </text>
                      {active && (
                        <text textAnchor="middle" y={47} fill="#64748b" fontSize={9.5}
                          fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>
                          {loc.totalSkus} SKUs · {loc.totalValue}
                        </text>
                      )}
                    </Marker>
                  );
                })}
              </>
            ) : (
              /* ── Scenarios 1 & 3: individual card per location ── */
              <>
                <Line
                  from={locations[0].coordinates} to={locations[1].coordinates}
                  stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" strokeLinecap="round"
                />

                {locations.map((loc) => {
                  const isSelected = selected?.id === loc.id;
                  const isHovered  = hovered === loc.id;
                  const active     = isSelected || isHovered;
                  const c          = counts(loc);
                  const s          = loc.stock;
                  const isSurging  = surgeLocId === loc.id;

                  const W = 168, H = 118, barW = 138, barH = 9;
                  const pinR = active ? 18 : 13;

                  const fillPct   = s.capacity > 0 ? s.current / s.capacity : 0;
                  const ropPct    = s.capacity > 0 ? s.reorderPoint / s.capacity : 0;
                  const ssPct     = s.capacity > 0 ? s.safetyStock / s.capacity : 0;
                  const fillColor = s.current <= s.safetyStock ? "#ef4444" : s.current <= s.reorderPoint ? "#f59e0b" : loc.color;

                  const gap    = 14;
                  const cardX  = loc.cardSide === "left" ? -(pinR + gap + W) : pinR + gap;
                  const cardY  = -H / 2;
                  const connX1 = loc.cardSide === "left" ? -pinR : pinR;
                  const connX2 = loc.cardSide === "left" ? -(pinR + gap) : pinR + gap;

                  return (
                    <Marker key={loc.id} coordinates={loc.coordinates}
                      onClick={() => toggle(loc)}
                      onMouseEnter={() => setHovered(loc.id)}
                      onMouseLeave={() => setHovered(null)}
                      style={{ cursor: "pointer" }}
                    >
                      <g transform={`translate(${cardX}, ${cardY})`} style={{ pointerEvents: "none" }}>
                        <rect x={2} y={2} width={W} height={H} rx={7} fill="rgba(0,0,0,0.10)" />
                        <rect width={W} height={H} rx={7} fill="white"
                          stroke={isSurging ? "#ef4444" : loc.color}
                          strokeWidth={isSurging ? 2.5 : 1.5}
                          strokeOpacity={isSurging ? 0.9 : 0.35} />
                        <rect width={4} height={H} rx={2} fill={isSurging ? "#ef4444" : loc.color} />
                        {isSurging && (
                          <g>
                            <rect x={W - 54} y={5} width={46} height={14} rx={4} fill="#ef4444" />
                            <text x={W - 31} y={14.5} textAnchor="middle" fontSize={7.5} fontWeight="800" fill="white" fontFamily="system-ui, sans-serif">⚡ SURGE</text>
                          </g>
                        )}
                        <text x={14} y={16} fontSize={7.5} fontWeight="700" fill="#94a3b8" letterSpacing="0.08em" fontFamily="system-ui, sans-serif">INVENTORY STATUS</text>
                        <text x={14} y={33} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Current Level</text>
                        <text x={W - 10} y={33} textAnchor="end" fontSize={9} fontWeight="700" fill={fillColor} fontFamily="system-ui, sans-serif">
                          {s.current.toLocaleString()} {s.unit}
                        </text>
                        <line x1={14} y1={39} x2={W - 10} y2={39} stroke="#f1f5f9" strokeWidth={1} />
                        <circle cx={17.5} cy={51} r={3.5} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
                        <text x={24} y={55} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Reorder Point</text>
                        <text x={W - 10} y={55} textAnchor="end" fontSize={9} fontWeight="600" fill="#d97706" fontFamily="system-ui, sans-serif">
                          {s.reorderPoint.toLocaleString()} {s.unit}
                        </text>
                        <circle cx={17.5} cy={69} r={3.5} fill="#fee2e2" stroke="#ef4444" strokeWidth={1} />
                        <text x={24} y={73} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Safety Stock</text>
                        <text x={W - 10} y={73} textAnchor="end" fontSize={9} fontWeight="600" fill="#dc2626" fontFamily="system-ui, sans-serif">
                          {s.safetyStock.toLocaleString()} {s.unit}
                        </text>
                        <g transform="translate(14, 84)">
                          <rect width={barW} height={barH} rx={4} fill="#f1f5f9" />
                          <rect width={Math.max(barW * fillPct, barH)} height={barH} rx={4} fill={fillColor} fillOpacity={0.8} />
                          <line x1={barW * ropPct} y1={-3} x2={barW * ropPct} y2={barH + 3} stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" />
                          <line x1={barW * ssPct}  y1={-3} x2={barW * ssPct}  y2={barH + 3} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
                          <text x={barW * ropPct} y={barH + 13} textAnchor="middle" fontSize={7} fill="#d97706" fontWeight="600" fontFamily="system-ui, sans-serif">ROP</text>
                          <text x={barW * ssPct}  y={barH + 13} textAnchor="middle" fontSize={7} fill="#dc2626" fontWeight="600" fontFamily="system-ui, sans-serif">SS</text>
                        </g>
                      </g>
                      <line x1={connX1} y1={0} x2={connX2} y2={0}
                        stroke={loc.color} strokeWidth={1.5} strokeOpacity={0.4}
                        strokeDasharray="3 2" style={{ pointerEvents: "none" }} />
                      {isSurging && <circle r={38} fill="none" stroke="#ef4444" strokeWidth={2} strokeOpacity={0.5} strokeDasharray="5 3" />}
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
                      <text textAnchor="middle" y={active ? 34 : 28} fill={loc.color} fontSize={11} fontWeight="700"
                        fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>
                        {loc.name}
                      </text>
                      {active && (
                        <text textAnchor="middle" y={47} fill="#64748b" fontSize={9.5}
                          fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>
                          {loc.totalSkus} SKUs · {loc.totalValue}
                        </text>
                      )}
                    </Marker>
                  );
                })}
              </>
            )}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* ── Zoom controls ────────────────────────────────────────── */}
      <div className="absolute bottom-5 right-5 z-10 flex flex-col gap-1.5">
        <button onClick={zoomIn}    className="w-9 h-9 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors" title="Zoom in"><Plus className="w-4 h-4" /></button>
        <button onClick={zoomOut}   className="w-9 h-9 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors" title="Zoom out"><Minus className="w-4 h-4" /></button>
        <button onClick={resetView} className="w-9 h-9 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors" title="Reset view"><RotateCcw className="w-3.5 h-3.5" /></button>
      </div>

      {/* ── Legend ──────────────────────────────────────────────── */}
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
          <div className="flex items-center gap-2">
            <svg width="20" height="6" viewBox="0 0 20 6">
              <line x1="0" y1="3" x2="20" y2="3" stroke={isPooled ? "#0d9488" : "#94a3b8"} strokeWidth="1.5" strokeDasharray={isPooled ? "6 3" : "4 3"} strokeLinecap="round" />
            </svg>
            <span className="text-slate-500">{isPooled ? "Central supply flow" : "Supply route"}</span>
          </div>
        </div>
      </div>

      {/* ── Detail panel ────────────────────────────────────────── */}
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
                  {c.critical > 0 && <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-[11px] font-semibold"><AlertCircle className="w-3 h-3" /> {c.critical} Critical</span>}
                  {c.low > 0      && <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-[11px] font-semibold"><TrendingUp className="w-3 h-3" /> {c.low} Low Stock</span>}
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-[11px] font-semibold"><CheckCircle className="w-3 h-3" /> {c.healthy} Healthy</span>
                </div>
              );
            })()}
          </div>
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

      {/* ── Results Modal ────────────────────────────────────────── */}
      {showResults && (
        <ResultsModal locations={locations} results={resultsData} isPooled={isPooled} onClose={() => setShowResults(false)} />
      )}
    </div>
  );
}
