export type ScenarioId = 1 | 2 | 3;

export type StockMetrics = {
  current: number;
  reorderPoint: number;
  safetyStock: number;
  capacity: number;
  unit: string;
};

export type LocationData = {
  id: string;
  name: string;
  coordinates: [number, number];
  color: string;
  lightColor: string;
  accent: string;
  stock: StockMetrics;
  cardSide: "left" | "right";
};

export type LocSimState = {
  inventory: number;
  orderDeliveryHour: number;
  replenishmentOrders: number;
  stockoutInstances: number;
  demandLost: number;
  totalDemand: number;
};

export type SimStats = {
  demands: number[];
  stockoutInstances: number;
  replenishmentOrders: number;
  demandLost: number;
  totalDemand: number;
  demandServedFromDC: number;
};
