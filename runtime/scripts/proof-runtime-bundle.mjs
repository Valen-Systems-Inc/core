import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuntimeBundle } from "./runtime-bundler.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(join(os.tmpdir(), "valencore-runtime-bundle-proof-"));
const outfile = join(tempDir, "runtime.js");
const requiredMarkers = [
  "createValenWorkspaceBridge",
  "get-cards",
  "process-card-action",
  "report-runtime-status",
  "get-runtime-status"
];
const requiredCommentMarkers = [
  "A host may set window.VALEN_RUNTIME_ASSET_BASE",
  "Locked stage anchor",
  "MVP SHIPPING LOCK"
];

try {
  await buildRuntimeBundle({
    root,
    outfile,
    sourcemap: true
  });

  const output = await readFile(outfile, "utf8");
  const missingMarkers = requiredMarkers.filter((marker) => !output.includes(marker));
  if (missingMarkers.length) {
    console.error(`Missing bundled runtime markers: ${missingMarkers.join(", ")}`);
    process.exit(1);
  }

  const missingCommentMarkers = requiredCommentMarkers.filter((marker) => !output.includes(marker));
  if (missingCommentMarkers.length) {
    console.error(`Missing source comment markers: ${missingCommentMarkers.join(", ")}`);
    process.exit(1);
  }

  const fileStat = await stat(outfile);
  console.log(JSON.stringify({
    ok: true,
    proof: "comment-preserving-runtime-bundle",
    outfile,
    size: fileStat.size,
    sha256: sha256(output),
    markers: requiredMarkers,
    commentMarkers: requiredCommentMarkers
  }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}
