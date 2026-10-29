import type { ScenarioId, LocSimState, SimStats } from "./types";
import {
  SIM_TOTAL_HOURS, SIM_DEMAND_MEAN, SIM_DEMAND_STD_DEV,
  SIM_REORDER_POINT, SIM_LEAD_TIME, SIM_ORDER_QUANTITY, SIM_SAFETY_STOCK,
} from "./constants";
import {
  normalRandom, createInitialLocationState, createEmptyStats,
  stepIndependent, stepPooled, stepScenario3,
} from "./stepFunctions";
import { getScenario2Parameters, getScenario3Parameters } from "./locationData";

export type BatchRunStats = {
  fillRate: number;
  serviceLevel: number;
  stockoutInstances: number;
  replenishmentOrders: number;
  demandLost: number;
  totalDemand: number;
  demandServedFromDC: number;
};

export type BatchLocationResult = {
  id: string;
  runs: BatchRunStats[];
  avg: BatchRunStats;
  min: BatchRunStats;
  max: BatchRunStats;
};

export type BatchResult = {
  locations: BatchLocationResult[];
  dcInitialInventory: number;
  runCount: number;
};

function computeStats(s: SimStats): BatchRunStats {
  const fillRate = s.totalDemand > 0 ? (1 - s.demandLost / s.totalDemand) * 100 : 100;
  const serviceLevel = s.replenishmentOrders > 0 ? (1 - s.stockoutInstances / s.replenishmentOrders) * 100 : 100;
  return {
    fillRate,
    serviceLevel,
    stockoutInstances: s.stockoutInstances,
    replenishmentOrders: s.replenishmentOrders,
    demandLost: s.demandLost,
    totalDemand: s.totalDemand,
    demandServedFromDC: s.demandServedFromDC,
  };
}

function avgOf(runs: BatchRunStats[], key: keyof BatchRunStats): number {
  return runs.reduce((sum, r) => sum + r[key], 0) / runs.length;
}

function minOf(runs: BatchRunStats[], key: keyof BatchRunStats): number {
  return Math.min(...runs.map((r) => r[key]));
}

function maxOf(runs: BatchRunStats[], key: keyof BatchRunStats): number {
  return Math.max(...runs.map((r) => r[key]));
}

function aggregate(runs: BatchRunStats[]): { avg: BatchRunStats; min: BatchRunStats; max: BatchRunStats } {
  const keys: (keyof BatchRunStats)[] = ["fillRate", "serviceLevel", "stockoutInstances", "replenishmentOrders", "demandLost", "totalDemand", "demandServedFromDC"];
  const avg = {} as BatchRunStats;
  const min = {} as BatchRunStats;
  const max = {} as BatchRunStats;
  for (const k of keys) {
    avg[k] = avgOf(runs, k);
    min[k] = minOf(runs, k);
    max[k] = maxOf(runs, k);
  }
  return { avg, min, max };
}

