import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuntimeBundle } from "./runtime-bundler.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(root, "src");
const tempDir = await mkdtemp(resolve(os.tmpdir(), "valencore-dist-sync-"));
const expectedRuntimePath = resolve(tempDir, "runtime.js");
const requiredCommentMarkers = [
  "A host may set window.VALEN_RUNTIME_ASSET_BASE",
  "Locked stage anchor",
  "MVP SHIPPING LOCK"
];

try {
  await buildRuntimeBundle({
    root,
    outfile: expectedRuntimePath,
    sourcemap: true
  });

  const expectedRuntime = await readFile(expectedRuntimePath, "utf8");
  const distRuntime = await readFile(resolve(root, "dist/runtime.js"), "utf8");

  if (distRuntime !== expectedRuntime) {
    console.error("dist/runtime.js is not in sync with src/runtime.js. Run npm run build.");
    process.exit(1);
  }

  const missingCommentMarkers = requiredCommentMarkers.filter((marker) => !distRuntime.includes(marker));
  if (missingCommentMarkers.length) {
    console.error(`dist/runtime.js is missing source comment marker(s): ${missingCommentMarkers.join(", ")}`);
    process.exit(1);
  }

  const distMap = JSON.parse(await readFile(resolve(root, "dist/runtime.js.map"), "utf8"));
  if (typeof distMap.mappings !== "string" || distMap.mappings.length === 0) {
    console.error("dist/runtime.js.map has no source mappings. Run npm run build.");
    process.exit(1);
  }

  const expectedSources = (await listSourceFiles(sourceRoot))
    .map((filePath) => `../src/${relative(sourceRoot, filePath).split(sep).join("/")}`)
    .sort();
  const actualSources = Array.isArray(distMap.sources) ? [...distMap.sources].sort() : [];
  const missingSources = expectedSources.filter((source) => !actualSources.includes(source));
  if (missingSources.length) {
    console.error(`dist/runtime.js.map is missing source module(s): ${missingSources.join(", ")}`);
    process.exit(1);
  }

  console.log("Runtime dist sync: OK");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    if (entry.isFile() && entry.name.endsWith(".js")) return [entryPath];
    return [];
  }));
  return files.flat();
}
