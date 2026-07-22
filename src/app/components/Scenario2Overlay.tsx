import { Marker, Line } from "react-simple-maps";
import type { LocationData, SimStats } from "../simulation/types";
import { CENTRAL_HUB_COORDS, SIM_INVENTORY_CAPACITY } from "../simulation/constants";
import { InventoryCard } from "./InventoryCard";

export function Scenario2Overlay({
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
  const hub        = locations[0];
  const hubStock   = hub.stock;
  const hasStockout = (simulationStats["kamloops"]?.stockoutInstances ?? 0) > 0;
  const W = 168, H = 142, pinRadius = 13;
  const cardTop = -(H + 80);
  const hubCapacity = SIM_INVENTORY_CAPACITY * 2;

  return (
    <>
      <Line from={locations[0].coordinates} to={CENTRAL_HUB_COORDS} stroke="#0d9488" strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" />
      <Line from={locations[1].coordinates} to={CENTRAL_HUB_COORDS} stroke="#0d9488" strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" />

      {/* Central hub marker */}
      <Marker coordinates={CENTRAL_HUB_COORDS} style={{ cursor: "default" }}>
        <line x1={0} y1={-pinRadius} x2={0} y2={cardTop + H}
          stroke="#0d9488" strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="3 2"
          style={{ pointerEvents: "none" }} />
        <circle r={pinRadius} fill="white" stroke="#0d9488" strokeWidth={2.5} />
        <circle r={5} fill="#0d9488" />
        <text textAnchor="middle" y={pinRadius + 14} fill="#0d9488" fontSize={10} fontWeight="700"
          fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none", userSelect: "none" }}>Hub</text>
        <g transform={`translate(${-W / 2}, ${cardTop})`} style={{ pointerEvents: "none" }}>
          <InventoryCard metrics={hubStock} color="#0d9488" label="CENTRAL HUB" isCritical={hasStockout}
            stockouts={simulationStats["kamloops"]?.stockoutInstances}
            demandLost={simulationStats["kamloops"]?.demandLost} />
          {!hasStockout && (
            <g>
              <rect x={W - 46} y={5} width={38} height={14} rx={4} fill="#0d9488" fillOpacity={0.15} stroke="#0d9488" strokeWidth={1} strokeOpacity={0.4} />
              <text x={W - 27} y={14.5} textAnchor="middle" fontSize={7} fontWeight="700" fill="#0d9488" fontFamily="system-ui, sans-serif">◎ HUB</text>
            </g>
          )}
        </g>
      </Marker>

      {/* City pins (no inventory cards in S2 — service areas only) */}
      {locations.map((loc) => {
        const active    = hovered === loc.id;
        const cityPinR  = active ? 18 : 13;
        return (
          <Marker key={loc.id} coordinates={loc.coordinates}
            onMouseEnter={() => onHover(loc.id)} onMouseLeave={() => onHover(null)}
            style={{ cursor: "default" }}>
            {active && <circle r={30} fill={loc.color} fillOpacity={0.08} stroke={loc.color} strokeWidth={1} strokeOpacity={0.25} />}
            <circle r={cityPinR} fill={loc.color} fillOpacity={0.15} transform="translate(1,1)" />
            <circle r={cityPinR} fill="white" stroke={loc.color} strokeWidth={2.5} />
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
