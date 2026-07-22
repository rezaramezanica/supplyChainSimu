import type { LocSimState, SimStats } from "./types";
import {
  SIM_ORDER_QUANTITY, SIM_LEAD_TIME, SIM_REORDER_POINT,
  SIM_INITIAL_INVENTORY, SIM_DEMAND_MEAN,
} from "./constants";

export function normalRandom(mean: number, standardDeviation: number): number {
  const u1 = Math.random(), u2 = Math.random();
  const z  = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(mean + z * standardDeviation));
}

export function createInitialLocationState(initialInventory = SIM_INITIAL_INVENTORY): LocSimState {
  return {
    inventory: initialInventory,
    orderDeliveryHour: 0,
    replenishmentOrders: 0,
    stockoutInstances: 0,
    demandLost: 0,
    totalDemand: 0,
  };
}

export function createEmptyStats(): SimStats {
  return {
    demands: [],
    stockoutInstances: 0,
    replenishmentOrders: 0,
    demandLost: 0,
    totalDemand: 0,
    demandServedFromDC: 0,
  };
}

export function deriveItemStatus(qty: number, maxQty: number): "healthy" | "low" | "critical" {
  const proportion = qty / maxQty;
  if (proportion <= 0.1) return "critical";
  if (proportion <= 0.3) return "low";
  return "healthy";
}

export function getCurrentTimeString() {
  return new Date().toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
}

// Scenario 1: independent facilities
export function stepIndependent(
  locationState: LocSimState, demand: number, hour: number,
  reorderPoint = SIM_REORDER_POINT, leadTime = SIM_LEAD_TIME,
): { next: LocSimState; newStockout: boolean } {
  let inventory = locationState.inventory;
  let orderDeliveryHour = locationState.orderDeliveryHour;

  if (orderDeliveryHour > 0 && hour >= orderDeliveryHour) {
    inventory += SIM_ORDER_QUANTITY;
    orderDeliveryHour = 0;
  }

  let replenishmentOrders = locationState.replenishmentOrders;
  if (orderDeliveryHour === 0 && inventory > reorderPoint && inventory - demand <= reorderPoint) {
    orderDeliveryHour = hour + leadTime;
    replenishmentOrders++;
  }

  let stockouts = locationState.stockoutInstances;
  let newStockout = false;
  if (inventory >= 1 && inventory - demand <= 0) { stockouts++; newStockout = true; }

  let demandLost = locationState.demandLost;
  if (demand <= inventory) { inventory -= demand; } else { demandLost += demand - inventory; inventory = 0; }

  return {
    next: { inventory, orderDeliveryHour, replenishmentOrders, stockoutInstances: stockouts, demandLost, totalDemand: locationState.totalDemand + demand },
    newStockout,
  };
}

// Scenario 2: pooled (combined inventory at hub)
export function stepPooled(
  locationState: LocSimState, region1Demand: number, region2Demand: number, hour: number,
): { next: LocSimState; newStockout: boolean } {
  const combinedDemand = region1Demand + region2Demand;
  const doubleOrderQuantity = SIM_ORDER_QUANTITY * 2;
  const doubleReorderPoint  = SIM_REORDER_POINT  * 2;

  let inventory = locationState.inventory;
  let orderDeliveryHour = locationState.orderDeliveryHour;

  if (orderDeliveryHour > 0 && hour >= orderDeliveryHour) {
    inventory += doubleOrderQuantity;
    orderDeliveryHour = 0;
  }

  let replenishmentOrders = locationState.replenishmentOrders;
  if (orderDeliveryHour === 0 && inventory > doubleReorderPoint && inventory - combinedDemand <= doubleReorderPoint) {
    orderDeliveryHour = hour + SIM_LEAD_TIME;
    replenishmentOrders++;
  }

  let stockouts = locationState.stockoutInstances;
  let newStockout = false;
  if (inventory >= 1 && inventory - combinedDemand <= 0) { stockouts++; newStockout = true; }

  let demandLost = locationState.demandLost;
  if (combinedDemand <= inventory) { inventory -= combinedDemand; } else { demandLost += combinedDemand - inventory; inventory = 0; }

  return {
    next: { inventory, orderDeliveryHour, replenishmentOrders, stockoutInstances: stockouts, demandLost, totalDemand: locationState.totalDemand + combinedDemand },
    newStockout,
  };
}

