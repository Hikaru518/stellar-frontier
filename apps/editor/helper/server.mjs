import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEventEditorLibrary } from "./contentStore.mjs";
import { loadMapEditorLibrary } from "./mapContentStore.mjs";
import { validateMapEditorMap } from "./mapValidation.mjs";
import { createPathGuard } from "./pathGuard.mjs";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4317;
export const API_VERSION = "event-editor-helper.v1";

export function createHelperServer({
  repoRoot = path.resolve(import.meta.dirname, "../../.."),
} = {}) {
  return http.createServer(async (request, response) => {
    try {
      await routeRequest(request, response, { repoRoot });
    } catch (error) {
      sendJson(response, error.statusCode ?? 500, {
        error: {
          code: error.code ?? "internal_error",
          message: error instanceof Error ? error.message : "Unknown helper error.",
        },
      });
    }
  });
}

export function startHelperServer({
  repoRoot = path.resolve(import.meta.dirname, "../../.."),
  host = DEFAULT_HOST,
  port = Number(process.env.EVENT_EDITOR_HELPER_PORT ?? DEFAULT_PORT),
} = {}) {
  const server = createHelperServer({ repoRoot });
  server.listen(port, host, () => {
    const address = server.address();
    const boundPort = typeof address === "object" && address ? address.port : port;
    console.log(`Event editor helper listening on http://${host}:${boundPort}`);
  });
  return server;
}

async function routeRequest(request, response, { repoRoot }) {
  const url = new URL(request.url ?? "/", `http://${DEFAULT_HOST}`);

  if (request.method === "OPTIONS") {
    sendEmpty(response, 204);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      status: "ok",
      api_version: API_VERSION,
      repo_root: repoRoot,
      node_version: process.version,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/event-editor/library") {
    sendJson(response, 200, await loadEventEditorLibrary({ repoRoot }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/map-editor/library") {
    sendJson(response, 200, await loadMapEditorLibrary({ repoRoot }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/map-editor/validate") {
    const body = await readJsonBody(request);
    const data = extractMapDraft(body);
    const library = await loadMapEditorLibrary({ repoRoot });
    sendJson(response, 200, validateMapEditorMap(data, {
      mapObjects: library.map_objects,
      tilesetRegistry: library.tileset_registry,
    }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/map-editor/save") {
    const body = await readJsonBody(request);
    const data = extractMapDraft(body);
    const library = await loadMapEditorLibrary({ repoRoot });
    const validation = validateMapEditorMap(data, {
      mapObjects: library.map_objects,
      tilesetRegistry: library.tileset_registry,
    });

    if (!validation.valid) {
      sendJson(response, 200, {
        ...validation,
        saved: false,
      });
      return;
    }

    const filePath = getMapSavePath(body, data);
    const guard = createPathGuard(repoRoot, ["content/maps"]);
    const absolutePath = guard.resolveAllowedPath(filePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    sendJson(response, 200, {
      ...validation,
      saved: true,
      file_path: filePath,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/map-editor/assets") {
    const assetPath = url.searchParams.get("path");
    if (!isAllowedAssetPath(assetPath)) {
      sendJson(response, 400, {
        error: {
          code: "path_not_allowed",
          message: "Asset path must be a repository-relative PNG path under assets/.",
        },
      });
      return;
    }

    const guard = createPathGuard(repoRoot, ["assets"]);
    const absolutePath = guard.resolveAllowedPath(assetPath);
    const content = await fs.readFile(absolutePath);
    sendBinary(response, 200, content, "image/png");
    return;
  }

  if (isKnownRouteWithWrongMethod(url.pathname, request.method)) {
    sendJson(response, 405, {
      error: {
        code: "method_not_allowed",
        message: "Only GET, POST, and OPTIONS requests are supported.",
      },
    });
    return;
  }

  sendJson(response, 404, {
    error: {
      code: "not_found",
      message: "Route not found.",
    },
  });
}

function isKnownRouteWithWrongMethod(pathname, method) {
  const supportedMethodsByPath = {
    "/api/health": ["GET"],
    "/api/event-editor/library": ["GET"],
    "/api/map-editor/library": ["GET"],
    "/api/map-editor/validate": ["POST"],
    "/api/map-editor/save": ["POST"],
    "/api/map-editor/assets": ["GET"],
  };
  const supportedMethods = supportedMethodsByPath[pathname];
  return Boolean(supportedMethods && !supportedMethods.includes(method));
}

async function readJsonBody(request) {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.byteLength;
    if (byteLength > 1_000_000) {
      throw httpError(413, "request_too_large", "JSON request body is too large.");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    throw httpError(400, "invalid_json", "JSON request body is required.");
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

function extractMapDraft(body) {
  const data = body?.data ?? body?.draft ?? body?.map?.data ?? body;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw httpError(400, "invalid_map_payload", "Map payload must include an object draft.");
  }
  return data;
}

function getMapSavePath(body, data) {
  const filePath = body?.file_path ?? body?.map?.file_path ?? defaultMapSavePath(data);
  if (!isAllowedMapSavePath(filePath)) {
    throw httpError(400, "path_not_allowed", "Map save path must be content/maps/<file>.json.");
  }
  return filePath;
}

function defaultMapSavePath(data) {
  if (typeof data?.id !== "string" || !/^[a-z][a-z0-9_-]*$/.test(data.id)) {
    throw httpError(400, "invalid_map_id", "Map id must be a safe file name.");
  }
  return `content/maps/${data.id}.json`;
}

function isAllowedMapSavePath(filePath) {
  return typeof filePath === "string" && /^content\/maps\/[a-z][a-z0-9_-]*\.json$/.test(filePath);
}

function isAllowedAssetPath(assetPath) {
  return typeof assetPath === "string"
    && path.posix.normalize(assetPath) === assetPath
    && assetPath.startsWith("assets/")
    && assetPath.endsWith(".png");
}

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function sendBinary(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": contentType,
  });
  response.end(body);
}

function sendEmpty(response, statusCode) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  response.end();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startHelperServer();
}
