// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHelperServer, DEFAULT_HOST } from "./server.mjs";

describe("helper server", () => {
  const servers = [];
  const tempRoots = [];
  const sourceRoot = path.resolve(import.meta.dirname, "../../..");

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
    await Promise.all(tempRoots.splice(0).map((tempRoot) => fs.rm(tempRoot, { recursive: true, force: true })));
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

  it("creates a new event domain package and refreshes the generated manifest", async () => {
    const repoRoot = await createTempContentRoot();
    const server = createHelperServer({ repoRoot, sourceRoot });
    servers.push(server);
    await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
    const address = server.address();
    const baseUrl = `http://${DEFAULT_HOST}:${address.port}`;
    const library = await getJson(`${baseUrl}/api/event-editor/library`);

    const response = await postJson(`${baseUrl}/api/event-editor/create-domain`, {
      domain_id: "test_lab",
      manifest_base_hash: library.manifest_base_hash,
    });
    const body = await response.json();
    const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, "content/events/manifest.json"), "utf8"));
    const definitions = JSON.parse(await fs.readFile(path.join(repoRoot, "content/events/definitions/test_lab.json"), "utf8"));
    const callTemplates = JSON.parse(
      await fs.readFile(path.join(repoRoot, "content/events/call_templates/test_lab.json"), "utf8"),
    );
    const generated = await fs.readFile(
      path.join(repoRoot, "apps/pc-client/src/content/generated/eventContentManifest.ts"),
      "utf8",
    );
    const refreshedLibrary = await getJson(`${baseUrl}/api/event-editor/library`);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "created",
      domain_id: "test_lab",
      files: {
        definitions: "content/events/definitions/test_lab.json",
        call_templates: "content/events/call_templates/test_lab.json",
        manifest: "content/events/manifest.json",
        generated: "apps/pc-client/src/content/generated/eventContentManifest.ts",
      },
      validation: { passed: true, issues: [], command: "npm run validate:content" },
    });
    expect(body.manifest_base_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.manifest_base_hash).not.toBe(library.manifest_base_hash);
    expect(manifest.domains.at(-1)).toEqual({
      id: "test_lab",
      definitions: "definitions/test_lab.json",
      call_templates: "call_templates/test_lab.json",
      presets: null,
    });
    expect(definitions.event_definitions[0]).toMatchObject({
      id: "test_lab.draft_event",
      domain: "test_lab",
      status: "draft",
      event_graph: {
        entry_node_id: "draft_call",
        terminal_node_ids: ["draft_resolved"],
      },
    });
    expect(callTemplates.call_templates[0]).toMatchObject({
      id: "test_lab.draft_event.call.draft_call",
      domain: "test_lab",
      event_definition_id: "test_lab.draft_event",
      node_id: "draft_call",
    });
    expect(generated).toContain(
      'import testLabEventDefinitionsContent from "../../../../../content/events/definitions/test_lab.json";',
    );
    expect(generated).toContain("...testLabCallTemplatesContent.call_templates");
    expect(refreshedLibrary.domains).toContain("test_lab");
    expect(refreshedLibrary.definitions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "test_lab.draft_event", domain: "test_lab" })]),
    );
    expect(refreshedLibrary.call_templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "test_lab.draft_event.call.draft_call", domain: "test_lab" }),
      ]),
    );
  });

  it("rejects duplicate event domains without changing the manifest", async () => {
    const repoRoot = await createTempContentRoot();
    const server = createHelperServer({ repoRoot, sourceRoot });
    servers.push(server);
    await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
    const address = server.address();
    const baseUrl = `http://${DEFAULT_HOST}:${address.port}`;
    const library = await getJson(`${baseUrl}/api/event-editor/library`);
    const originalManifest = await fs.readFile(path.join(repoRoot, "content/events/manifest.json"), "utf8");

    const response = await postJson(`${baseUrl}/api/event-editor/create-domain`, {
      domain_id: "forest",
      manifest_base_hash: library.manifest_base_hash,
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("domain_exists");
    await expect(fs.readFile(path.join(repoRoot, "content/events/manifest.json"), "utf8")).resolves.toBe(
      originalManifest,
    );
  });

  it("rejects unsafe event domain ids before writing files", async () => {
    const repoRoot = await createTempContentRoot();
    const server = createHelperServer({ repoRoot, sourceRoot });
    servers.push(server);
    await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
    const address = server.address();
    const baseUrl = `http://${DEFAULT_HOST}:${address.port}`;
    const library = await getJson(`${baseUrl}/api/event-editor/library`);
    const originalManifest = await fs.readFile(path.join(repoRoot, "content/events/manifest.json"), "utf8");

    const response = await postJson(`${baseUrl}/api/event-editor/create-domain`, {
      domain_id: "../evil",
      manifest_base_hash: library.manifest_base_hash,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_domain_id");
    await expect(fs.readFile(path.join(repoRoot, "content/events/manifest.json"), "utf8")).resolves.toBe(
      originalManifest,
    );
    await expect(fs.access(path.join(repoRoot, "content/events/definitions/evil.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects invalid scaffold content without leaving partial files", async () => {
    const repoRoot = await createTempContentRoot();
    const server = createHelperServer({ repoRoot, sourceRoot });
    servers.push(server);
    await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
    const address = server.address();
    const baseUrl = `http://${DEFAULT_HOST}:${address.port}`;
    const library = await getJson(`${baseUrl}/api/event-editor/library`);
    const originalManifest = await fs.readFile(path.join(repoRoot, "content/events/manifest.json"), "utf8");

    const response = await postJson(`${baseUrl}/api/event-editor/create-domain`, {
      domain_id: "bad_lab",
      manifest_base_hash: library.manifest_base_hash,
      scaffold: {
        event_definition: {
          domain: "bad_lab",
        },
      },
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("validation_failed");
    expect(body.validation.passed).toBe(false);
    await expect(fs.readFile(path.join(repoRoot, "content/events/manifest.json"), "utf8")).resolves.toBe(
      originalManifest,
    );
    await expect(fs.access(path.join(repoRoot, "content/events/definitions/bad_lab.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.access(path.join(repoRoot, "content/events/call_templates/bad_lab.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      fs.access(path.join(repoRoot, "apps/pc-client/src/content/generated/eventContentManifest.ts")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns conflict when the manifest base hash is stale", async () => {
    const repoRoot = await createTempContentRoot();
    const server = createHelperServer({ repoRoot, sourceRoot });
    servers.push(server);
    await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
    const address = server.address();
    const originalManifest = await fs.readFile(path.join(repoRoot, "content/events/manifest.json"), "utf8");

    const response = await postJson(`http://${DEFAULT_HOST}:${address.port}/api/event-editor/create-domain`, {
      domain_id: "stale_lab",
      manifest_base_hash: "0".repeat(64),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("conflict");
    expect(body.current_manifest_base_hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(fs.readFile(path.join(repoRoot, "content/events/manifest.json"), "utf8")).resolves.toBe(
      originalManifest,
    );
    await expect(fs.access(path.join(repoRoot, "content/events/definitions/stale_lab.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("saves a valid draft after validation and returns the new base hash", async () => {
    const repoRoot = await createTempContentRoot();
    const server = createHelperServer({ repoRoot, sourceRoot });
    servers.push(server);
    await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
    const address = server.address();
    const library = await getJson(`http://${DEFAULT_HOST}:${address.port}/api/event-editor/library`);
    const asset = library.definitions[0];
    const draft = { ...asset.data, title: `${asset.data.title} - edited` };

    const response = await postJson(`http://${DEFAULT_HOST}:${address.port}/api/event-editor/save`, {
      asset_type: asset.asset_type,
      asset_id: asset.id,
      file_path: asset.file_path,
      json_path: asset.json_path,
      base_hash: asset.base_hash,
      draft,
      change_summary: "Update test title",
    });
    const body = await response.json();
    const written = JSON.parse(await fs.readFile(path.join(repoRoot, asset.file_path), "utf8"));

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "saved",
      file_path: asset.file_path,
      asset_type: "event_definition",
      asset_id: asset.id,
      validation: { passed: true, issues: [], command: "npm run validate:content" },
    });
    expect(body.base_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.base_hash).not.toBe(asset.base_hash);
    expect(written.event_definitions[0].title).toBe(draft.title);
    await expect(fs.readFile(path.join(repoRoot, asset.file_path), "utf8")).resolves.toContain('\n  "event_definitions": [\n');
  });

  it("validates a draft without writing the content file", async () => {
    const repoRoot = await createTempContentRoot();
    const server = createHelperServer({ repoRoot, sourceRoot });
    servers.push(server);
    await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
    const address = server.address();
    const library = await getJson(`http://${DEFAULT_HOST}:${address.port}/api/event-editor/library`);
    const asset = library.definitions[0];
    const originalFile = await fs.readFile(path.join(repoRoot, asset.file_path), "utf8");
    const { id, ...draftWithoutId } = asset.data;

    const response = await postJson(`http://${DEFAULT_HOST}:${address.port}/api/event-editor/validate-draft`, {
      asset_type: asset.asset_type,
      asset_id: asset.id,
      file_path: asset.file_path,
      json_path: asset.json_path,
      base_hash: asset.base_hash,
      draft: draftWithoutId,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.validation.passed).toBe(false);
    expect(body.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "schema_validation_failed",
          file_path: asset.file_path,
          asset_type: "event_definition",
          asset_id: asset.id,
          json_path: `${asset.json_path}/id`,
          message: expect.stringContaining("required property"),
        }),
      ]),
    );
    await expect(fs.readFile(path.join(repoRoot, asset.file_path), "utf8")).resolves.toBe(originalFile);
  });

  it("does not write invalid drafts through the save endpoint", async () => {
    const repoRoot = await createTempContentRoot();
    const server = createHelperServer({ repoRoot, sourceRoot });
    servers.push(server);
    await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
    const address = server.address();
    const library = await getJson(`http://${DEFAULT_HOST}:${address.port}/api/event-editor/library`);
    const asset = library.call_templates[0];
    const originalFile = await fs.readFile(path.join(repoRoot, asset.file_path), "utf8");
    const { option_lines, ...draftWithoutOptionLines } = asset.data;

    const response = await postJson(`http://${DEFAULT_HOST}:${address.port}/api/event-editor/save`, {
      asset_type: asset.asset_type,
      asset_id: asset.id,
      file_path: asset.file_path,
      json_path: asset.json_path,
      base_hash: asset.base_hash,
      draft: draftWithoutOptionLines,
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("validation_failed");
    expect(body.validation.passed).toBe(false);
    await expect(fs.readFile(path.join(repoRoot, asset.file_path), "utf8")).resolves.toBe(originalFile);
  });

  it("returns conflict when the base hash no longer matches", async () => {
    const repoRoot = await createTempContentRoot();
    const server = createHelperServer({ repoRoot, sourceRoot });
    servers.push(server);
    await new Promise((resolve) => server.listen(0, DEFAULT_HOST, resolve));
    const address = server.address();
    const library = await getJson(`http://${DEFAULT_HOST}:${address.port}/api/event-editor/library`);
    const asset = library.definitions[0];
    const filePath = path.join(repoRoot, asset.file_path);
    const currentFile = JSON.parse(await fs.readFile(filePath, "utf8"));
    currentFile.event_definitions[0] = { ...currentFile.event_definitions[0], title: "External edit wins" };
    await fs.writeFile(filePath, `${JSON.stringify(currentFile, null, 2)}\n`);

    const response = await postJson(`http://${DEFAULT_HOST}:${address.port}/api/event-editor/save`, {
      asset_type: asset.asset_type,
      asset_id: asset.id,
      file_path: asset.file_path,
      json_path: asset.json_path,
      base_hash: asset.base_hash,
      draft: { ...asset.data, title: "Attempted overwrite" },
    });
    const body = await response.json();
    const written = JSON.parse(await fs.readFile(filePath, "utf8"));

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("conflict");
    expect(body.current_base_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(written.event_definitions[0].title).toBe("External edit wins");
  });

  async function createTempContentRoot() {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-editor-helper-"));
    tempRoots.push(repoRoot);
    await fs.cp(path.join(sourceRoot, "content"), path.join(repoRoot, "content"), { recursive: true });
    return repoRoot;
  }

  async function getJson(url) {
    const response = await fetch(url);
    expect(response.status).toBe(200);
    return response.json();
  }

  async function postJson(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
});
