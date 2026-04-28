import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEventEditorLibrary, saveDraftAsset, validateDraftAsset } from "./contentStore.mjs";
import { createEventDomain } from "./manifestStore.mjs";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4317;
export const API_VERSION = "event-editor-helper.v1";

export function createHelperServer({
  repoRoot = path.resolve(import.meta.dirname, "../../.."),
  sourceRoot = repoRoot,
} = {}) {
  return http.createServer(async (request, response) => {
    try {
      await routeRequest(request, response, { repoRoot, sourceRoot });
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
  sourceRoot = repoRoot,
  host = DEFAULT_HOST,
  port = Number(process.env.EVENT_EDITOR_HELPER_PORT ?? DEFAULT_PORT),
} = {}) {
  const server = createHelperServer({ repoRoot, sourceRoot });
  server.listen(port, host, () => {
    const address = server.address();
    const boundPort = typeof address === "object" && address ? address.port : port;
    console.log(`Event editor helper listening on http://${host}:${boundPort}`);
  });
  return server;
}

async function routeRequest(request, response, { repoRoot, sourceRoot }) {
  const url = new URL(request.url ?? "/", `http://${DEFAULT_HOST}`);

  if (request.method !== "GET" && request.method !== "POST") {
    sendJson(response, 405, {
      error: {
        code: "method_not_allowed",
        message: "Only GET and POST requests are supported.",
      },
    });
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
    sendJson(response, 200, await loadEventEditorLibrary({ repoRoot, sourceRoot }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/event-editor/validate-draft") {
    const result = await validateDraftAsset({ repoRoot, sourceRoot, body: await readJsonRequest(request) });
    sendJson(response, result.statusCode, result.body);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/event-editor/save") {
    const result = await saveDraftAsset({ repoRoot, sourceRoot, body: await readJsonRequest(request) });
    sendJson(response, result.statusCode, result.body);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/event-editor/create-domain") {
    const result = await createEventDomain({ repoRoot, sourceRoot, body: await readJsonRequest(request) });
    sendJson(response, result.statusCode, result.body);
    return;
  }

  sendJson(response, 404, {
    error: {
      code: "not_found",
      message: "Route not found.",
    },
  });
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

async function readJsonRequest(request) {
  const contentType = request.headers["content-type"] ?? "";
  if (!String(contentType).toLowerCase().includes("application/json")) {
    throw httpError(415, "unsupported_media_type", "POST requests must use application/json.");
  }

  let rawBody = "";
  for await (const chunk of request) {
    rawBody += chunk;
    if (rawBody.length > 1_000_000) {
      throw httpError(413, "payload_too_large", "Request body is too large.");
    }
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw httpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startHelperServer();
}
