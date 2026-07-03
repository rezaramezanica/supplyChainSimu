import React, { useState, useEffect, useRef } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
  ZoomableGroup,
} from "react-simple-maps";
import { Package, MapPin, X, TrendingUp, AlertCircle, CheckCircle, Warehouse, Plus, Minus, RotateCcw, Play, Pause } from "lucide-react";

// Canada provinces GeoJSON — provinces filterable by name
const CANADA_GEO =
  "https://cdn.jsdelivr.net/gh/codeforamerica/click_that_hood@master/public/data/canada.geojson";

// US states for southern context
const US_GEO =
  "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type InventoryItem = {
  category: string;
  sku: string;
  quantity: number;
  unit: string;
  status: "healthy" | "low" | "critical";
  lastUpdated: string;
};

type StockMetrics = {
  current: number;
  reorderPoint: number;
  safetyStock: number;
  capacity: number;
  unit: string;
};

type LocationData = {
  id: string;
  name: string;
  coordinates: [number, number];
  color: string;
  lightColor: string;
  accent: string;
  address: string;
  warehouseSize: string;
  manager: string;
  phone: string;
  inventory: InventoryItem[];
  totalSkus: number;
  totalValue: string;
  stock: StockMetrics;
  cardSide: "left" | "right";
};

const initialLocations: LocationData[] = [
  {
    id: "kamloops",
    name: "Kamloops",
    coordinates: [-120.3273, 50.6745],
    color: "#2563eb",
    lightColor: "#93c5fd",
    accent: "#dbeafe",
    address: "1250 Summit Drive, Kamloops, BC V2C 5R8",
    warehouseSize: "42,000 sq ft",
    manager: "Sandra Kowalski",
    phone: "(250) 374-8801",
    totalSkus: 847,
    totalValue: "$3.2M",
    cardSide: "left",
    stock: { current: 3000, reorderPoint: 1500, safetyStock: 800, capacity: 5000, unit: "units" },
    inventory: [
      { category: "Lumber & Wood Products", sku: "LWP-001", quantity: 12400, unit: "board ft", status: "healthy", lastUpdated: "Today, 9:14 AM" },
      { category: "Plumbing Supplies", sku: "PLM-204", quantity: 380, unit: "units", status: "healthy", lastUpdated: "Today, 8:50 AM" },
      { category: "Electrical Components", sku: "ELC-088", quantity: 94, unit: "units", status: "low", lastUpdated: "Yesterday, 4:30 PM" },
      { category: "HVAC Equipment", sku: "HVC-312", quantity: 17, unit: "units", status: "healthy", lastUpdated: "Today, 7:00 AM" },
      { category: "Concrete & Masonry", sku: "CNM-055", quantity: 8200, unit: "kg", status: "healthy", lastUpdated: "Today, 6:45 AM" },
      { category: "Safety Gear", sku: "SFT-190", quantity: 23, unit: "units", status: "critical", lastUpdated: "2 days ago" },
      { category: "Hand Tools", sku: "HTL-411", quantity: 610, unit: "units", status: "healthy", lastUpdated: "Today, 10:02 AM" },
      { category: "Roofing Materials", sku: "RFM-077", quantity: 1850, unit: "sq ft", status: "healthy", lastUpdated: "Yesterday, 2:15 PM" },
    ],
  },
  {
    id: "kelowna",
    name: "Kelowna",
    coordinates: [-119.496, 49.888],
    color: "#16a34a",
    lightColor: "#86efac",
    accent: "#dcfce7",
    address: "885 Rutland Road N, Kelowna, BC V1X 3B6",
    warehouseSize: "31,500 sq ft",
    manager: "Mark Thiessen",
    phone: "(250) 765-4422",
    totalSkus: 614,
    totalValue: "$2.1M",
    cardSide: "right",
    stock: { current: 3000, reorderPoint: 1200, safetyStock: 600, capacity: 4000, unit: "units" },
    inventory: [
      { category: "Agricultural Supplies", sku: "AGR-001", quantity: 6700, unit: "kg", status: "healthy", lastUpdated: "Today, 8:30 AM" },
      { category: "Irrigation Systems", sku: "IRR-088", quantity: 142, unit: "units", status: "healthy", lastUpdated: "Today, 9:00 AM" },
      { category: "Lumber & Wood Products", sku: "LWP-002", quantity: 8900, unit: "board ft", status: "low", lastUpdated: "Yesterday, 5:00 PM" },
      { category: "Electrical Components", sku: "ELC-091", quantity: 210, unit: "units", status: "healthy", lastUpdated: "Today, 7:45 AM" },
      { category: "Plumbing Supplies", sku: "PLM-210", quantity: 55, unit: "units", status: "low", lastUpdated: "Today, 6:20 AM" },
      { category: "Concrete & Masonry", sku: "CNM-056", quantity: 4100, unit: "kg", status: "healthy", lastUpdated: "Today, 8:00 AM" },
      { category: "Fertilizers & Soil", sku: "FRT-033", quantity: 3200, unit: "kg", status: "healthy", lastUpdated: "Yesterday, 3:00 PM" },
      { category: "Safety Gear", sku: "SFT-195", quantity: 88, unit: "units", status: "healthy", lastUpdated: "Today, 9:30 AM" },
    ],
  },
];

