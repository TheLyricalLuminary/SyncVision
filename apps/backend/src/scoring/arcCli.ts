/**
 * arcCli.ts — dev tool. Run the scene-arc engine on a scene string.
 *
 *   npx tsx src/scoring/arcCli.ts "Two brothers reconnect at a funeral..."
 *
 * Prints the full SceneArcResult as JSON. Used for calibration, debugging, and
 * generalization probes. Not wired into the server.
 */

import { extractSceneArc } from "./arcExtraction";

const scene = process.argv.slice(2).join(" ").trim();

if (!scene) {
  console.error('Usage: tsx src/scoring/arcCli.ts "<scene description>"');
  process.exit(1);
}

const result = extractSceneArc(scene);
console.log(JSON.stringify(result, null, 2));
