import { Marker, Line } from "react-simple-maps";
import type { LocationData, SimStats } from "../simulation/types";
import { InventoryCard } from "./InventoryCard";

export function Scenario1Overlay({
  locations,
  hovered,
  simulationStats,
  onHover,
}: {
  locations: LocationData[];
  hovered: string | null;
  simulationStats: Record<string, SimStats>;
  onHover: (id: string | null) => void;
}) {
  return (
    <>
      <Line
        from={locations[0].coordinates}
        to={locations[1].coordinates}
        stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" strokeLinecap="round"
      />
      {locations.map((location) => {
        const active = hovered === location.id;
        const stock  = location.stock;
        const W = 205, H = 148;
        const pinRadius = active ? 18 : 13;
        const gap       = 14;
        const cardX     = location.cardSide === "left" ? -(pinRadius + gap + W) : pinRadius + gap;
        const cardY     = -H / 2;
        const connectorX1    = location.cardSide === "left" ? -pinRadius : pinRadius;
        const connectorX2    = location.cardSide === "left" ? -(pinRadius + gap) : pinRadius + gap;

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
