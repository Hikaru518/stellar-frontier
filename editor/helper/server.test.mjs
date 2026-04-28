// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { createHelperServer, DEFAULT_HOST } from "./server.mjs";

describe("helper server", () => {
  const servers = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  });

  it("listens on 127.0.0.1 and returns health information", async () => {
    expect(DEFAULT_HOST).toBe("127.0.0.1");
    const server = createHelperServer();
    servers.push(server);

    await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
    const address = server.address();
    const response = await fetch(`http://${DEFAULT_HOST}:${address.port}/api/health`);

    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      api_version: "event-editor-helper.v1",
      repo_root: expect.stringContaining("stellar-frontier"),
      node_version: process.version,
    });
  });

  it("serves the readonly event editor library", async () => {
    const server = createHelperServer();
    servers.push(server);

    await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
    const address = server.address();
    const response = await fetch(`http://${DEFAULT_HOST}:${address.port}/api/event-editor/library`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.manifest.schema_version).toBe("event-manifest.v1");
    expect(body.definitions.length).toBeGreaterThan(0);
    expect(body.call_templates.length).toBeGreaterThan(0);
    expect(body.handlers.length).toBeGreaterThan(0);
    expect(body.legacy_events[0]).toMatchObject({
      asset_type: "legacy_event",
      editable: false,
    });
    expect(body.validation.passed).toBe(true);
  });

  it("returns JSON errors for unsupported routes", async () => {
    const server = createHelperServer();
    servers.push(server);

    await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
    const address = server.address();
    const response = await fetch(`http://${DEFAULT_HOST}:${address.port}/api/event-editor/missing`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Route not found.",
      },
    });
  });
});
