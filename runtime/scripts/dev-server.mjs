import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalValenCardHarness } from "./local-valen-card-harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.resolve(rootDir, "public");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || "9252");
const localValenHarness = createLocalValenCardHarness();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : null;
}

async function handleLocalValenHook(req, res) {
  const bodyBuffer = req.method === "GET" || req.method === "HEAD" ? null : await readRequestBody(req);
  const bodyText = bodyBuffer ? bodyBuffer.toString("utf8") : "";
  const body = bodyText ? JSON.parse(bodyText) : {};
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);
  const hook = decodeURIComponent(parts[4] || "");
  const query = Object.fromEntries(url.searchParams.entries());
  const result = await localValenHarness.handleHookRequest({
    hook,
    method: req.method,
    query,
    body
  });
  sendJson(res, result.status, result.body);
}

function resolvePath(urlPathname) {
  const pathname = decodeURIComponent(urlPathname.split("?")[0]);
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const roots = normalized.startsWith("/dist/")
    ? [rootDir]
    : normalized.startsWith("/assets/")
      ? [rootDir]
      : [publicDir, rootDir];

  for (const baseDir of roots) {
    const candidate = path.resolve(baseDir, `.${normalized}`);
    if (candidate.startsWith(baseDir)) return candidate;
  }
  return null;
}

async function serveStatic(req, res) {
  const candidate = resolvePath(req.url || "/");
  if (!candidate) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  let filePath = candidate;
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    if (!path.extname(filePath)) filePath = path.join(rootDir, "index.html");
  }

  try {
    await access(filePath);
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=300"
    });
    createReadStream(filePath).pipe(res);
  } catch {
    sendJson(res, 404, { error: "not_found" });
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: "missing_url" });
    return;
  }
  if (req.url.startsWith("/api/hooks/execute/")) {
    try {
      await handleLocalValenHook(req, res);
    } catch (error) {
      console.error("Local Valen hook failed:", error);
      sendJson(res, 500, { error: "local_valen_hook_failed", detail: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (req.url.startsWith("/api/")) return sendJson(res, 404, { error: "local_api_route_not_found" });
  await serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`Core public playground listening on http://${host}:${port}`);
  console.log(`Serving local Valen card hooks from ${localValenHarness.storePath}`);
});