// Scenario 3: partial safety-stock centralisation
export type Scenario3StepResult = {
  nextRegion1State: LocSimState;
  nextRegion2State: LocSimState;
  nextDistributionCenterInventory: number;
  demandServedFromDC1Delta: number;
  demandServedFromDC2Delta: number;
  newStockout: boolean;
};

export function stepScenario3(
  region1State: LocSimState, region2State: LocSimState,
  distributionCenterInventoryLevel: number,
  region1Demand: number, region2Demand: number, hour: number,
  safetyStockRegion1: number, safetyStockRegion2: number,
): Scenario3StepResult {
  const reorderPointRegion1 = SIM_DEMAND_MEAN * SIM_LEAD_TIME + safetyStockRegion1;
  const reorderPointRegion2 = SIM_DEMAND_MEAN * SIM_LEAD_TIME + safetyStockRegion2;

  let inventory1 = region1State.inventory, orderDeliveryHour1 = region1State.orderDeliveryHour;
  let inventory2 = region2State.inventory, orderDeliveryHour2 = region2State.orderDeliveryHour;
  let dcInventoryLevel = distributionCenterInventoryLevel;

  if (orderDeliveryHour1 > 0 && hour >= orderDeliveryHour1) { inventory1 += SIM_ORDER_QUANTITY; orderDeliveryHour1 = 0; }
  if (orderDeliveryHour2 > 0 && hour >= orderDeliveryHour2) { inventory2 += SIM_ORDER_QUANTITY; orderDeliveryHour2 = 0; }

  let replenishmentOrders1 = region1State.replenishmentOrders;
  let replenishmentOrders2 = region2State.replenishmentOrders;
  if (orderDeliveryHour1 === 0 && inventory1 > reorderPointRegion1 && inventory1 - region1Demand <= reorderPointRegion1) {
    orderDeliveryHour1 = hour + SIM_LEAD_TIME;
    replenishmentOrders1++;
  }
  if (orderDeliveryHour2 === 0 && inventory2 > reorderPointRegion2 && inventory2 - region2Demand <= reorderPointRegion2) {
    orderDeliveryHour2 = hour + SIM_LEAD_TIME;
    replenishmentOrders2++;
  }

  let stockoutCount1 = region1State.stockoutInstances, demandLost1 = region1State.demandLost;
  let stockoutCount2 = region2State.stockoutInstances, demandLost2 = region2State.demandLost;
  let demandServedFromDC1 = 0, demandServedFromDC2 = 0;
  let newStockout = false;

  // Region 1 fulfillment
  if (region1Demand <= inventory1) {
    inventory1 -= region1Demand;
  } else {
    const remainingDemand = region1Demand - inventory1;
    inventory1 = 0;
    if (dcInventoryLevel >= remainingDemand) {
      dcInventoryLevel -= remainingDemand;
      demandServedFromDC1 += remainingDemand;
    } else {
      demandServedFromDC1 += dcInventoryLevel;
      demandLost1 += remainingDemand - dcInventoryLevel;
      dcInventoryLevel = 0;
      stockoutCount1++;
      newStockout = true;
    }
  }

  // Region 2 fulfillment
  if (region2Demand <= inventory2) {
    inventory2 -= region2Demand;
  } else {
    const remainingDemand = region2Demand - inventory2;
    inventory2 = 0;
    if (dcInventoryLevel >= remainingDemand) {
      dcInventoryLevel -= remainingDemand;
      demandServedFromDC2 += remainingDemand;
    } else {
      demandServedFromDC2 += dcInventoryLevel;
      demandLost2 += remainingDemand - dcInventoryLevel;
      dcInventoryLevel = 0;
      stockoutCount2++;
      newStockout = true;
    }
  }

  return {
    nextRegion1State: { inventory: inventory1, orderDeliveryHour: orderDeliveryHour1, replenishmentOrders: replenishmentOrders1, stockoutInstances: stockoutCount1, demandLost: demandLost1, totalDemand: region1State.totalDemand + region1Demand },
    nextRegion2State: { inventory: inventory2, orderDeliveryHour: orderDeliveryHour2, replenishmentOrders: replenishmentOrders2, stockoutInstances: stockoutCount2, demandLost: demandLost2, totalDemand: region2State.totalDemand + region2Demand },
    nextDistributionCenterInventory: dcInventoryLevel,
    demandServedFromDC1Delta: demandServedFromDC1,
    demandServedFromDC2Delta: demandServedFromDC2,
    newStockout,
  };
}
