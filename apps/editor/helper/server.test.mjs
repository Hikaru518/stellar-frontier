// @vitest-environment node

import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { API_VERSION, createHelperServer } from "./server.mjs";

describe("helper server", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  let server;
  let baseUrl;

  beforeEach(async () => {
    server = createHelperServer({ repoRoot });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("returns helper metadata from /api/health", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.api_version).toBe(API_VERSION);
    expect(body.repo_root).toBe(repoRoot);
  });

  it("serves the event library shape from /api/event-editor/library", async () => {
    const response = await fetch(`${baseUrl}/api/event-editor/library`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.definitions)).toBe(true);
    expect(body.definitions.length).toBeGreaterThan(0);
    expect(Array.isArray(body.call_templates)).toBe(true);
    expect(body.call_templates.length).toBeGreaterThan(0);
    expect(typeof body.schemas).toBe("object");
  });

  it("returns 404 for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/api/event-editor/something-else`);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("not_found");
  });

  it("rejects non-GET methods", async () => {
    const response = await fetch(`${baseUrl}/api/health`, { method: "POST" });
    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error.code).toBe("method_not_allowed");
  });
});
