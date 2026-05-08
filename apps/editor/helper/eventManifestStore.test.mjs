// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEventDomain, loadEventDomainSummaries, validateEventManifest } from "./eventManifestStore.mjs";

describe("eventManifestStore", () => {
  let repoRoot;

  beforeEach(async () => {
    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-event-manifest-store-"));
    await writeJson("content/events/manifest.json", {
      schema_version: "event-manifest.v1",
      domains: [manifestDomain("forest", "presets/forest.json")],
    });
    await writeJson("content/events/definitions/forest.json", {
      event_definitions: [{ id: "forest.signal", domain: "forest" }],
    });
    await writeJson("content/events/call_templates/forest.json", {
      call_templates: [{ id: "forest.signal.call", domain: "forest" }],
    });
    await writeJson("content/events/presets/forest.json", {
      presets: [{ id: "forest.default" }],
    });
  });

  afterEach(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it("creates empty event domain files and appends a presets-null manifest entry", async () => {
    const result = await createEventDomain({ repoRoot, domainId: "ruins" });

    expect(result).toEqual(
      expect.objectContaining({
        created: true,
        written_files: [
          "content/events/definitions/ruins.json",
          "content/events/call_templates/ruins.json",
          "content/events/manifest.json",
        ],
        issues: [],
      }),
    );
    expect(result.domain).toEqual(
      expect.objectContaining({
        id: "ruins",
        manifest_path: "content/events/manifest.json",
        manifest_json_path: "/domains/1",
        definitions_file_path: "content/events/definitions/ruins.json",
        call_templates_file_path: "content/events/call_templates/ruins.json",
        presets_file_path: null,
        definition_count: 0,
        call_template_count: 0,
        preset_count: 0,
        has_presets: false,
      }),
    );
    await expect(readText("content/events/definitions/ruins.json")).resolves.toBe('{\n  "event_definitions": []\n}\n');
    await expect(readText("content/events/call_templates/ruins.json")).resolves.toBe('{\n  "call_templates": []\n}\n');

    const manifest = await readJson("content/events/manifest.json");
    expect(manifest.domains).toEqual([
      manifestDomain("forest", "presets/forest.json"),
      manifestDomain("ruins"),
    ]);
  });

  it("rejects duplicate domain ids without writing files", async () => {
    await expect(createEventDomain({ repoRoot, domainId: "forest" })).rejects.toMatchObject({
      code: "duplicate_domain_id",
    });

    const manifest = await readJson("content/events/manifest.json");
    expect(manifest.domains).toEqual([manifestDomain("forest", "presets/forest.json")]);
    await expect(fs.access(path.join(repoRoot, "content/events/definitions/forest.json"))).resolves.toBeUndefined();
  });

  it("rejects unsafe domain ids without writing files", async () => {
    await expect(createEventDomain({ repoRoot, domainId: "Bad/Domain" })).rejects.toMatchObject({
      code: "invalid_domain_id",
    });

    await expect(fs.access(path.join(repoRoot, "content/events/definitions/Bad/Domain.json"))).rejects.toThrow();
    const manifest = await readJson("content/events/manifest.json");
    expect(manifest.domains).toHaveLength(1);
  });

  it("rejects existing target files without overwriting them", async () => {
    await writeText("content/events/definitions/ruins.json", "sentinel\n");

    await expect(createEventDomain({ repoRoot, domainId: "ruins" })).rejects.toMatchObject({
      code: "file_exists",
      statusCode: 409,
      details: expect.objectContaining({
        file_path: "content/events/definitions/ruins.json",
      }),
    });

    await expect(readText("content/events/definitions/ruins.json")).resolves.toBe("sentinel\n");
    await expect(fs.access(path.join(repoRoot, "content/events/call_templates/ruins.json"))).rejects.toThrow();
    const manifest = await readJson("content/events/manifest.json");
    expect(manifest.domains).toHaveLength(1);
  });

  it("rejects an existing call template target without creating the paired definitions file", async () => {
    await writeText("content/events/call_templates/ruins.json", "sentinel\n");

    await expect(createEventDomain({ repoRoot, domainId: "ruins" })).rejects.toMatchObject({
      code: "file_exists",
      statusCode: 409,
      details: expect.objectContaining({
        file_path: "content/events/call_templates/ruins.json",
      }),
    });

    await expect(fs.access(path.join(repoRoot, "content/events/definitions/ruins.json"))).rejects.toThrow();
    await expect(readText("content/events/call_templates/ruins.json")).resolves.toBe("sentinel\n");
    const manifest = await readJson("content/events/manifest.json");
    expect(manifest.domains).toHaveLength(1);
  });

  it("loads domain summaries from the manifest", async () => {
    const summaries = await loadEventDomainSummaries({ repoRoot });

    expect(summaries).toEqual([
      expect.objectContaining({
        id: "forest",
        manifest_json_path: "/domains/0",
        definitions_file_path: "content/events/definitions/forest.json",
        call_templates_file_path: "content/events/call_templates/forest.json",
        presets_file_path: "content/events/presets/forest.json",
        definition_count: 1,
        call_template_count: 1,
        preset_count: 1,
        has_presets: true,
      }),
    ]);
  });

  it("validates a complete event manifest", async () => {
    await expect(validateEventManifest({ repoRoot })).resolves.toEqual({
      valid: true,
      issues: [],
    });
  });

  it("reports manifest issues for missing and unregistered formal event files", async () => {
    await fs.rm(path.join(repoRoot, "content/events/call_templates/forest.json"));
    await writeJson("content/events/definitions/unregistered.json", { event_definitions: [] });

    const result = await validateEventManifest({ repoRoot });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_manifest_file",
          file_path: "content/events/call_templates/forest.json",
        }),
        expect.objectContaining({
          code: "unregistered_domain_file",
          file_path: "content/events/definitions/unregistered.json",
        }),
      ]),
    );
  });

  async function writeJson(relativePath, value) {
    await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  async function readJson(relativePath) {
    return JSON.parse(await readText(relativePath));
  }

  async function writeText(relativePath, value) {
    const absolutePath = path.join(repoRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, value, "utf8");
  }

  async function readText(relativePath) {
    return fs.readFile(path.join(repoRoot, relativePath), "utf8");
  }
});

function manifestDomain(id, presets = null) {
  return {
    id,
    definitions: `definitions/${id}.json`,
    call_templates: `call_templates/${id}.json`,
    presets,
  };
}