function runOnce(
  scenario: ScenarioId,
  centralPct: number,
  hubSafetyStock: number,
): Record<string, SimStats> {
  const r1Demands = Array.from({ length: SIM_TOTAL_HOURS }, () => normalRandom(SIM_DEMAND_MEAN, SIM_DEMAND_STD_DEV));
  const r2Demands = Array.from({ length: SIM_TOTAL_HOURS }, () => normalRandom(SIM_DEMAND_MEAN, SIM_DEMAND_STD_DEV));

  const stats: Record<string, SimStats> = {};

  if (scenario === 2) {
    const { hubReorderPoint, hubInitialInventory } = getScenario2Parameters(hubSafetyStock);
    let hub: LocSimState = createInitialLocationState(hubInitialInventory);
    stats["kamloops"] = createEmptyStats();

    for (let h = 0; h < SIM_TOTAL_HOURS; h++) {
      const { next } = stepPooled(hub, r1Demands[h], r2Demands[h], h, hubReorderPoint);
      hub = next;
      stats["kamloops"].demands.push(r1Demands[h] + r2Demands[h]);
      stats["kamloops"].totalDemand = next.totalDemand;
      stats["kamloops"].demandLost = next.demandLost;
      stats["kamloops"].stockoutInstances = next.stockoutInstances;
      stats["kamloops"].replenishmentOrders = next.replenishmentOrders;
    }
  } else if (scenario === 3) {
    const { safetyStockDistributionCenter, safetyStockPerRegion, initialInventoryPerRegion } = getScenario3Parameters(centralPct);
    let region1: LocSimState = createInitialLocationState(initialInventoryPerRegion);
    let region2: LocSimState = createInitialLocationState(initialInventoryPerRegion);
    let dcInventory = safetyStockDistributionCenter;
    const dcConsumptionHistory: number[] = [];
    stats["kamloops"] = createEmptyStats();
    stats["kelowna"] = createEmptyStats();

    for (let h = 0; h < SIM_TOTAL_HOURS; h++) {
      if (h >= 16) {
        dcInventory += dcConsumptionHistory[h - 16] ?? 0;
      }
      const result = stepScenario3(region1, region2, dcInventory, r1Demands[h], r2Demands[h], h, safetyStockPerRegion, safetyStockPerRegion);
      region1 = result.nextRegion1State;
      region2 = result.nextRegion2State;
      dcInventory = result.nextDistributionCenterInventory;
      dcConsumptionHistory[h] = result.demandServedFromDC1Delta + result.demandServedFromDC2Delta;

      for (const [id, nextState, demand, dcDelta] of [
        ["kamloops", result.nextRegion1State, r1Demands[h], result.demandServedFromDC1Delta],
        ["kelowna", result.nextRegion2State, r2Demands[h], result.demandServedFromDC2Delta],
      ] as [string, LocSimState, number, number][]) {
        stats[id].demands.push(demand);
        stats[id].totalDemand = nextState.totalDemand;
        stats[id].demandLost = nextState.demandLost;
        stats[id].stockoutInstances = nextState.stockoutInstances;
        stats[id].replenishmentOrders = nextState.replenishmentOrders;
        stats[id].demandServedFromDC += dcDelta;
      }
    }
  } else {
    stats["kamloops"] = createEmptyStats();
    stats["kelowna"] = createEmptyStats();
    const states: Record<string, LocSimState> = {
      kamloops: createInitialLocationState(),
      kelowna: createInitialLocationState(),
    };

    for (let h = 0; h < SIM_TOTAL_HOURS; h++) {
      for (const [id, demand] of [["kamloops", r1Demands[h]], ["kelowna", r2Demands[h]]] as [string, number][]) {
        const { next } = stepIndependent(states[id], demand, h, SIM_REORDER_POINT, SIM_LEAD_TIME);
        states[id] = next;
        stats[id].demands.push(demand);
        stats[id].totalDemand = next.totalDemand;
        stats[id].demandLost = next.demandLost;
        stats[id].stockoutInstances = next.stockoutInstances;
        stats[id].replenishmentOrders = next.replenishmentOrders;
      }
    }
  }

  return stats;
}

export function runBatchSimulation(
  scenario: ScenarioId,
  centralPct: number,
  hubSafetyStock: number,
  runCount = 20,
): BatchResult {
  const locationIds = scenario === 2 ? ["kamloops"] : ["kamloops", "kelowna"];
  const allRuns: Record<string, BatchRunStats[]> = {};
  for (const id of locationIds) allRuns[id] = [];

  const { safetyStockDistributionCenter } = getScenario3Parameters(centralPct);
  const dcInitialInventory = scenario === 3 ? safetyStockDistributionCenter : 0;

  for (let i = 0; i < runCount; i++) {
    const result = runOnce(scenario, centralPct, hubSafetyStock);
    for (const id of locationIds) {
      allRuns[id].push(computeStats(result[id]));
    }
  }

  const locations: BatchLocationResult[] = locationIds.map((id) => {
    const { avg, min, max } = aggregate(allRuns[id]);
    return { id, runs: allRuns[id], avg, min, max };
  });

  return { locations, dcInitialInventory, runCount };
}
