import React from "react";
import { X } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";
import type { LocationData, SimStats } from "../simulation/types";
import { StatCard } from "./StatCard";
import { createEmptyStats } from "../simulation/stepFunctions";

function normalPDF(x: number, mean: number, standardDeviation: number) {
  return (1 / (standardDeviation * Math.sqrt(2 * Math.PI))) *
    Math.exp(-0.5 * ((x - mean) / standardDeviation) ** 2);
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

function LocationResult({
  gradientId, name, subtitle, color, accentBg, accentBorder, stats, lastStatCard, showDivider,
}: {
  gradientId: string;
  name: string;
  subtitle: string;
  color: string;
  accentBg: string;
  accentBorder: string;
  stats: SimStats;
  lastStatCard: React.ReactNode;
  showDivider?: boolean;
}) {
  const { mean, standardDeviation, points } = buildCurveData(stats.demands);
  const fillRate     = stats.totalDemand > 0 ? (1 - stats.demandLost / stats.totalDemand) * 100 : 100;
  const serviceLevel = stats.replenishmentOrders > 0 ? (1 - stats.stockoutInstances / stats.replenishmentOrders) * 100 : 100;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <h3 className="text-base font-bold text-slate-800">{name}</h3>
        <span className="text-xs text-slate-400 ml-1">· {subtitle}</span>
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
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.02} />
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
                <ReferenceLine x={Math.round(mean)} stroke={color} strokeWidth={1.5} strokeDasharray="4 3"
                  label={{ value: "μ", position: "top", fill: color, fontSize: 10, fontWeight: 700 }} />
                <Area type="monotone" dataKey="probability" stroke={color} strokeWidth={2}
                  fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 3, fill: color }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-xs text-slate-400">No data recorded</div>
          )}
        </div>

        <div className="flex flex-col justify-center gap-2">
          <div className="rounded-xl px-4 py-3 border" style={{ backgroundColor: accentBg, borderColor: accentBorder }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color }}>Fill Rate</p>
                <p className="text-2xl font-black mt-0.5" style={{ color }}>{fillRate.toFixed(1)}%</p>
                <p className="text-[10px] text-slate-500 mt-0.5">1 − Lost / Total</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color }}>Service Level</p>
                <p className="text-2xl font-black mt-0.5" style={{ color }}>{serviceLevel.toFixed(1)}%</p>
                <p className="text-[10px] text-slate-500 mt-0.5">1 − Stockouts / Orders</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Stockout Instances" value={stats.stockoutInstances.toString()} sub="positive→zero transitions" alert={stats.stockoutInstances > 0} />
            <StatCard label="Replenishment Orders" value={stats.replenishmentOrders.toString()} sub="orders placed" />
            <StatCard label="Total Demand Lost" value={`${stats.demandLost.toLocaleString()} units`} sub="unmet demand" alert={stats.demandLost > 0} />
            {lastStatCard}
          </div>
        </div>
      </div>

      {showDivider && <div className="mt-6 border-t border-slate-100" />}
    </div>
  );
}

export function ResultsModal({
  locations, results, isPooled, isScenario3, distributionCenterInitialInventory, onClose,
}: {
  locations: LocationData[];
  results: Record<string, SimStats>;
  isPooled: boolean;
  isScenario3: boolean;
  distributionCenterInitialInventory: number;
  onClose: () => void;
}) {
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
          {/* S2: single Central Hub entry */}
          {isPooled && (
            <LocationResult
              gradientId="grad-hub"
              name="Central Hub Warehouse"
              subtitle={`${(results["kamloops"] ?? createEmptyStats()).demands.length} hours simulated · serving Kamloops & Kelowna`}
              color="#0d9488"
              accentBg="#f0fdfa"
              accentBorder="#99f6e4"
              stats={results["kamloops"] ?? createEmptyStats()}
              lastStatCard={<StatCard label="Total Demand" value={`${(results["kamloops"] ?? createEmptyStats()).totalDemand.toLocaleString()} units`} sub={`over ${(results["kamloops"] ?? createEmptyStats()).demands.length} hours`} />}
            />
          )}

          {/* S3: DC summary row */}
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

          {/* S1 & S3: per-location entries */}
          {!isPooled && locations.map((loc, i) => {
            const stats = results[loc.id] ?? createEmptyStats();
            return (
              <LocationResult
                key={loc.id}
                gradientId={`grad-${loc.id}`}
                name={`${loc.name} Warehouse`}
                subtitle={`${stats.demands.length} hours simulated`}
                color={loc.color}
                accentBg={loc.accent}
                accentBorder={loc.lightColor}
                stats={stats}
                lastStatCard={
                  isScenario3
                    ? <StatCard label="Served from DC" value={`${stats.demandServedFromDC.toLocaleString()} units`} sub="via DC backup" info />
                    : <StatCard label="Total Demand" value={`${stats.totalDemand.toLocaleString()} units`} sub={`over ${stats.demands.length} hours`} />
                }
                showDivider={i < locations.length - 1}
              />
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
