import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

const STATIC_IMPORT_PATTERN = /^\s*import\s+(?:["'](\.[^"']+)["']|[\s\S]*?\s+from\s+["'](\.[^"']+)["']);\s*$/gm;
const SOURCEMAP_FOOTER_PATTERN = /\n*\/\/# sourceMappingURL=runtime\.js\.map\s*$/;
const BASE64_VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export async function buildRuntimeBundle({
  root,
  outfile,
  sourcemap = true
}) {
  const runtimeRoot = resolve(root);
  const sourceRoot = resolve(runtimeRoot, "src");
  const entryPath = resolve(sourceRoot, "runtime.js");
  const modules = [];
  const seen = new Set();

  await visitModule(entryPath, { modules, seen });

  const { runtime: bundledRuntime, mappings } = createRuntimeBundleSource({
    modules,
    sourceRoot
  });

  await mkdir(dirname(outfile), { recursive: true });
  await writeFile(outfile, bundledRuntime);

  const mapPath = `${outfile}.map`;
  if (sourcemap) {
    await writeFile(mapPath, `${JSON.stringify({
      version: 3,
      file: "runtime.js",
      sources: modules.map((moduleRecord) => `../${toRuntimeSourceLabel(sourceRoot, moduleRecord.filePath)}`),
      sourcesContent: modules.map((moduleRecord) => moduleRecord.source),
      names: [],
      mappings
    }, null, 2)}\n`);
  }

  return {
    outfile,
    mapPath,
    sources: modules.map((moduleRecord) => toRuntimeSourceLabel(sourceRoot, moduleRecord.filePath)),
    runtime: bundledRuntime
  };
}

function createRuntimeBundleSource({ modules, sourceRoot }) {
  const outputLines = [];
  const mappings = [];
  const encoderState = {
    previousSourceIndex: 0,
    previousSourceLine: 0,
    previousSourceColumn: 0
  };

  modules.forEach((moduleRecord, sourceIndex) => {
    const label = toRuntimeSourceLabel(sourceRoot, moduleRecord.filePath);
    const code = stripModuleSyntax(moduleRecord.source);

    outputLines.push(`// ${label}`);
    mappings.push("");

    code.split("\n").forEach((line, sourceLine) => {
      outputLines.push(line);
      mappings.push(line.trim() ? encodeLineMapping({
        sourceIndex,
        sourceLine,
        state: encoderState
      }) : "");
    });

    if (sourceIndex < modules.length - 1) {
      outputLines.push("");
      mappings.push("");
    }
  });

  mappings.push("");
  mappings.push("");

  return {
    runtime: `${outputLines.join("\n")}\n\n//# sourceMappingURL=runtime.js.map\n`,
    mappings: mappings.join(";")
  };
}

function encodeLineMapping({ sourceIndex, sourceLine, state }) {
  const segment = encodeVlq(0) +
    encodeVlq(sourceIndex - state.previousSourceIndex) +
    encodeVlq(sourceLine - state.previousSourceLine) +
    encodeVlq(0 - state.previousSourceColumn);

  state.previousSourceIndex = sourceIndex;
  state.previousSourceLine = sourceLine;
  state.previousSourceColumn = 0;

  return segment;
}

function encodeVlq(value) {
  let vlq = value < 0 ? ((-value) << 1) + 1 : value << 1;
  let encoded = "";

  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    encoded += BASE64_VLQ_CHARS[digit];
  } while (vlq > 0);

  return encoded;
}

async function visitModule(filePath, context) {
  const normalizedPath = resolve(filePath);
  if (context.seen.has(normalizedPath)) return;
  context.seen.add(normalizedPath);

  const source = await readFile(normalizedPath, "utf8");
  const imports = findStaticRelativeImports(source);
  for (const importSpecifier of imports) {
    await visitModule(await resolveImport(normalizedPath, importSpecifier), context);
  }

  context.modules.push({ filePath: normalizedPath, source });
}

function findStaticRelativeImports(source) {
  const imports = [];
  for (const match of source.matchAll(STATIC_IMPORT_PATTERN)) {
    imports.push(match[1] || match[2]);
  }
  return imports;
}

async function resolveImport(importerPath, importSpecifier) {
  const candidate = resolve(dirname(importerPath), importSpecifier);
  if (await isFile(candidate)) return candidate;
  if (await isFile(`${candidate}.js`)) return `${candidate}.js`;
  throw new Error(`Could not resolve runtime import ${importSpecifier} from ${importerPath}`);
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function stripModuleSyntax(source) {
  if (/^\s*export\s+default\b/m.test(source)) {
    throw new Error("The comment-preserving runtime bundler does not support default exports.");
  }
  if (/^\s*export\s*\{/m.test(source)) {
    throw new Error("The comment-preserving runtime bundler does not support export lists.");
  }

  return source
    .replace(STATIC_IMPORT_PATTERN, "")
    .replace(/\bexport\s+async\s+function\s+/g, "async function ")
    .replace(/\bexport\s+(const|let|var|function|class)\s+/g, "$1 ")
    .replace(SOURCEMAP_FOOTER_PATTERN, "")
    .trimEnd();
}

function toRuntimeSourceLabel(sourceRoot, filePath) {
  return `src/${relative(sourceRoot, filePath).split(sep).join("/")}`;
}
