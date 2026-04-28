import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEventEditorLibrary } from "./contentStore.mjs";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4317;
export const API_VERSION = "event-editor-helper.v1";

export function createHelperServer({ repoRoot = path.resolve(import.meta.dirname, "../..") } = {}) {
  return http.createServer(async (request, response) => {
    try {
      await routeRequest(request, response, repoRoot);
    } catch (error) {
      sendJson(response, 500, {
        error: {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown helper error.",
        },
      });
    }
  });
}

export function startHelperServer({
  repoRoot = path.resolve(import.meta.dirname, "../.."),
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

async function routeRequest(request, response, repoRoot) {
  const url = new URL(request.url ?? "/", `http://${DEFAULT_HOST}`);

  if (request.method !== "GET") {
    sendJson(response, 405, {
      error: {
        code: "method_not_allowed",
        message: "Only GET requests are supported by this read-only helper.",
      },
    });
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, {
      status: "ok",
      api_version: API_VERSION,
      repo_root: repoRoot,
      node_version: process.version,
    });
    return;
  }

  if (url.pathname === "/api/event-editor/library") {
    sendJson(response, 200, await loadEventEditorLibrary({ repoRoot }));
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
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startHelperServer();
}
