import { useState, useEffect, useRef } from "react";
import type { ScenarioId, LocationData, LocSimState, SimStats } from "../simulation/types";
import {
  SIM_TOTAL_HOURS,
  SIM_INITIAL_INVENTORY, SIM_INVENTORY_CAPACITY, SIM_REORDER_POINT, SIM_LEAD_TIME,
} from "../simulation/constants";
import {
  createInitialLocationState, createEmptyStats,
  stepIndependent, stepPooled, stepScenario3,
} from "../simulation/stepFunctions";
import fixedDemands from "../simulation/fixedDemands.json";
import {
  getScenario3Parameters, getScenarioLocations,
} from "../simulation/locationData";

export function useSimulation() {
  const [activeScenario, setActiveScenario]                       = useState<ScenarioId>(1);
  const [centralSafetyStockPercentage, setCentralSafetyStockPercentage] = useState(50);
  const [locations, setLocations]                                 = useState<LocationData[]>(getScenarioLocations(1));
  const [isPlaying, setIsPlaying]                                 = useState(false);
  const [showResults, setShowResults]                             = useState(false);
  const [resultsData, setResultsData]                             = useState<Record<string, SimStats>>({});
  const [currentHour, setCurrentHour]                             = useState(0);
  const [speedMilliseconds, setSpeedMilliseconds]                 = useState(200);
  const [distributionCenterInventory, setDistributionCenterInventory] = useState(0);

  const intervalRef                  = useRef<ReturnType<typeof setInterval> | null>(null);
  const simulationHourRef            = useRef(0);
  const simulationStateRef           = useRef<Record<string, LocSimState>>({});
  const simulationStatsRef           = useRef<Record<string, SimStats>>({});
  const distributionCenterInventoryRef = useRef(0);
  const activeScenarioRef            = useRef<ScenarioId>(1);
  const centralPercentageRef         = useRef(50);
  const distributionCenterInitialRef = useRef(0);
  const demandArraysRef              = useRef({ r1: [] as number[], r2: [] as number[] });

  const initSim = (scenario: ScenarioId, pct: number) => {
    demandArraysRef.current = {
      r1: fixedDemands.r1,
      r2: fixedDemands.r2,
    };
    const { safetyStockDistributionCenter, initialInventoryPerRegion } = getScenario3Parameters(pct);
    if (scenario === 2) {
      simulationStateRef.current = {
        kamloops: createInitialLocationState(SIM_INITIAL_INVENTORY * 2),
        kelowna:  createInitialLocationState(),
      };
      distributionCenterInventoryRef.current = 0;
    } else if (scenario === 3) {
      simulationStateRef.current = {
        kamloops: createInitialLocationState(initialInventoryPerRegion),
        kelowna:  createInitialLocationState(initialInventoryPerRegion),
      };
      distributionCenterInventoryRef.current = safetyStockDistributionCenter;
      distributionCenterInitialRef.current   = safetyStockDistributionCenter;
    } else {
      simulationStateRef.current = {
        kamloops: createInitialLocationState(),
        kelowna:  createInitialLocationState(),
      };
      distributionCenterInventoryRef.current = 0;
    }
    simulationStatsRef.current = {};
    simulationHourRef.current  = 0;
  };

  const resetAll = (scenario: ScenarioId, pct = centralSafetyStockPercentage) => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    initSim(scenario, pct);
    setIsPlaying(false);
    setCurrentHour(0);
    setDistributionCenterInventory(distributionCenterInventoryRef.current);
    setLocations(getScenarioLocations(scenario, pct));
  };

  const handleScenarioChange = (scenario: ScenarioId) => {
    activeScenarioRef.current = scenario;
    setActiveScenario(scenario);
    resetAll(scenario);
  };

  const handleCentralPctChange = (pct: number) => {
    centralPercentageRef.current = pct;
    setCentralSafetyStockPercentage(pct);
    resetAll(3, pct);
  };

  // ── Simulation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }

    intervalRef.current = setInterval(() => {
      const simulationHour = simulationHourRef.current;
      const scenario       = activeScenarioRef.current;

      if (simulationHour >= SIM_TOTAL_HOURS) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setIsPlaying(false);
        const captured = { ...simulationStatsRef.current };
        if (Object.values(captured).some((locationStats) => locationStats.demands.length > 0)) {
          setResultsData(captured);
          setShowResults(true);
        }
        return;
      }

      const region1Demand = demandArraysRef.current.r1[simulationHour];
      const region2Demand = demandArraysRef.current.r2[simulationHour];

      // ── Scenario 2: pooled ───────────────────────────────────────────────
      if (scenario === 2) {
        const hub = simulationStateRef.current["kamloops"] ?? createInitialLocationState(SIM_INITIAL_INVENTORY * 2);
        const { next } = stepPooled(hub, region1Demand, region2Demand, simulationHour);
        simulationStateRef.current["kamloops"] = next;
        if (!simulationStatsRef.current["kamloops"]) simulationStatsRef.current["kamloops"] = createEmptyStats();
        const locationStats = simulationStatsRef.current["kamloops"];
        locationStats.demands.push(region1Demand + region2Demand);
        locationStats.totalDemand         = next.totalDemand;
        locationStats.demandLost          = next.demandLost;
        locationStats.stockoutInstances   = next.stockoutInstances;
        locationStats.replenishmentOrders = next.replenishmentOrders;

        setLocations((prev) => prev.map((loc, locationIndex) => {
          if (locationIndex !== 0) return loc;
          return { ...loc, stock: { ...loc.stock, current: next.inventory } };
        }));

      // ── Scenario 3: partial SS centralisation ────────────────────────────
      } else if (scenario === 3) {
        const centralPercentage = centralPercentageRef.current;
        const { safetyStockPerRegion, reorderPointPerRegion } = getScenario3Parameters(centralPercentage);
        const region1State       = simulationStateRef.current["kamloops"] ?? createInitialLocationState();
        const region2State       = simulationStateRef.current["kelowna"]  ?? createInitialLocationState();
        const currentDCInventory = distributionCenterInventoryRef.current;

        const result = stepScenario3(region1State, region2State, currentDCInventory, region1Demand, region2Demand, simulationHour, safetyStockPerRegion, safetyStockPerRegion);
        simulationStateRef.current["kamloops"]  = result.nextRegion1State;
        simulationStateRef.current["kelowna"]   = result.nextRegion2State;
        distributionCenterInventoryRef.current  = result.nextDistributionCenterInventory;

        for (const [id, nextState, demand, demandFromDCDelta] of [
          ["kamloops", result.nextRegion1State, region1Demand, result.demandServedFromDC1Delta],
          ["kelowna",  result.nextRegion2State, region2Demand, result.demandServedFromDC2Delta],
        ] as [string, LocSimState, number, number][]) {
          if (!simulationStatsRef.current[id]) simulationStatsRef.current[id] = createEmptyStats();
          const locationStats = simulationStatsRef.current[id];
          locationStats.demands.push(demand);
          locationStats.totalDemand         = nextState.totalDemand;
          locationStats.demandLost          = nextState.demandLost;
          locationStats.stockoutInstances   = nextState.stockoutInstances;
          locationStats.replenishmentOrders = nextState.replenishmentOrders;
          locationStats.demandServedFromDC += demandFromDCDelta;
        }

        setDistributionCenterInventory(result.nextDistributionCenterInventory);
        setLocations((prev) => prev.map((loc) => {
          const nextState = loc.id === "kamloops" ? result.nextRegion1State : result.nextRegion2State;
          return {
            ...loc,
            stock: { current: nextState.inventory, reorderPoint: reorderPointPerRegion, safetyStock: safetyStockPerRegion, capacity: SIM_INVENTORY_CAPACITY, unit: "units" },
          };
        }));

      // ── Scenario 1 (& default): independent ─────────────────────────────
      } else {
        const updatedStates: Record<string, LocSimState> = {};
        for (const [id, demand] of [["kamloops", region1Demand], ["kelowna", region2Demand]] as [string, number][]) {
          const locationState = simulationStateRef.current[id] ?? createInitialLocationState();
          const { next } = stepIndependent(locationState, demand, simulationHour, SIM_REORDER_POINT, SIM_LEAD_TIME);
          updatedStates[id] = next;
          simulationStateRef.current[id] = next;
          if (!simulationStatsRef.current[id]) simulationStatsRef.current[id] = createEmptyStats();
          const locationStats = simulationStatsRef.current[id];
          locationStats.demands.push(demand);
          locationStats.totalDemand         = next.totalDemand;
          locationStats.demandLost          = next.demandLost;
          locationStats.stockoutInstances   = next.stockoutInstances;
          locationStats.replenishmentOrders = next.replenishmentOrders;
        }
        setLocations((prev) => prev.map((loc) => {
          const nextState = updatedStates[loc.id];
          if (!nextState) return loc;
          return { ...loc, stock: { ...loc.stock, current: nextState.inventory } };
        }));
      }

      simulationHourRef.current += 1;
      setCurrentHour(simulationHour + 1);
    }, speedMilliseconds);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, speedMilliseconds]);

  const handlePlayPause = () => {
    if (isPlaying) {
      const captured = { ...simulationStatsRef.current };
      if (Object.values(captured).some((locationStats) => locationStats.demands.length > 0)) {
        setResultsData(captured);
        setShowResults(true);
      }
      setIsPlaying(false);
    } else {
      if (simulationHourRef.current === 0) {
        initSim(activeScenario, centralSafetyStockPercentage);
        setLocations(getScenarioLocations(activeScenario, centralSafetyStockPercentage));
        setDistributionCenterInventory(distributionCenterInventoryRef.current);
      }
      setIsPlaying(true);
    }
  };

  return {
    activeScenario,
    centralSafetyStockPercentage,
    locations,
    isPlaying,
    showResults,
    resultsData,
    currentHour,
    speedMilliseconds,
    distributionCenterInventory,
    setSpeedMilliseconds,
    setShowResults,
    handlePlayPause,
    handleScenarioChange,
    handleCentralPctChange,
    resetAll,
    simulationStatsRef,
    distributionCenterInitialRef,
  };
}
