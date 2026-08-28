import truLogo from "../../assets/tru_logo.png";
import { RotateCcw, Play, Pause } from "lucide-react";
import type { ScenarioId } from "../simulation/types";
import { SIM_SAFETY_STOCK } from "../simulation/constants";


const SCENARIO_INFO = {
  1: ["Scenario 1", "Decentralized"],
  2: ["Scenario 2", "Centralized"],
  3: ["Scenario 3", "Partial Pool"],
} as const;

export function SimulationHeader({
  activeScenario,
  isPlaying,
  speedMilliseconds,
  centralSafetyStockPercentage,
  hubSafetyStock,
  onScenarioChange,
  onPlayPause,
  onReset,
  onSpeedChange,
  onCentralPctChange,
  onHubSafetyStockChange,
}: {
  activeScenario: ScenarioId;
  isPlaying: boolean;
  speedMilliseconds: number;
  centralSafetyStockPercentage: number;
  hubSafetyStock: number;
  onScenarioChange: (s: ScenarioId) => void;
  onPlayPause: () => void;
  onReset: () => void;
  onSpeedChange: (ms: number) => void;
  onCentralPctChange: (pct: number) => void;
  onHubSafetyStockChange: (units: number) => void;
}) {
  const isScenario2 = activeScenario === 2;
  const isScenario3 = activeScenario === 3;

  return (
    <header className="absolute top-0 left-0 right-0 z-20 h-20 flex items-center justify-between px-5 bg-white border-b border-slate-200 shadow-sm gap-3 relative">
      {/* Left: logo + professor name */}
      <div className="flex items-center gap-2 shrink-0">
        <img src={truLogo} alt="TRU Logo" className="h-[72px] w-auto shrink-0" />
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-slate-700">Prof. Mohsin Jat</span>
          <span className="text-xs font-semibold text-slate-700">Prof. Shamik Pushkar</span>
          <span className="text-xs font-semibold text-slate-500">Reza Ramezani</span>
        </div>
      </div>

      {/* Center: scenario tabs — absolutely centered */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-100 rounded-lg p-1">
        {([1, 2, 3] as ScenarioId[]).map((scenarioId) => {
          const [label, sub] = SCENARIO_INFO[scenarioId];
          const isActive = activeScenario === scenarioId;
          return (
            <button key={scenarioId} onClick={() => onScenarioChange(scenarioId)}
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
        {/* S2: Hub safety-stock slider */}
        {isScenario2 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 shrink-0">
            <span className="text-[10px] text-teal-500 font-semibold uppercase">Safety Stock</span>
            <input
              type="range" min={0} max={2 * SIM_SAFETY_STOCK} step={1} value={hubSafetyStock}
              onChange={(e) => onHubSafetyStockChange(Number(e.target.value))}
              className="w-32 h-1.5 accent-teal-600"
              title={`Hub safety stock (default: ${2 * SIM_SAFETY_STOCK})`}
            />
            <input
              type="number" min={0} max={2 * SIM_SAFETY_STOCK} step={1} value={hubSafetyStock}
              onChange={(e) => onHubSafetyStockChange(Math.max(0, Math.min(2 * SIM_SAFETY_STOCK, Number(e.target.value) || 0)))}
              className="w-14 h-5 text-[10px] text-teal-700 font-bold text-center rounded border border-teal-300 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        )}

        {/* S3: DC safety-stock split slider */}
        {isScenario3 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 shrink-0">
            <span className="text-[10px] text-violet-500 font-semibold uppercase">DC SS%</span>
            <input
              type="range" min={0} max={100} step={25} value={centralSafetyStockPercentage}
              onChange={(e) => onCentralPctChange(Number(e.target.value))}
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
            type="range" min={50} max={2000} step={50} value={2050 - speedMilliseconds}
            onChange={(e) => onSpeedChange(2050 - Number(e.target.value))}
            className="w-20 h-1.5 accent-slate-700"
            title={`${speedMilliseconds}ms per hour`}
          />
          <span className="text-[10px] text-slate-500 w-8 text-left">
            {speedMilliseconds <= 100 ? "Fast" : speedMilliseconds >= 1500 ? "Slow" : `${speedMilliseconds}`}
          </span>
        </div>

        {/* Play/Pause */}
        <button onClick={onPlayPause}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all"
          style={{ borderColor: isPlaying ? "#dc2626" : "#2563eb", backgroundColor: isPlaying ? "#fee2e2" : "#dbeafe", color: isPlaying ? "#dc2626" : "#2563eb" }}
        >
          {isPlaying ? <><Pause className="w-3.5 h-3.5" />Pause</> : <><Play className="w-3.5 h-3.5" />Play</>}
        </button>

        {/* Reset */}
        <button onClick={onReset}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors"
          title="Reset simulation"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
