import type { LocationData, StockMetrics } from "./types";
import {
  SIM_INITIAL_INVENTORY, SIM_REORDER_POINT, SIM_SAFETY_STOCK,
  SIM_INVENTORY_CAPACITY, SIM_ORDER_QUANTITY, SIM_DEMAND_MEAN, SIM_LEAD_TIME,
} from "./constants";
import type { ScenarioId } from "./types";

export const itemMaxQty: Record<string, number> = {};

export const initialLocations: LocationData[] = [
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

initialLocations.forEach((loc) =>
  loc.inventory.forEach((item) => { itemMaxQty[item.sku] = item.quantity; })
);

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

export function getScenarioLocations(scenario: ScenarioId, centralPct = 50): LocationData[] {
  if (scenario === 2) {
    const hubStock: StockMetrics = {
      current: SIM_INITIAL_INVENTORY * 2,
      reorderPoint: SIM_REORDER_POINT * 2,
      safetyStock: SIM_SAFETY_STOCK * 2,
      capacity: SIM_INVENTORY_CAPACITY * 2,
      unit: "units",
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
