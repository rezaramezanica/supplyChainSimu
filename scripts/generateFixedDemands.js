/**
 * Generates fixed demand arrays and writes them to fixedDemands.json.
 * Uses the same Box-Muller normalRandom as the simulation.
 *
 * Usage:  node scripts/generateFixedDemands.js
 *
 * Edit MEAN and STD_DEV below to match your constants.ts values.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const MEAN     = 500;
const STD_DEV  = 150;
const HOURS    = 2920;

function normalRandom(mean, std) {
  const u1 = Math.random(), u2 = Math.random();
  const z  = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(mean + z * std));
}

const demands = {
  r1: Array.from({ length: HOURS }, () => normalRandom(MEAN, STD_DEV)),
  r2: Array.from({ length: HOURS }, () => normalRandom(MEAN, STD_DEV)),
};

const outPath = path.join(__dirname, "..", "src", "app", "simulation", "fixedDemands.json");
fs.writeFileSync(outPath, JSON.stringify(demands, null, 2));
console.log(`Written ${HOURS} demands per region to ${outPath}`);
