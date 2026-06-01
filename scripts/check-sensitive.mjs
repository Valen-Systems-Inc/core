import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const ignoredDirectories = new Set([".git", "node_modules", "test-results"]);
const binaryExtensions = new Set([".exr", ".glb", ".png"]);
const forbidden = [
  ["private workspace id", /workspace-\d+/i],
  ["private prototype hostname", /valencoreprototype/i],
  ["private payment link", /\bplink_/i],
  ["private backend vendor name", /\baudos\b/i],
  ["private operator-agent name", /\botto\b/i],
  ["private runtime phase name", /Phase(?:Landing|Conversion|Usage)/],
  ["private proxy configuration", /\bWORKSPACE_PROXY_TARGET\b/],
  ["private internal login wiring", /\bINTERNAL_LOGIN\b/]
];

function files(directory = ".") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const violations = [];
const textFiles = files().filter((file) => file !== "scripts/check-sensitive.mjs" && !binaryExtensions.has(extname(file).toLowerCase()));
for (const file of textFiles) {
  const text = readFileSync(file, "utf8");
  for (const [label, pattern] of forbidden) {
    if (pattern.test(text)) violations.push(`${file}: ${label}`);
  }
}

if (violations.length) {
  console.error(violations.map((violation) => `- ${violation}`).join("\n"));
  process.exit(1);
}

console.log(`Sensitive-value check passed: ${textFiles.length} text files scanned.`);