function deriveItemStatus(quantity: number, maxQty: number): "healthy" | "low" | "critical" {
  const pct = quantity / maxQty;
  if (pct <= 0.1) return "critical";
  if (pct <= 0.3) return "low";
  return "healthy";
}

const statusConfig = {
  healthy: { color: "text-green-600", bg: "bg-green-50", border: "border-green-100", label: "Healthy", dot: "bg-green-500" },
  low: { color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100", label: "Low Stock", dot: "bg-amber-500" },
  critical: { color: "text-red-600", bg: "bg-red-50", border: "border-red-100", label: "Critical", dot: "bg-red-500" },
};

function counts(loc: LocationData) {
  return {
    healthy: loc.inventory.filter((i) => i.status === "healthy").length,
    low: loc.inventory.filter((i) => i.status === "low").length,
    critical: loc.inventory.filter((i) => i.status === "critical").length,
  };
}

// Store original max quantities per item for simulation scaling
const itemMaxQty: Record<string, number> = {};
initialLocations.forEach((loc) => {
  loc.inventory.forEach((item) => {
    itemMaxQty[item.sku] = item.quantity;
  });
});

function nowStr() {
  return new Date().toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
}

export function BCMap() {
  const [locations, setLocations] = useState<LocationData[]>(initialLocations);
  const [selected, setSelected] = useState<LocationData | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([-119.8, 50.35]);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep selected in sync with locations state so the detail panel updates live
  useEffect(() => {
    if (selected) {
      const updated = locations.find((l) => l.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [locations]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setLocations((prev) =>
          prev.map((loc) => {
            // Drain stock by a random amount each tick
            let newCurrent = loc.stock.current - Math.floor(Math.random() * 220 + 80);

            // Restock when hitting near-zero
            if (newCurrent < loc.stock.safetyStock * 0.4) {
              newCurrent = loc.stock.capacity * (0.7 + Math.random() * 0.2);
            }

            newCurrent = Math.round(Math.max(0, Math.min(newCurrent, loc.stock.capacity)));

            // Update inventory items proportionally to overall stock level
            const stockPct = newCurrent / loc.stock.capacity;
            const newInventory = loc.inventory.map((item) => {
              const maxQ = itemMaxQty[item.sku] ?? item.quantity;
              // Each item fluctuates independently with some noise
              const noise = 0.85 + Math.random() * 0.3;
              const newQty = Math.max(0, Math.round(maxQ * stockPct * noise));
              return {
                ...item,
                quantity: newQty,
                status: deriveItemStatus(newQty, maxQ),
                lastUpdated: `Today, ${nowStr()}`,
              };
            });

            return { ...loc, stock: { ...loc.stock, current: newCurrent }, inventory: newInventory };
          })
        );
      }, 1200);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying]);

  const toggle = (loc: LocationData) =>
    setSelected((prev) => (prev?.id === loc.id ? null : loc));

  const zoomIn = () => setZoom((z) => Math.min(z * 1.5, 12));
  const zoomOut = () => setZoom((z) => Math.max(z / 1.5, 0.5));
  const resetView = () => { setZoom(1); setCenter([-119.8, 50.35]); };

  return (
    <div className="relative w-full h-full bg-slate-100 overflow-hidden font-sans">

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="absolute top-0 left-0 right-0 z-20 h-14 flex items-center justify-between px-5 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
            <Warehouse className="w-4 h-4 text-white" />
          </div>
          <div className="leading-none">
            <p className="text-sm font-semibold text-slate-900">BC Inventory Network</p>
            <p className="text-[11px] text-slate-400 mt-0.5">British Columbia · 2 warehouse locations</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {locations.map((loc) => {
            const c = counts(loc);
            const active = selected?.id === loc.id;
            return (
              <button
                key={loc.id}
                onClick={() => toggle(loc)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all"
                style={{
                  borderColor: active ? loc.color : "#e2e8f0",
                  backgroundColor: active ? loc.accent : "#f8fafc",
                  color: active ? loc.color : "#64748b",
                }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: loc.color }} />
                {loc.name}
                {c.critical > 0 && (
                  <span className="ml-0.5 bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {c.critical}
                  </span>
                )}
              </button>
            );
          })}

          {/* Play / Pause button */}
          <button
            onClick={() => setIsPlaying((p) => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ml-2"
            style={{
              borderColor: isPlaying ? "#dc2626" : "#2563eb",
              backgroundColor: isPlaying ? "#fee2e2" : "#dbeafe",
              color: isPlaying ? "#dc2626" : "#2563eb",
            }}
            title={isPlaying ? "Pause simulation" : "Play simulation"}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Play
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── Map ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 top-14">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: [-119.8, 50.35], scale: 4400 }}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup
            zoom={zoom}
            center={center}
            onMoveEnd={({ zoom: z, coordinates }) => {
              setZoom(z);
              setCenter(coordinates);
            }}
          >
          {/* US states — southern context, muted */}
          <Geographies geography={US_GEO}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#dde3ea"
                  stroke="#c8d0da"
                  strokeWidth={0.6}
                  style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }}
                />
              ))
            }
          </Geographies>

          {/* Canadian provinces */}
          <Geographies geography={CANADA_GEO}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const isBC = geo.properties.name === "British Columbia";
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={isBC ? "#bfdbfe" : "#dde3ea"}
                    stroke={isBC ? "#60a5fa" : "#c8d0da"}
                    strokeWidth={isBC ? 1.2 : 0.6}
                    style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }}
                  />
                );
              })
            }
          </Geographies>

          {/* Route line between locations */}
          <Line
            from={locations[0].coordinates}
            to={locations[1].coordinates}
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            strokeLinecap="round"
          />

          {/* Markers */}
          {locations.map((loc) => {
            const isSelected = selected?.id === loc.id;
            const isHovered = hovered === loc.id;
            const active = isSelected || isHovered;
            const c = counts(loc);
            const s = loc.stock;

            // Card geometry
            const W = 168;
            const H = 118;
            const barW = 138;
            const barH = 9;
            const pinR = active ? 18 : 13;

            const fillPct = s.current / s.capacity;
            const ropPct  = s.reorderPoint / s.capacity;
            const ssPct   = s.safetyStock / s.capacity;

            const fillColor =
              s.current <= s.safetyStock ? "#ef4444" :
              s.current <= s.reorderPoint ? "#f59e0b" : loc.color;

            // Position card to left or right of pin
            const gap = 14;
            const cardX = loc.cardSide === "left" ? -(pinR + gap + W) : pinR + gap;
            const cardY = -H / 2;
            // Connector from pin edge to card
            const connX1 = loc.cardSide === "left" ? -pinR : pinR;
            const connX2 = loc.cardSide === "left" ? -(pinR + gap) : pinR + gap;

            return (
              <Marker
                key={loc.id}
                coordinates={loc.coordinates}
                onClick={() => toggle(loc)}
                onMouseEnter={() => setHovered(loc.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                {/* ── Inventory card ── */}
                <g transform={`translate(${cardX}, ${cardY})`} style={{ pointerEvents: "none" }}>
                  {/* Drop shadow */}
                  <rect x={2} y={2} width={W} height={H} rx={7} fill="rgba(0,0,0,0.10)" />
                  {/* Card background */}
                  <rect width={W} height={H} rx={7} fill="white" stroke={loc.color} strokeWidth={1.5} strokeOpacity={0.35} />
                  {/* Left accent stripe */}
                  <rect width={4} height={H} rx={2} fill={loc.color} />

                  {/* Header label */}
                  <text x={14} y={16} fontSize={7.5} fontWeight="700" fill="#94a3b8" letterSpacing="0.08em" fontFamily="system-ui, sans-serif">
                    INVENTORY STATUS
                  </text>

                  {/* ── Metric rows ── */}
                  {/* Current Level */}
                  <text x={14} y={33} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Current Level</text>
                  <text x={W - 10} y={33} textAnchor="end" fontSize={9} fontWeight="700" fill={fillColor} fontFamily="system-ui, sans-serif">
                    {s.current.toLocaleString()} {s.unit}
                  </text>

                  {/* Divider */}
                  <line x1={14} y1={39} x2={W - 10} y2={39} stroke="#f1f5f9" strokeWidth={1} />

                  {/* Reorder Point */}
                  <circle cx={14 + 3.5} cy={51} r={3.5} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
                  <text x={24} y={55} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Reorder Point</text>
                  <text x={W - 10} y={55} textAnchor="end" fontSize={9} fontWeight="600" fill="#d97706" fontFamily="system-ui, sans-serif">
                    {s.reorderPoint.toLocaleString()} {s.unit}
                  </text>

                  {/* Safety Stock */}
                  <circle cx={14 + 3.5} cy={69} r={3.5} fill="#fee2e2" stroke="#ef4444" strokeWidth={1} />
                  <text x={24} y={73} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Safety Stock</text>
                  <text x={W - 10} y={73} textAnchor="end" fontSize={9} fontWeight="600" fill="#dc2626" fontFamily="system-ui, sans-serif">
                    {s.safetyStock.toLocaleString()} {s.unit}
                  </text>

                  {/* ── Stock bar ── */}
                  <g transform={`translate(14, 84)`}>
                    {/* Track */}
                    <rect width={barW} height={barH} rx={4} fill="#f1f5f9" />
                    {/* Fill */}
                    <rect width={Math.max(barW * fillPct, barH)} height={barH} rx={4} fill={fillColor} fillOpacity={0.8} />

                    {/* Reorder point marker line */}
                    <line
                      x1={barW * ropPct} y1={-3}
                      x2={barW * ropPct} y2={barH + 3}
                      stroke="#f59e0b" strokeWidth={2} strokeLinecap="round"
                    />
                    {/* Safety stock marker line */}
                    <line
                      x1={barW * ssPct} y1={-3}
                      x2={barW * ssPct} y2={barH + 3}
                      stroke="#ef4444" strokeWidth={2} strokeLinecap="round"
                    />

                    {/* Tick labels */}
                    <text x={barW * ropPct} y={barH + 13} textAnchor="middle" fontSize={7} fill="#d97706" fontWeight="600" fontFamily="system-ui, sans-serif">ROP</text>
                    <text x={barW * ssPct} y={barH + 13} textAnchor="middle" fontSize={7} fill="#dc2626" fontWeight="600" fontFamily="system-ui, sans-serif">SS</text>
                  </g>
                </g>

                {/* Connector line from pin to card */}
                <line
                  x1={connX1} y1={0}
                  x2={connX2} y2={0}
                  stroke={loc.color}
                  strokeWidth={1.5}
                  strokeOpacity={0.4}
                  strokeDasharray="3 2"
                  style={{ pointerEvents: "none" }}
                />

                {/* ── Pin ── */}
                {active && (
                  <circle r={30} fill={loc.color} fillOpacity={0.08} stroke={loc.color} strokeWidth={1} strokeOpacity={0.25} />
                )}
                <circle r={pinR} fill={loc.color} fillOpacity={0.15} transform="translate(1,1)" />
                <circle r={pinR} fill={isSelected ? loc.color : "white"} stroke={loc.color} strokeWidth={2.5} />
                <circle r={5} fill={isSelected ? "white" : loc.color} />

                {/* Critical badge */}
                {c.critical > 0 && (
                  <g transform={`translate(${active ? 16 : 11}, ${active ? -16 : -11})`}>
                    <circle r={7} fill="#ef4444" stroke="white" strokeWidth={1.5} />
                    <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={8} fontWeight="800">
                      {c.critical}
                    </text>
                  </g>
                )}

                {/* City label */}
                <text
                  textAnchor="middle"
                  y={active ? 34 : 28}
                  fill={loc.color}
                  fontSize={11}
                  fontWeight="700"
                  fontFamily="system-ui, sans-serif"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {loc.name}
                </text>
                {active && (
                  <text
                    textAnchor="middle"
                    y={47}
                    fill="#64748b"
                    fontSize={9.5}
                    fontFamily="system-ui, sans-serif"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {loc.totalSkus} SKUs · {loc.totalValue}
                  </text>
                )}
              </Marker>
            );
          })}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* ── Zoom controls ────────────────────────────────────────── */}
      <div className="absolute bottom-5 right-5 z-10 flex flex-col gap-1.5">
        <button
          onClick={zoomIn}
          className="w-9 h-9 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          title="Zoom in"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={zoomOut}
          className="w-9 h-9 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          title="Zoom out"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={resetView}
          className="w-9 h-9 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
          title="Reset view"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
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
              <line x1="0" y1="3" x2="20" y2="3" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
            </svg>
            <span className="text-slate-500">Supply route</span>
          </div>
        </div>
      </div>

      {/* ── Detail panel ────────────────────────────────────────── */}
      {selected && (
        <div
          key={selected.id}
          className="absolute top-[68px] right-4 bottom-4 z-20 w-[390px] bg-white rounded-2xl border border-slate-200 shadow-xl flex flex-col overflow-hidden"
        >
          {/* Panel header */}
          <div className="p-5 shrink-0" style={{ backgroundColor: selected.accent }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <MapPin className="w-4 h-4 shrink-0" style={{ color: selected.color }} />
                  <h2 className="text-base font-bold text-slate-900 truncate">{selected.name} Warehouse</h2>
                </div>
                <p className="text-xs text-slate-500 ml-6">{selected.address}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="shrink-0 w-7 h-7 rounded-lg bg-white/80 hover:bg-white flex items-center justify-center transition-colors border border-white/50"
              >
                <X className="w-3.5 h-3.5 text-slate-500" />
              </button>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: "Total SKUs", value: selected.totalSkus.toLocaleString() },
                { label: "Est. Value", value: selected.totalValue },
                { label: "Footprint", value: selected.warehouseSize },
              ].map((s) => (
                <div key={s.label} className="bg-white/60 rounded-lg px-3 py-2 backdrop-blur-sm">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide leading-none">{s.label}</p>
                  <p className="text-sm font-bold text-slate-900 mt-1 leading-none">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Alert pills */}
            {(() => {
              const c = counts(selected);
              return (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.critical > 0 && (
                    <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-[11px] font-semibold">
                      <AlertCircle className="w-3 h-3" /> {c.critical} Critical
                    </span>
                  )}
                  {c.low > 0 && (
                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-[11px] font-semibold">
                      <TrendingUp className="w-3 h-3" /> {c.low} Low Stock
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-[11px] font-semibold">
                    <CheckCircle className="w-3 h-3" /> {c.healthy} Healthy
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Contact strip */}
          <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-5 text-xs text-slate-500 shrink-0 bg-slate-50/60">
            <span>
              <span className="font-medium text-slate-700">Manager: </span>{selected.manager}
            </span>
            <span>
              <span className="font-medium text-slate-700">Tel: </span>{selected.phone}
            </span>
          </div>

          {/* Inventory list */}
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
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}
                      >
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
    </div>
  );
}
