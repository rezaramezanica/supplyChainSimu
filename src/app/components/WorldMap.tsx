import { useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { Factory, MapPin, TrendingUp } from "lucide-react";

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface Location {
  name: string;
  coordinates: [number, number];
  type: "current" | "potential" | "demand";
  details: {
    cost?: string;
    proximity?: string;
    infrastructure?: string;
    risk?: string;
    demandLevel?: string;
    capacity?: string;
  };
}

const locations: Location[] = [
  {
    name: "Israel (Current Facility)",
    coordinates: [35.2137, 31.7683],
    type: "current",
    details: {
      cost: "High labor costs",
      proximity: "Far from Asian markets",
      infrastructure: "Excellent R&D, proven capability",
      risk: "Geopolitical risk, single-source dependency",
      capacity: "6M units/year (current)"
    }
  },
  {
    name: "China - Suzhou (Recommended)",
    coordinates: [120.5954, 31.2989],
    type: "potential",
    details: {
      cost: "Very low labor costs",
      proximity: "Close to customers - ideal location",
      infrastructure: "Strong supply chain ecosystem",
      risk: "IP concerns, employee turnover",
      capacity: "2M units/year (expansion)"
    }
  },
  {
    name: "Singapore",
    coordinates: [103.8198, 1.3521],
    type: "potential",
    details: {
      cost: "High costs",
      proximity: "Good - Southeast Asia hub",
      infrastructure: "Excellent, very stable",
      risk: "Low risk, strong regulations",
      capacity: "2M units/year (expansion)"
    }
  },
  {
    name: "Jordan",
    coordinates: [36.2384, 30.5852],
    type: "potential",
    details: {
      cost: "Low labor costs",
      proximity: "Close to Israel, far from Asia",
      infrastructure: "Uncertain",
      risk: "Political uncertainty",
      capacity: "2M units/year (expansion)"
    }
  }
];

// Demand centers with heat intensity
const demandZones = [
  { name: "Taiwan", coordinates: [121.0, 24.0], intensity: 0.9 },
  { name: "South Korea", coordinates: [127.5, 37.0], intensity: 0.8 },
  { name: "Eastern China", coordinates: [121.0, 31.0], intensity: 1.0 },
  { name: "Southeast Asia", coordinates: [103.8, 1.35], intensity: 0.85 },
  { name: "Japan", coordinates: [139.0, 36.0], intensity: 0.7 },
];

export function WorldMap() {
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMarkerClick = (location: Location, event: React.MouseEvent) => {
    setSelectedLocation(location);
    setTooltipPos({ x: event.clientX, y: event.clientY });
  };

  return (
    <div className="relative w-full h-full">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          scale: 180,
          center: [80, 20]
        }}
        className="w-full h-full"
      >
        <ZoomableGroup center={[80, 20]} zoom={1}>
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                // Color countries based on semiconductor demand
                const isChinaRegion = geo.properties.name === "China" || 
                                     geo.properties.name === "Taiwan";
                const isHighDemand = ["Taiwan", "South Korea", "Japan", "Singapore", "Malaysia", "Thailand", "China"].includes(geo.properties.name);
                
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={
                      isChinaRegion ? "#fecaca" :
                      isHighDemand ? "#fed7aa" :
                      "#e5e7eb"
                    }
                    stroke="#9ca3af"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none" },
                      hover: { fill: "#cbd5e1", outline: "none" },
                      pressed: { outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* Heat map circles for demand zones */}
          {demandZones.map((zone) => (
            <Marker key={zone.name} coordinates={zone.coordinates as [number, number]}>
              <circle
                r={12}
                fill="#ef4444"
                fillOpacity={zone.intensity * 0.3}
                stroke="#dc2626"
                strokeWidth={1}
                strokeOpacity={0.5}
              />
              <circle
                r={8}
                fill="#ef4444"
                fillOpacity={zone.intensity * 0.5}
              />
            </Marker>
          ))}

          {/* Location markers */}
          {locations.map((location) => (
            <Marker
              key={location.name}
              coordinates={location.coordinates}
              onClick={(event: any) => handleMarkerClick(location, event)}
              style={{ cursor: "pointer" }}
            >
              {location.type === "current" ? (
                <>
                  <circle r={8} fill="#3b82f6" stroke="#1e40af" strokeWidth={2} />
                  <Factory
                    x={-10}
                    y={-30}
                    size={20}
                    className="text-blue-600"
                    strokeWidth={2}
                  />
                </>
              ) : (
                <>
                  <circle 
                    r={6} 
                    fill={location.name.includes("Suzhou") ? "#10b981" : "#f59e0b"} 
                    stroke={location.name.includes("Suzhou") ? "#059669" : "#d97706"} 
                    strokeWidth={2}
                  />
                  <MapPin
                    x={-8}
                    y={-26}
                    size={16}
                    className={location.name.includes("Suzhou") ? "text-green-600" : "text-amber-600"}
                    strokeWidth={2}
                  />
                </>
              )}
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Info Panel */}
      {selectedLocation && (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-xl p-6 max-w-md border border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              {selectedLocation.type === "current" ? (
                <Factory className="text-blue-600" size={24} />
              ) : selectedLocation.name.includes("Suzhou") ? (
                <TrendingUp className="text-green-600" size={24} />
              ) : (
                <MapPin className="text-amber-600" size={24} />
              )}
              <h3 className="font-semibold text-lg">{selectedLocation.name}</h3>
            </div>
            <button
              onClick={() => setSelectedLocation(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3 text-sm">
            {selectedLocation.details.capacity && (
              <div>
                <span className="font-medium text-gray-700">Capacity:</span>
                <p className="text-gray-600">{selectedLocation.details.capacity}</p>
              </div>
            )}
            {selectedLocation.details.cost && (
              <div>
                <span className="font-medium text-gray-700">Cost:</span>
                <p className="text-gray-600">{selectedLocation.details.cost}</p>
              </div>
            )}
            {selectedLocation.details.proximity && (
              <div>
                <span className="font-medium text-gray-700">Market Proximity:</span>
                <p className="text-gray-600">{selectedLocation.details.proximity}</p>
              </div>
            )}
            {selectedLocation.details.infrastructure && (
              <div>
                <span className="font-medium text-gray-700">Infrastructure:</span>
                <p className="text-gray-600">{selectedLocation.details.infrastructure}</p>
              </div>
            )}
            {selectedLocation.details.risk && (
              <div>
                <span className="font-medium text-gray-700">Risk Factors:</span>
                <p className="text-gray-600">{selectedLocation.details.risk}</p>
              </div>
            )}
          </div>

          {selectedLocation.name.includes("Suzhou") && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-xs text-green-800 font-medium">✓ RECOMMENDED LOCATION</p>
              <p className="text-xs text-green-700 mt-1">Best balance of cost, proximity, and growth potential</p>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 border border-gray-200">
        <h4 className="font-semibold text-sm mb-3">Legend</h4>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Factory className="text-blue-600" size={16} />
            <span>Current Facility (Israel)</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="text-green-600" size={16} />
            <span>Recommended Location (Suzhou)</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="text-amber-600" size={16} />
            <span>Alternative Locations</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500 opacity-40"></div>
            <span>High Demand Zones (Asia)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-200"></div>
            <span>High Growth Regions</span>
          </div>
        </div>
      </div>
    </div>
  );
}
