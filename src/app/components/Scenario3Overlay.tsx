import { Marker, Line } from "react-simple-maps";
import type { LocationData, SimStats } from "../simulation/types";
import { DC_S3_COORDS } from "../simulation/constants";
import { InventoryCard } from "./InventoryCard";

export function Scenario3Overlay({
  locations,
  hovered,
  simulationStats,
  distributionCenterInventory,
  distributionCenterInitialInventory,
  onHover,
}: {
  locations: LocationData[];
  hovered: string | null;
  simulationStats: Record<string, SimStats>;
  distributionCenterInventory: number;
  distributionCenterInitialInventory: number;
  onHover: (id: string | null) => void;
}) {
  const distributionCenterPercentage   = distributionCenterInitialInventory > 0 ? distributionCenterInventory / distributionCenterInitialInventory : 0;
  const distributionCenterStatusColor = distributionCenterInventory <= 0
    ? "#ef4444"
    : distributionCenterInventory < distributionCenterInitialInventory * 0.3
      ? "#f59e0b"
      : "#7c3aed";

  const distributionCenterCardWidth = 160, distributionCenterCardHeight = 72;
  const distributionCenterPinRadius = 10;
  const distributionCenterCardTop   = distributionCenterPinRadius + 55;
  const barWidth = 132, barHeight = 9;

  return (
    <>
      {/* Lines from forward facilities to DC */}
      <Line from={locations[0].coordinates} to={DC_S3_COORDS} stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
      <Line from={locations[1].coordinates} to={DC_S3_COORDS} stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
      {/* Direct supply line between warehouses */}
      <Line from={locations[0].coordinates} to={locations[1].coordinates} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" strokeLinecap="round" />

      {/* DC marker with mini card */}
      <Marker coordinates={DC_S3_COORDS} style={{ cursor: "default" }}>
        <line x1={0} y1={distributionCenterPinRadius} x2={0} y2={distributionCenterCardTop}
          stroke="#7c3aed" strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 2"
          style={{ pointerEvents: "none" }} />
        <g transform="rotate(45)">
          <rect x={-7} y={-7} width={14} height={14} fill="white" stroke="#7c3aed" strokeWidth={2} rx={2} />
        </g>
        <circle r={4} fill="#7c3aed" />
        <text textAnchor="middle" y={distributionCenterPinRadius + 12} fill="#7c3aed" fontSize={9} fontWeight="700"
          fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>DC</text>
        <g transform={`translate(${-distributionCenterCardWidth / 2}, ${distributionCenterCardTop})`} style={{ pointerEvents: "none" }}>
          <rect x={2} y={2} width={distributionCenterCardWidth} height={distributionCenterCardHeight} rx={7} fill="rgba(0,0,0,0.10)" />
          <rect width={distributionCenterCardWidth} height={distributionCenterCardHeight} rx={7} fill="white"
            stroke={distributionCenterInventory <= 0 ? "#ef4444" : "#7c3aed"}
            strokeWidth={distributionCenterInventory <= 0 ? 2 : 1.5}
            strokeOpacity={distributionCenterInventory <= 0 ? 0.9 : 0.5} />
          <rect width={4} height={distributionCenterCardHeight} rx={2} fill={distributionCenterInventory <= 0 ? "#ef4444" : "#7c3aed"} />
          <text x={14} y={16} fontSize={7.5} fontWeight="700" fill="#94a3b8" letterSpacing="0.08em" fontFamily="system-ui, sans-serif">DISTRIBUTION CENTRE</text>
          <text x={14} y={31} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">SS Reserve</text>
          <text x={distributionCenterCardWidth - 10} y={31} textAnchor="end" fontSize={9} fontWeight="700" fill={distributionCenterStatusColor} fontFamily="system-ui, sans-serif">
            {distributionCenterInventory.toLocaleString()} / {distributionCenterInitialInventory} units
          </text>
          <g transform="translate(14, 42)">
            <rect width={barWidth} height={barHeight} rx={4} fill="#f1f5f9" />
            <rect width={Math.max(barWidth * distributionCenterPercentage, distributionCenterInventory > 0 ? barHeight : 0)} height={barHeight} rx={4} fill={distributionCenterStatusColor} fillOpacity={0.75} />
            <text x={barWidth / 2} y={barHeight + 13} textAnchor="middle" fontSize={7} fill="#7c3aed" fontWeight="600" fontFamily="system-ui, sans-serif">
              {distributionCenterInventory <= 0 ? "DEPLETED" : `${Math.round(distributionCenterPercentage * 100)}% remaining`}
            </text>
          </g>
        </g>
      </Marker>

      {/* Forward facility pins with inventory cards */}
      {locations.map((location) => {
        const active    = hovered === location.id;
        const stock     = location.stock;
        const W = 205, H = 148;
        const pinRadius = active ? 18 : 13;
        const gap       = 14;
        const extraLeft = location.id === "kamloops" ? 40 : 0;
        const cardX     = location.cardSide === "left" ? -(pinRadius + gap + W + extraLeft) : pinRadius + gap;
        const cardY     = -H / 2;
        const connectorX1    = location.cardSide === "left" ? -pinRadius : pinRadius;
        const connectorX2    = location.cardSide === "left" ? -(pinRadius + gap + extraLeft) : pinRadius + gap;

        return (
          <Marker key={location.id} coordinates={location.coordinates}
            onMouseEnter={() => onHover(location.id)} onMouseLeave={() => onHover(null)}
            style={{ cursor: "default" }}>
            <g transform={`translate(${cardX}, ${cardY})`} style={{ pointerEvents: "none" }}>
              <InventoryCard metrics={stock} color={location.color} label="INVENTORY STATUS"
                stockouts={simulationStats[location.id]?.stockoutInstances}
                demandLost={simulationStats[location.id]?.demandLost} />
            </g>
            <line x1={connectorX1} y1={0} x2={connectorX2} y2={0} stroke={location.color} strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 2" style={{ pointerEvents: "none" }} />
            {active && <circle r={30} fill={location.color} fillOpacity={0.08} stroke={location.color} strokeWidth={1} strokeOpacity={0.25} />}
            <circle r={pinRadius} fill={location.color} fillOpacity={0.15} transform="translate(1,1)" />
            <circle r={pinRadius} fill="white" stroke={location.color} strokeWidth={2.5} />
            <circle r={5} fill={location.color} />
            <text textAnchor="middle" y={active ? 34 : 28} fill={location.color} fontSize={11} fontWeight="700"
              fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>
              {location.name}
            </text>
          </Marker>
        );
      })}
    </>
  );
}
