import React from "react";
import { X } from "lucide-react";
import type { BatchResult, BatchLocationResult } from "../simulation/batchSimulation";
import { StatCard } from "./StatCard";

const LOCATION_STYLES: Record<string, { name: string; color: string; accentBg: string; accentBorder: string; lightColor: string }> = {
  kamloops: { name: "Kamloops", color: "#2563eb", accentBg: "#dbeafe", accentBorder: "#93c5fd", lightColor: "#93c5fd" },
  kelowna: { name: "Kelowna", color: "#16a34a", accentBg: "#dcfce7", accentBorder: "#86efac", lightColor: "#86efac" },
};

const HUB_STYLE = { name: "Central Hub", color: "#0d9488", accentBg: "#f0fdfa", accentBorder: "#99f6e4", lightColor: "#99f6e4" };

function LocationBatchResult({ loc, isHub, isScenario3, subtitle, showDivider }: {
  loc: BatchLocationResult;
  isHub: boolean;
  isScenario3: boolean;
  subtitle: string;
  showDivider?: boolean;
}) {
  const style = isHub ? HUB_STYLE : (LOCATION_STYLES[loc.id] ?? LOCATION_STYLES["kamloops"]);
  const { avg } = loc;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: style.color }} />
        <h3 className="text-base font-bold text-slate-800">{isHub ? "Central Hub Warehouse" : `${style.name} Warehouse`}</h3>
        <span className="text-xs text-slate-400 ml-1">· {subtitle}</span>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: individual runs table */}
        <div className="overflow-y-auto rounded-lg border border-slate-200" style={{ maxHeight: 300 }}>
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="text-slate-400 font-semibold uppercase tracking-wider">
                <th className="px-2 py-1.5 text-left">#</th>
                <th className="px-2 py-1.5 text-right">Fill Rate</th>
                <th className="px-2 py-1.5 text-right">Service Lvl</th>
                <th className="px-2 py-1.5 text-right">Stockouts</th>
                <th className="px-2 py-1.5 text-right">Lost</th>
              </tr>
            </thead>
            <tbody>
              {loc.runs.map((run, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                  <td className="px-2 py-1 text-slate-400 font-medium">{i + 1}</td>
                  <td className="px-2 py-1 text-right font-semibold" style={{ color: style.color }}>{run.fillRate.toFixed(2)}%</td>
                  <td className="px-2 py-1 text-right font-semibold" style={{ color: style.color }}>{run.serviceLevel.toFixed(2)}%</td>
                  <td className={`px-2 py-1 text-right font-semibold ${run.stockoutInstances > 0 ? "text-red-600" : "text-slate-700"}`}>{run.stockoutInstances}</td>
                  <td className={`px-2 py-1 text-right font-semibold ${run.demandLost > 0 ? "text-red-600" : "text-slate-700"}`}>{run.demandLost.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: averaged stats */}
        <div className="flex flex-col justify-center gap-2">
          <div className="rounded-xl px-4 py-3 border" style={{ backgroundColor: style.accentBg, borderColor: style.accentBorder }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: style.color }}>Avg Fill Rate</p>
                <p className="text-2xl font-black mt-0.5" style={{ color: style.color }}>{avg.fillRate.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: style.color }}>Avg Service Level</p>
                <p className="text-2xl font-black mt-0.5" style={{ color: style.color }}>{avg.serviceLevel.toFixed(2)}%</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Avg Stockout Instances" value={avg.stockoutInstances.toFixed(1)} sub="" alert={avg.stockoutInstances > 0} />
            <StatCard label="Avg Replenishment Orders" value={avg.replenishmentOrders.toFixed(1)} sub="" />
            <StatCard label="Avg Demand Lost" value={`${Math.round(avg.demandLost).toLocaleString()} units`} sub="" alert={avg.demandLost > 0} />
            {isScenario3
              ? <StatCard label="Avg Served from DC" value={`${Math.round(avg.demandServedFromDC).toLocaleString()} units`} sub="" info />
              : <StatCard label="Avg Total Demand" value={`${Math.round(avg.totalDemand).toLocaleString()} units`} sub="" />
            }
          </div>
        </div>
      </div>

      {showDivider && <div className="mt-6 border-t border-slate-100" />}
    </div>
  );
}

export function BatchResultsModal({ result, isScenario2, isScenario3, onClose }: {
  result: BatchResult;
  isScenario2: boolean;
  isScenario3: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-bold text-slate-900">Batch Run Results</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-8">
          {/* S2: single Central Hub entry */}
          {isScenario2 && (
            <LocationBatchResult
              loc={result.locations.find((l) => l.id === "kamloops")!}
              isHub
              isScenario3={false}
              subtitle={`${result.runCount} runs · serving Kamloops & Kelowna`}
            />
          )}

          {/* S3: DC summary row */}
          {isScenario3 && (() => {
            const k = result.locations.find((l) => l.id === "kamloops");
            const o = result.locations.find((l) => l.id === "kelowna");
            if (!k || !o) return null;
            const totalDsfdc = Math.round(k.avg.demandServedFromDC + o.avg.demandServedFromDC);
            return (
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full bg-violet-600 shrink-0" />
                  <h3 className="text-base font-bold text-slate-800">Distribution Centre (DC)</h3>
                  <span className="text-xs text-slate-400 ml-1">· emergency safety-stock buffer</span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <StatCard label="DC Safety Stock" value={`${result.dcInitialInventory} units`} sub="initial allocation" info />
                  <StatCard label="Avg Served Kamloops" value={`${Math.round(k.avg.demandServedFromDC).toLocaleString()} units`} sub="Kamloops overflow" info />
                  <StatCard label="Avg Served Kelowna" value={`${Math.round(o.avg.demandServedFromDC).toLocaleString()} units`} sub="Kelowna overflow" info />
                  <StatCard label="Avg Total from DC" value={`${totalDsfdc.toLocaleString()} units`} sub="combined DC draws" info />
                </div>
              </div>
            );
          })()}

          {/* S1 & S3: per-location entries */}
          {!isScenario2 && result.locations.map((loc, i) => (
            <LocationBatchResult
              key={loc.id}
              loc={loc}
              isHub={false}
              isScenario3={isScenario3}
              subtitle={`${result.runCount} runs simulated`}
              showDivider={i < result.locations.length - 1}
            />
          ))}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}
