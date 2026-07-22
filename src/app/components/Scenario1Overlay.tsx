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
      {locations.map((loc) => {
        const active = hovered === loc.id;
        const stock  = loc.stock;
        const W = 168, H = 142;
        const pinRadius = active ? 18 : 13;
        const gap       = 14;
        const cardX     = loc.cardSide === "left" ? -(pinRadius + gap + W) : pinRadius + gap;
        const cardY     = -H / 2;
        const connX1    = loc.cardSide === "left" ? -pinRadius : pinRadius;
        const connX2    = loc.cardSide === "left" ? -(pinRadius + gap) : pinRadius + gap;

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
