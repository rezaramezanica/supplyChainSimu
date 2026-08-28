import type { LocationData, StockMetrics } from "./types";
import {
  SIM_INITIAL_INVENTORY, SIM_REORDER_POINT, SIM_SAFETY_STOCK,
  SIM_INVENTORY_CAPACITY, SIM_ORDER_QUANTITY, SIM_DEMAND_MEAN, SIM_LEAD_TIME,
} from "./constants";
import type { ScenarioId } from "./types";

export const initialLocations: LocationData[] = [
  {
    id: "kamloops", name: "Kamloops",
    coordinates: [-120.3273, 50.6745],
    color: "#2563eb", lightColor: "#93c5fd", accent: "#dbeafe",
    cardSide: "left",
    stock: { current: SIM_INITIAL_INVENTORY, reorderPoint: SIM_REORDER_POINT, safetyStock: SIM_SAFETY_STOCK, capacity: SIM_INVENTORY_CAPACITY, unit: "units" },
  },
  {
    id: "kelowna", name: "Kelowna",
    coordinates: [-119.496, 49.888],
    color: "#16a34a", lightColor: "#86efac", accent: "#dcfce7",
    cardSide: "right",
    stock: { current: SIM_INITIAL_INVENTORY, reorderPoint: SIM_REORDER_POINT, safetyStock: SIM_SAFETY_STOCK, capacity: SIM_INVENTORY_CAPACITY, unit: "units" },
  },
];

export function getScenario2Parameters(hubSafetyStock: number) {
  const hubReorderPoint = 2 * SIM_DEMAND_MEAN * SIM_LEAD_TIME + hubSafetyStock;
  const hubInitialInventory = 2 * SIM_ORDER_QUANTITY + hubSafetyStock;
  const hubCapacity = hubInitialInventory;
  return { hubSafetyStock, hubReorderPoint, hubInitialInventory, hubCapacity };
}

export function getScenario3Parameters(centralPct: number) {
  const safetyStockDistributionCenter = Math.round(2 * SIM_SAFETY_STOCK * centralPct / 100);
  const safetyStockPerRegion = Math.round((2 * SIM_SAFETY_STOCK - safetyStockDistributionCenter) / 2);
  return {
    safetyStockDistributionCenter,
    safetyStockPerRegion,
    reorderPointPerRegion: SIM_DEMAND_MEAN * SIM_LEAD_TIME + safetyStockPerRegion,
    initialInventoryPerRegion: SIM_ORDER_QUANTITY + safetyStockPerRegion,
  };
}

export function getScenarioLocations(scenario: ScenarioId, centralPct = 50, hubSafetyStock = 2 * SIM_SAFETY_STOCK): LocationData[] {
  if (scenario === 2) {
    const { hubReorderPoint, hubInitialInventory, hubCapacity } = getScenario2Parameters(hubSafetyStock);
    const hubStock: StockMetrics = {
      current: hubInitialInventory,
      reorderPoint: hubReorderPoint,
      safetyStock: hubSafetyStock,
      capacity: hubCapacity,
      unit: "units",
    };
    return [
      { ...initialLocations[0], stock: hubStock },
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
