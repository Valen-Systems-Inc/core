import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuntimeBundle } from "./runtime-bundler.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "dist/runtime.js");

await buildRuntimeBundle({
  root,
  outfile: outputPath,
  sourcemap: true
});
