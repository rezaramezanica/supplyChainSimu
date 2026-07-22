
# Scenario 1 — Demand Generation & Stockout Logic

## Demand Generation

Before the simulation even starts, 2,920 random hourly demand values are generated for each warehouse (Kamloops and Kelowna) independently. Each value is drawn from a normal distribution with a mean of 5 units/hour and a standard deviation of 2, using the Box-Muller method. Values are rounded to whole numbers and clamped to zero (no negative demand). These arrays are fixed for the entire session — the same demand sequence plays back every time you run the simulation.

## How Each Hour Works (Scenario 1)

Each warehouse operates completely independently — no sharing of inventory or information between them. Every simulated hour, the following happens in order:

- **Receive pending order** — if a replenishment order was placed 16 hours ago, it arrives now, adding 1,000 units to inventory.
- **Decide whether to reorder** — if no order is already in transit, and inventory just crossed below the reorder point (80 units in the current configuration), a new order of 1,000 units is placed, scheduled to arrive 16 hours later.
- **Fulfill demand** — that hour's demand is subtracted from inventory. If there is enough stock, it is fully served. If not, the warehouse serves whatever it has and the remainder is recorded as demand lost.
- **Record a stockout** — if inventory was positive at the start of the hour but demand wiped it out (inventory hits zero), that hour counts as a stockout event.

## Why Stockouts Happen in Scenario 1

The reorder point is set to 80 units, which equals exactly the average demand expected during the 16-hour lead time (5 units/hr × 16 hrs). This means an order is triggered only when inventory reaches the average amount needed to last until the next delivery — with zero safety buffer.

Because demand fluctuates randomly around that average, roughly half of all replenishment cycles will see higher-than-average demand during the lead time. In those cycles, inventory runs out before the order arrives, causing a stockout. Each warehouse bears this risk independently, so both Kamloops and Kelowna are exposed to it separately with no way to help each other.

---

## Proposed Structure

```
src/app/
├── simulation/
│   ├── constants.ts          # All SIM_* constants
│   ├── types.ts              # ScenarioId, LocSimState, SimStats, LocationData, etc.
│   ├── stepFunctions.ts      # stepIndependent, stepPooled, stepScenario3, createInitialLocationState, createEmptyStats
│   ├── locationData.ts       # initialLocations, itemMaxQty, getScenario3Parameters, getScenarioLocations
│   └── demand.ts             # normalRandom, normalPDF, buildCurveData
│
├── hooks/
│   └── useSimulation.ts      # Custom hook — ALL simulation state, refs, loop, and callbacks
│
└── components/
    ├── BCMap.tsx             # Root: composes the pieces below (~50 lines)
    ├── SimulationHeader.tsx  # Top bar: scenario tabs, speed/DC-SS sliders, play/pause, reset
    ├── MapView.tsx           # ComposableMap + ZoomableGroup + geography layers
    ├── Scenario1Overlay.tsx  # Independent warehouse pins + inventory cards
    ├── Scenario2Overlay.tsx  # Pooled hub pin + city pins
    ├── Scenario3Overlay.tsx  # DC card + forward facility pins
    ├── InventoryCard.tsx     # SVG inventory card (already standalone)
    ├── ZoomControls.tsx      # +/- / reset zoom buttons
    ├── ResultsModal.tsx      # Full-screen results dialog (already standalone)
    └── StatCard.tsx          # Single stat tile inside ResultsModal (already standalone)
```

## Key Design Decisions

### useSimulation.ts — the most impactful split

This hook owns everything that makes the simulation tick:

```ts
// Returns:
{
  locations, currentHour, distributionCenterInventory, isPlaying,
  activeScenario, centralSafetyStockPercentage, speedMilliseconds,
  resultsData, showResults,
  handlePlayPause, handleScenarioChange, handleCentralPercentageChange,
  resetAll, setShowResults, setSpeedMilliseconds,
  simulationStatsRef   // passed by ref to map overlays for live stockout counts
}
```

BCMap becomes a thin shell that calls this hook and lays out the UI.

### Scenario overlays receive flat props

```tsx
<Scenario1Overlay
  locations={locations}
  simulationStats={simulationStatsRef.current}
  hovered={hovered}
  onHover={setHovered}
/>
```

No simulation logic inside — pure display.

### MapView.tsx owns the map container + base geography layers

The three scenario overlays are children rendered conditionally inside it based on `activeScenario`.

## What Stays Together vs Gets Separated

| Together                                                    | Reason                      |
| ----------------------------------------------------------- | --------------------------- |
| `stepFunctions.ts` shares constants from `constants.ts` | Tight dependency            |
| `Scenario3Overlay` includes the DC card SVG               | Only used there             |
| `InventoryCard` stays its own file                        | Used in S1, S2, S3 overlays |

| Separated                            | Reason                                                             |
| ------------------------------------ | ------------------------------------------------------------------ |
| Simulation logic →`useSimulation` | Removes ~200 lines of non-UI code from BCMap                       |
| Each scenario → own overlay file    | Each is ~60–100 lines; currently all share one 200-line JSX block |
| Types →`types.ts`                 | Needed by simulation files, hook, and components                   |

The biggest readability win is extracting `useSimulation` — the current BCMap mixes business logic (step functions, refs, interval) with rendering. After the split, BCMap would just call the hook and compose layout.

---

## CSS Files

- **index.css** — entry point, imported by `main.tsx`, pulls in the others
- **tailwind.css** — sets up Tailwind v4 with `@import 'tailwindcss'` and `@import 'tw-animate-css'`
- **theme.css** — defines all CSS custom properties (colors, radius, sidebar, charts) used by Tailwind utilities like `bg-background`, `text-foreground`, etc.
- **fonts.css** — empty (1 line)
- **globals.css** — empty (1 line)

## Other Files

| File                    | Status                                                 |
| ----------------------- | ------------------------------------------------------ |
| `vite-env.d.ts`       | TypeScript types for`import.meta.env`                |
| `.gitignore`          | Git config                                             |
| `index.html`          | Vite entry point                                       |
| `package-lock.json`   | dependency lock file                                   |
| `package.json`        | project config                                         |
| `pnpm-workspace.yaml` | configures pnpm architecture for Linux/ARM deployments |
| `postcss.config.mjs`  | empty but expected by PostCSS toolchain                |
| `README.md`           | documentation                                          |
| `tru_logo.png`        | used in SimulationHeader                               |
| `vite.config.ts`      | build config                                           |
