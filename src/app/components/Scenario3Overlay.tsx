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
  const dcPct   = distributionCenterInitialInventory > 0 ? distributionCenterInventory / distributionCenterInitialInventory : 0;
  const dcColor = distributionCenterInventory <= 0
    ? "#ef4444"
    : distributionCenterInventory < distributionCenterInitialInventory * 0.3
      ? "#f59e0b"
      : "#7c3aed";

  const W_DC = 160, H_DC = 72;
  const dcPinRadius = 10;
  const dcCardTop   = dcPinRadius + 55;
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
        <line x1={0} y1={dcPinRadius} x2={0} y2={dcCardTop}
          stroke="#7c3aed" strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 2"
          style={{ pointerEvents: "none" }} />
        <g transform="rotate(45)">
          <rect x={-7} y={-7} width={14} height={14} fill="white" stroke="#7c3aed" strokeWidth={2} rx={2} />
        </g>
        <circle r={4} fill="#7c3aed" />
        <text textAnchor="middle" y={dcPinRadius + 12} fill="#7c3aed" fontSize={9} fontWeight="700"
          fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>DC</text>
        <g transform={`translate(${-W_DC / 2}, ${dcCardTop})`} style={{ pointerEvents: "none" }}>
          <rect x={2} y={2} width={W_DC} height={H_DC} rx={7} fill="rgba(0,0,0,0.10)" />
          <rect width={W_DC} height={H_DC} rx={7} fill="white"
            stroke={distributionCenterInventory <= 0 ? "#ef4444" : "#7c3aed"}
            strokeWidth={distributionCenterInventory <= 0 ? 2 : 1.5}
            strokeOpacity={distributionCenterInventory <= 0 ? 0.9 : 0.5} />
          <rect width={4} height={H_DC} rx={2} fill={distributionCenterInventory <= 0 ? "#ef4444" : "#7c3aed"} />
          <text x={14} y={16} fontSize={7.5} fontWeight="700" fill="#94a3b8" letterSpacing="0.08em" fontFamily="system-ui, sans-serif">DISTRIBUTION CENTRE</text>
          <text x={14} y={31} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Safety Stock Reserve</text>
          <text x={W_DC - 10} y={31} textAnchor="end" fontSize={9} fontWeight="700" fill={dcColor} fontFamily="system-ui, sans-serif">
            {distributionCenterInventory.toLocaleString()} / {distributionCenterInitialInventory} units
          </text>
          <g transform="translate(14, 42)">
            <rect width={barWidth} height={barHeight} rx={4} fill="#f1f5f9" />
            <rect width={Math.max(barWidth * dcPct, distributionCenterInventory > 0 ? barHeight : 0)} height={barHeight} rx={4} fill={dcColor} fillOpacity={0.75} />
            <text x={barWidth / 2} y={barHeight + 13} textAnchor="middle" fontSize={7} fill="#7c3aed" fontWeight="600" fontFamily="system-ui, sans-serif">
              {distributionCenterInventory <= 0 ? "DEPLETED" : `${Math.round(dcPct * 100)}% remaining`}
            </text>
          </g>
        </g>
      </Marker>

      {/* Forward facility pins with inventory cards */}
      {locations.map((loc) => {
        const active    = hovered === loc.id;
        const stock     = loc.stock;
        const W = 168, H = 142;
        const pinRadius = active ? 18 : 13;
        const gap       = 14;
        const extraLeft = loc.id === "kamloops" ? 40 : 0;
        const cardX     = loc.cardSide === "left" ? -(pinRadius + gap + W + extraLeft) : pinRadius + gap;
        const cardY     = -H / 2;
        const connX1    = loc.cardSide === "left" ? -pinRadius : pinRadius;
        const connX2    = loc.cardSide === "left" ? -(pinRadius + gap + extraLeft) : pinRadius + gap;

        return (
          <Marker key={loc.id} coordinates={loc.coordinates}
            onMouseEnter={() => onHover(loc.id)} onMouseLeave={() => onHover(null)}
            style={{ cursor: "default" }}>
            <g transform={`translate(${cardX}, ${cardY})`} style={{ pointerEvents: "none" }}>
              <InventoryCard metrics={stock} color={loc.color} label="INVENTORY STATUS"
                stockouts={simulationStats[loc.id]?.stockoutInstances}
                demandLost={simulationStats[loc.id]?.demandLost} />
            </g>
            <line x1={connX1} y1={0} x2={connX2} y2={0} stroke={loc.color} strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 2" style={{ pointerEvents: "none" }} />
            {active && <circle r={30} fill={loc.color} fillOpacity={0.08} stroke={loc.color} strokeWidth={1} strokeOpacity={0.25} />}
            <circle r={pinRadius} fill={loc.color} fillOpacity={0.15} transform="translate(1,1)" />
            <circle r={pinRadius} fill="white" stroke={loc.color} strokeWidth={2.5} />
            <circle r={5} fill={loc.color} />
            <text textAnchor="middle" y={active ? 34 : 28} fill={loc.color} fontSize={11} fontWeight="700"
              fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>
              {loc.name}
            </text>
          </Marker>
        );
      })}
    </>
  );
}
