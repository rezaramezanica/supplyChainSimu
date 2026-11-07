import React, { useState } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { useSimulation } from "../hooks/useSimulation";
import { WORLD_GEO, CANADA_GEO, US_GEO, COUNTRY_LABELS, SIM_TOTAL_HOURS } from "../simulation/constants";
import { SimulationHeader } from "./SimulationHeader";
import { Scenario1Overlay } from "./Scenario1Overlay";
import { Scenario2Overlay } from "./Scenario2Overlay";
import { Scenario3Overlay } from "./Scenario3Overlay";
import { ZoomControls } from "./ZoomControls";
import { ResultsModal } from "./ResultsModal";
import { BatchResultsModal } from "./BatchResultsModal";

export function BCMap() {
  const [hovered, setHovered]                     = useState<string | null>(null);
  const [zoom, setZoom]                           = useState(1);
  const [center, setCenter]                       = useState<[number, number]>([-119.8, 50.35]);

  const {
    activeScenario,
    centralSafetyStockPercentage,
    hubSafetyStock,
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
    handleHubSafetyStockChange,
    resetAll,
    simulationStatsRef,
    distributionCenterInitialRef,
    handleBatchRun,
    isBatchRunning,
    showBatchResults,
    setShowBatchResults,
    batchResult,
  } = useSimulation();

  const isScenario2    = activeScenario === 2;
  const isScenario3 = activeScenario === 3;

  const zoomIn    = () => setZoom((z) => Math.min(z * 1.5, 12));
  const zoomOut   = () => setZoom((z) => Math.max(z / 1.5, 0.15));
  const resetView = () => { setZoom(1); setCenter([-119.8, 50.35]); };

  return (
    <div className="relative w-full h-full bg-slate-100 overflow-hidden font-sans">

      <SimulationHeader
        activeScenario={activeScenario}
        isPlaying={isPlaying}
        speedMilliseconds={speedMilliseconds}
        centralSafetyStockPercentage={centralSafetyStockPercentage}
        hubSafetyStock={hubSafetyStock}
        onScenarioChange={handleScenarioChange}
        onPlayPause={handlePlayPause}
        onBatchRun={handleBatchRun}
        isBatchRunning={isBatchRunning}
        onReset={() => resetAll(activeScenario)}
        onSpeedChange={setSpeedMilliseconds}
        onCentralPctChange={handleCentralPctChange}
        onHubSafetyStockChange={handleHubSafetyStockChange}
      />

      {/* Map */}
      <div className="absolute inset-0 top-20">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: [-119.8, 50.35], scale: 4400 }}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup zoom={zoom} center={center}
            onMoveEnd={({ zoom: z, coordinates }) => { setZoom(z); setCenter(coordinates); }}>

            {/* World base layer */}
            <Geographies geography={WORLD_GEO}>
              {({ geographies }) => geographies.map((geo) => (
                <Geography key={geo.rsmKey} geography={geo} fill="#e8ecf0" stroke="#d0d7e0" strokeWidth={0.3}
                  style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
              ))}
            </Geographies>

            <Geographies geography={US_GEO}>
              {({ geographies }) => geographies.map((geo) => (
                <Geography key={geo.rsmKey} geography={geo} fill="#dde3ea" stroke="#c8d0da" strokeWidth={0.6}
                  style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
              ))}
            </Geographies>

            <Geographies geography={CANADA_GEO}>
              {({ geographies }) => geographies.map((geo) => {
                const isBC = geo.properties.name === "British Columbia";
                return (
                  <Geography key={geo.rsmKey} geography={geo}
                    fill={isBC ? "#bfdbfe" : "#dde3ea"} stroke={isBC ? "#60a5fa" : "#c8d0da"}
                    strokeWidth={isBC ? 1.2 : 0.6}
                    style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
                );
              })}
            </Geographies>

            {/* Country labels */}
            {zoom < 1.5 && COUNTRY_LABELS.map(({ name, coords }) => (
              <Marker key={name} coordinates={coords}>
                <text textAnchor="middle" fill="#94a3b8"
                  fontSize={10 / zoom} fontFamily="system-ui, sans-serif"
                  fontWeight="700" letterSpacing="0.12em"
                  style={{ pointerEvents: "none", userSelect: "none" }}>
                  {name}
                </text>
              </Marker>
            ))}

            {/* Vancouver label */}
            <Marker coordinates={[-123.1216, 49.2827]}>
              <circle r={3 / zoom} fill="#64748b" fillOpacity={0.5} />
              <text y={-6 / zoom} textAnchor="middle" fill="#475569"
                fontSize={8 / zoom} fontFamily="system-ui, sans-serif"
                fontWeight="600" style={{ pointerEvents: "none", userSelect: "none" }}>
                Vancouver
              </text>
            </Marker>

            {/* Scenario overlays */}
            {isScenario2 && (
              <Scenario2Overlay
                locations={locations}
                hovered={hovered}
                simulationStats={simulationStatsRef.current}
                onHover={setHovered}
              />
            )}
            {isScenario3 && (
              <Scenario3Overlay
                locations={locations}
                hovered={hovered}
                simulationStats={simulationStatsRef.current}
                distributionCenterInventory={distributionCenterInventory}
                distributionCenterInitialInventory={distributionCenterInitialRef.current}
                onHover={setHovered}
              />
            )}
            {!isScenario2 && !isScenario3 && (
              <Scenario1Overlay
                locations={locations}
                hovered={hovered}
                simulationStats={simulationStatsRef.current}
                onHover={setHovered}
              />
            )}

          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* Hour/Day counter */}
      {currentHour > 0 && (
        <div className="absolute top-24 left-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 backdrop-blur-sm border border-slate-200 text-xs text-slate-500 shadow-sm">
          <span className="font-semibold text-slate-700">Day {Math.floor(currentHour / 8) + 1}</span>
          <span className="text-slate-300">·</span>
          <span>Hr {(currentHour % 8) + 1}</span>
          <span className="text-slate-300 mx-0.5">|</span>
          <span className="tabular-nums">{currentHour}/{SIM_TOTAL_HOURS}</span>
        </div>
      )}

      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} onResetView={resetView} />

      {showResults && (
        <ResultsModal
          locations={locations}
          results={resultsData}
          isScenario2={isScenario2}
          isScenario3={isScenario3}
          distributionCenterInitialInventory={distributionCenterInitialRef.current}
          onClose={() => setShowResults(false)}
        />
      )}

      {showBatchResults && batchResult && (
        <BatchResultsModal
          result={batchResult}
          isScenario2={isScenario2}
          isScenario3={isScenario3}
          onClose={() => setShowBatchResults(false)}
        />
      )}
    </div>
  );
}
