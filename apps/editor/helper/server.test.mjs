// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { API_VERSION, createHelperServer } from "./server.mjs";

describe("helper server", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  let server;
  let baseUrl;
  let tempRepoRoot;

  beforeEach(async () => {
    server = createHelperServer({ repoRoot });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (tempRepoRoot) {
      await fs.rm(tempRepoRoot, { recursive: true, force: true });
      tempRepoRoot = undefined;
    }
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

  it("creates event domains from /api/event-editor/domains", async () => {
    await restartWithTempEventRepo();
    const response = await postJson("/api/event-editor/domains", {
      domain_id: "ruins",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(
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
    expect(body.domain).toEqual(
      expect.objectContaining({
        id: "ruins",
        definitions_file_path: "content/events/definitions/ruins.json",
        call_templates_file_path: "content/events/call_templates/ruins.json",
      }),
    );
    await expect(readTempJson("content/events/definitions/ruins.json")).resolves.toEqual({ event_definitions: [] });
    await expect(readTempJson("content/events/call_templates/ruins.json")).resolves.toEqual({ call_templates: [] });
  });

  it("creates new and edit-existing event drafts from /api/event-editor/drafts", async () => {
    await restartWithTempEventRepo();

    const newResponse = await postJson("/api/event-editor/drafts", {
      mode: "new",
      target_domain: "forest",
      definition_id: "forest_bridge_choice",
      title: "Bridge choice",
      summary: "Choose how to cross the bridge.",
    });
    expect(newResponse.status).toBe(200);
    const newBody = await newResponse.json();
    expect(newBody).toEqual(
      expect.objectContaining({
        file_path: expect.stringMatching(/^content\/events\/drafts\/forest_bridge_choice_/),
        draft: expect.objectContaining({
          mode: "new",
          source: null,
          target: expect.objectContaining({
            domain: "forest",
            definition_id: "forest_bridge_choice",
          }),
          working_definition: expect.objectContaining({
            id: "forest_bridge_choice",
            title: "Bridge choice",
          }),
        }),
      }),
    );
    await expect(readTempJson(newBody.file_path)).resolves.toEqual(newBody.draft);

    const editResponse = await postJson("/api/event-editor/drafts", {
      mode: "edit_existing",
      domain: "forest",
      definition_id: "forest_trace",
    });
    expect(editResponse.status).toBe(200);
    const editBody = await editResponse.json();
    expect(editBody.draft).toEqual(
      expect.objectContaining({
        mode: "edit_existing",
        source: expect.objectContaining({
          definition_id: "forest_trace",
          definition_file_path: "content/events/definitions/forest.json",
          call_template_ids: ["forest_trace_call"],
        }),
        working_definition: expect.objectContaining({
          id: "forest_trace",
          domain: "forest",
        }),
        working_call_templates: [
          expect.objectContaining({
            id: "forest_trace_call",
            event_definition_id: "forest_trace",
          }),
        ],
      }),
    );
  });

  it("reads active and archived event drafts and rejects unsafe draft ids", async () => {
    await restartWithTempEventRepo();
    const created = await createTempDraft();

    const activeResponse = await fetch(`${baseUrl}/api/event-editor/drafts/${created.draft.draft_id}`);
    expect(activeResponse.status).toBe(200);
    await expect(activeResponse.json()).resolves.toEqual(created.draft);

    const archivedDraft = {
      ...created.draft,
      status: "archived",
      published_at: "2026-05-05T16:00:00.000Z",
      published_files: ["content/events/definitions/forest.json"],
    };
    await fs.rm(path.join(tempRepoRoot, created.file_path));
    await writeTempJson(`content/events/drafts/archive/${created.draft.draft_id}.json`, archivedDraft);

    const hiddenArchiveResponse = await fetch(`${baseUrl}/api/event-editor/drafts/${created.draft.draft_id}`);
    expect(hiddenArchiveResponse.status).toBe(404);

    const archiveResponse = await fetch(
      `${baseUrl}/api/event-editor/drafts/${created.draft.draft_id}?include_archived=true`,
    );
    expect(archiveResponse.status).toBe(200);
    await expect(archiveResponse.json()).resolves.toEqual(archivedDraft);

    const unsafeResponse = await fetch(`${baseUrl}/api/event-editor/drafts/%2E%2E%2Foutside`);
    expect(unsafeResponse.status).toBe(400);
    const unsafeBody = await unsafeResponse.json();
    expect(unsafeBody.error.code).toBe("invalid_draft_id");
  });

  it("saves event draft envelopes and rejects stale draft hashes", async () => {
    await restartWithTempEventRepo();
    const created = await createTempDraft();
    const updatedDraft = {
      ...created.draft,
      working_definition: {
        ...created.draft.working_definition,
        title: "Updated bridge choice",
      },
    };

    const saveResponse = await postJson(`/api/event-editor/drafts/${created.draft.draft_id}/save`, {
      draft: updatedDraft,
      expected_draft_hash: created.draft.hashes.draft,
    });
    expect(saveResponse.status).toBe(200);
    const saveBody = await saveResponse.json();
    expect(saveBody).toEqual(
      expect.objectContaining({
        saved: true,
        file_path: created.file_path,
        draft_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        issues: [],
      }),
    );
    expect(saveBody.draft.working_definition.title).toBe("Updated bridge choice");

    const conflictResponse = await postJson(`/api/event-editor/drafts/${created.draft.draft_id}/save`, {
      draft: {
        ...saveBody.draft,
        working_definition: {
          ...saveBody.draft.working_definition,
          title: "Conflicting write",
        },
      },
      expected_draft_hash: created.draft.hashes.draft,
    });
    expect(conflictResponse.status).toBe(409);
    const conflictBody = await conflictResponse.json();
    expect(conflictBody.error.code).toBe("draft_hash_conflict");
    await expect(readTempJson(created.file_path)).resolves.toEqual(saveBody.draft);
  });

  it("validates event drafts at draft and publish levels without returning HTTP failures", async () => {
    await restartWithTempEventRepo();
    const created = await createTempDraft();

    const draftResponse = await postJson(`/api/event-editor/drafts/${created.draft.draft_id}/validate`, {
      level: "draft",
      draft: created.draft,
    });
    expect(draftResponse.status).toBe(200);
    await expect(draftResponse.json()).resolves.toEqual({
      valid: true,
      issues: [],
    });

    const invalidEnvelopeResponse = await postJson(`/api/event-editor/drafts/${created.draft.draft_id}/validate`, {
      level: "draft",
      draft: {
        ...created.draft,
        working_definition: null,
      },
    });
    expect(invalidEnvelopeResponse.status).toBe(200);
    const invalidEnvelopeBody = await invalidEnvelopeResponse.json();
    expect(invalidEnvelopeBody.valid).toBe(false);
    expect(invalidEnvelopeBody.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "invalid_working_definition",
          asset_type: "draft",
          asset_id: created.draft.draft_id,
          json_path: "/working_definition",
        }),
      ]),
    );

    const publishResponse = await postJson(`/api/event-editor/drafts/${created.draft.draft_id}/validate`, {
      level: "publish",
      draft: created.draft,
    });
    expect(publishResponse.status).toBe(200);
    const publishBody = await publishResponse.json();
    expect(publishBody.valid).toBe(false);
    expect(publishBody.generated).toEqual({
      definition: created.draft.working_definition,
      call_templates: created.draft.working_call_templates,
    });
    expect(publishBody.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "schema_required",
          asset_type: "event_definition",
          asset_id: "forest_bridge_choice",
        }),
      ]),
    );
  });

  it("publishes event drafts through /api/event-editor/drafts/:draft_id/publish", async () => {
    await restartWithTempEventRepo();
    const created = await createTempDraft();
    const saved = await savePublishableDraft(created);

    const response = await postJson(`/api/event-editor/drafts/${created.draft.draft_id}/publish`, {
      expected_draft_hash: saved.draft_hash,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        published: true,
        written_files: [
          "content/events/definitions/forest.json",
          "content/events/call_templates/forest.json",
          "content/events/manifest.json",
        ],
        archived_draft_path: `content/events/drafts/archive/${created.draft.draft_id}.json`,
        issues: [],
      }),
    );
    expect(body.generated.definition).toEqual(
      expect.objectContaining({
        id: "forest_bridge_choice",
        domain: "forest",
        status: "ready_for_test",
      }),
    );
    const definitions = await readTempJson("content/events/definitions/forest.json");
    expect(definitions.event_definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "forest_bridge_choice",
          title: "Bridge choice",
        }),
      ]),
    );
    await expect(readTempJson(body.archived_draft_path)).resolves.toEqual(
      expect.objectContaining({
        status: "archived",
        published_files: body.written_files,
      }),
    );
  });

  it("returns publish validation failures as HTTP 200 business responses", async () => {
    await restartWithTempEventRepo();
    const created = await createTempDraft();

    const response = await postJson(`/api/event-editor/drafts/${created.draft.draft_id}/publish`, {});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.published).toBe(false);
    expect(body.written_files).toEqual([]);
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          asset_type: "event_definition",
          asset_id: "forest_bridge_choice",
        }),
      ]),
    );
  });

  it("returns publish source conflicts as HTTP 200 without writing formal files", async () => {
    await restartWithTempEventRepo();
    const created = await createTempDraft();
    const saved = await savePublishableDraft(created);
    const before = await snapshotEventFormalFiles();

    const response = await postJson(`/api/event-editor/drafts/${created.draft.draft_id}/publish`, {
      expected_draft_hash: saved.draft_hash,
      expected_source_hashes: {
        "content/events/definitions/forest.json": "0".repeat(64),
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.published).toBe(false);
    expect(body.written_files).toEqual([]);
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "source_hash_conflict",
          asset_type: "source_file",
          asset_id: "content/events/definitions/forest.json",
        }),
      ]),
    );
    await expect(snapshotEventFormalFiles()).resolves.toEqual(before);
    await expect(fs.access(path.join(tempRepoRoot, created.file_path))).resolves.toBeUndefined();
  });

  it("serves the map editor library shape from /api/map-editor/library", async () => {
    const response = await fetch(`${baseUrl}/api/map-editor/library`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.maps)).toBe(true);
    expect(body.maps.length).toBeGreaterThan(0);
    expect(Array.isArray(body.map_objects)).toBe(true);
    expect(typeof body.schemas).toBe("object");
  });

  it("returns validation errors from /api/map-editor/validate", async () => {
    await restartWithTempRepo();
    const response = await postJson("/api/map-editor/validate", {
      data: {
        ...minimalMap("broken-map"),
        originTileId: "9-9",
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unknown_origin_tile_id" }),
        expect.objectContaining({ code: "origin_not_initially_discovered" }),
      ]),
    );
  });

  it("does not write invalid map drafts from /api/map-editor/save", async () => {
    await restartWithTempRepo();
    const response = await postJson("/api/map-editor/save", {
      file_path: "content/maps/broken-map.json",
      data: {
        ...minimalMap("broken-map"),
        originTileId: "9-9",
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.saved).toBe(false);
    await expect(fs.access(path.join(tempRepoRoot, "content/maps/broken-map.json"))).rejects.toThrow();
  });

  it("writes valid map drafts to an allowed content/maps path from /api/map-editor/save", async () => {
    await restartWithTempRepo();
    const feature = minimalFeature("saved_feature");
    const response = await postJson("/api/map-editor/save", {
      data: {
        ...minimalMap("new-map"),
        features: [feature],
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      valid: true,
      saved: true,
      file_path: "content/maps/new-map.json",
      radar_file_path: "content/maps/ascii/new-map-radar.json",
    }));
    const saved = JSON.parse(await fs.readFile(path.join(tempRepoRoot, "content/maps/new-map.json"), "utf8"));
    expect(saved.id).toBe("new-map");
    expect(saved.radar).toBeUndefined();
    expect(saved.radarPath).toBe("content/maps/ascii/new-map-radar.json");
    expect(saved.features).toEqual([feature]);
    const savedRadar = JSON.parse(await fs.readFile(path.join(tempRepoRoot, "content/maps/ascii/new-map-radar.json"), "utf8"));
    expect(savedRadar).toEqual(expect.objectContaining({ mapId: "new-map", glyphRows: ["."] }));
  });

  it("rejects new map saves when the derived content/maps file already exists", async () => {
    await restartWithTempRepo();
    const response = await postJson("/api/map-editor/save", {
      data: minimalMap("default-map"),
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("file_exists");
    const saved = JSON.parse(await fs.readFile(path.join(tempRepoRoot, "content/maps/default-map.json"), "utf8"));
    expect(saved.name).toBe("default-map");
  });

  it("rejects map saves outside content/maps", async () => {
    await restartWithTempRepo();
    const response = await postJson("/api/map-editor/save", {
      file_path: "content/events/new-map.json",
      data: minimalMap("new-map"),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("path_not_allowed");
  });

  it("serves PNG assets from /api/map-editor/assets", async () => {
    await restartWithTempRepo();
    const response = await fetch(`${baseUrl}/api/map-editor/assets?path=assets/test/sample.png`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer()).slice(0, 4)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it("rejects non-assets paths from /api/map-editor/assets", async () => {
    await restartWithTempRepo();
    const response = await fetch(`${baseUrl}/api/map-editor/assets?path=content/maps/default-map.json`);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("path_not_allowed");
  });

  it("supports OPTIONS preflight", async () => {
    const response = await fetch(`${baseUrl}/api/map-editor/save`, { method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
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

  async function restartWithTempRepo() {
    await new Promise((resolve) => server.close(resolve));
    tempRepoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-map-server-"));
    await writeTempJson("content/maps/default-map.json", minimalMap("default-map"));
    await writeTempJson("content/maps/ascii/default-map-radar.json", minimalRadar("default-map"));
    await writeTempJson("content/map-objects/resources.json", { map_objects: [] });
    await writeTempJson("content/schemas/maps.schema.json", { title: "maps schema" });
    await writeTempJson("content/schemas/map-radar.schema.json", { title: "map radar schema" });
    await writeTempJson("content/schemas/map-objects.schema.json", { title: "map objects schema" });
    await fs.mkdir(path.join(tempRepoRoot, "assets/test"), { recursive: true });
    await fs.writeFile(path.join(tempRepoRoot, "assets/test/sample.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    server = createHelperServer({ repoRoot: tempRepoRoot });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async function restartWithTempEventRepo() {
    await new Promise((resolve) => server.close(resolve));
    tempRepoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-event-server-"));
    await fs.cp(path.join(repoRoot, "content/schemas"), path.join(tempRepoRoot, "content/schemas"), {
      recursive: true,
    });
    const runtimeValidationTarget = path.join(tempRepoRoot, "apps/pc-client/src/events/validation.ts");
    await fs.mkdir(path.dirname(runtimeValidationTarget), { recursive: true });
    await fs.copyFile(path.join(repoRoot, "apps/pc-client/src/events/validation.ts"), runtimeValidationTarget);
    await writeTempJson("content/events/manifest.json", {
      schema_version: "event-manifest.v1",
      domains: [manifestDomain("forest"), manifestDomain("desert")],
    });
    await writeTempJson("content/events/handler_registry.json", { handlers: [] });
    await writeTempJson("content/events/definitions/forest.json", {
      event_definitions: [minimalEventDefinition()],
    });
    await writeTempJson("content/events/call_templates/forest.json", {
      call_templates: [minimalCallTemplate()],
    });
    await writeTempJson("content/events/definitions/desert.json", { event_definitions: [] });
    await writeTempJson("content/events/call_templates/desert.json", { call_templates: [] });

    server = createHelperServer({ repoRoot: tempRepoRoot });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async function createTempDraft() {
    const response = await postJson("/api/event-editor/drafts", {
      mode: "new",
      target_domain: "forest",
      definition_id: "forest_bridge_choice",
      title: "Bridge choice",
      summary: "Choose how to cross the bridge.",
    });
    expect(response.status).toBe(200);
    return response.json();
  }

  async function savePublishableDraft(created) {
    const definitionId = created.draft.target.definition_id;
    const callTemplateId = `${definitionId}_call`;
    const response = await postJson(`/api/event-editor/drafts/${created.draft.draft_id}/save`, {
      draft: {
        ...created.draft,
        working_definition: minimalEventDefinition({
          id: definitionId,
          title: "Bridge choice",
          callTemplateId,
        }),
        working_call_templates: [
          minimalCallTemplate({
            id: callTemplateId,
            eventDefinitionId: definitionId,
          }),
        ],
      },
      expected_draft_hash: created.draft.hashes.draft,
    });
    expect(response.status).toBe(200);
    return response.json();
  }

  async function snapshotEventFormalFiles() {
    return {
      definitions: await fs.readFile(path.join(tempRepoRoot, "content/events/definitions/forest.json"), "utf8"),
      callTemplates: await fs.readFile(path.join(tempRepoRoot, "content/events/call_templates/forest.json"), "utf8"),
      manifest: await fs.readFile(path.join(tempRepoRoot, "content/events/manifest.json"), "utf8"),
    };
  }

  async function postJson(pathname, body) {
    return fetch(`${baseUrl}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function writeTempJson(relativePath, value) {
    const absolutePath = path.join(tempRepoRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  async function readTempJson(relativePath) {
    return JSON.parse(await fs.readFile(path.join(tempRepoRoot, relativePath), "utf8"));
  }
});

function minimalMap(id) {
  return {
    id,
    name: id,
    version: 1,
    size: { rows: 1, cols: 1 },
    originTileId: "1-1",
    initialDiscoveredTileIds: ["1-1"],
    radarPath: `content/maps/ascii/${id}-radar.json`,
    tiles: [
      {
        id: "1-1",
        row: 1,
        col: 1,
        areaName: "Area 1-1",
        terrain: "平原",
        weather: "晴朗",
        environment: {
          temperatureCelsius: 20,
          humidityPercent: 40,
          magneticFieldMicroTesla: 50,
          radiationLevel: "none",
        },
        objectIds: [],
        specialStates: [],
      },
    ],
    radar: minimalRadarBody(),
  };
}

function minimalRadar(mapId) {
  return {
    $schema: "../../schemas/map-radar.schema.json",
    mapId,
    ...minimalRadarBody(),
  };
}

function minimalRadarBody() {
  return {
    world: { width: 1, height: 1, origin: { x: 0, y: 0 } },
    glyphRows: ["."],
    toneRows: ["g"],
    palette: { g: "#9bbf74" },
    symbols: {
      crew: { glyph: "@", tone: "g" },
      focus: { glyph: "X", tone: "g" },
    },
    trace: {
      layerNotice: "notice",
      controlMode: "control",
      callMode: "call",
      worldLine: "world",
      jsonLine: "json",
      emptyLine: "empty",
    },
    regions: [],
  };
}

function minimalFeature(id) {
  return {
    id,
    name: "Test Feature",
    kind: "site:test",
    priority: 10,
    visibility: "onDiscovered",
    footprint: {
      type: "row_spans",
      spans: [{ row: 1, colStart: 1, colEnd: 1 }],
    },
  };
}

function manifestDomain(id) {
  return {
    id,
    definitions: `definitions/${id}.json`,
    call_templates: `call_templates/${id}.json`,
    presets: null,
  };
}

function minimalEventDefinition({
  id = "forest_trace",
  title = "Forest Trace",
  callTemplateId = "forest_trace_call",
} = {}) {
  return {
    schema_version: "event-program-model-v1",
    id,
    version: 1,
    domain: "forest",
    title,
    summary: "A small trace in the forest.",
    tags: ["forest"],
    status: "draft",
    trigger: {
      type: "arrival",
      conditions: [],
    },
    candidate_selection: {
      priority: 1,
      weight: 1,
      mutex_group: null,
      max_instances_per_trigger: 1,
      requires_blocking_slot: false,
    },
    repeat_policy: {
      scope: "world",
      max_trigger_count: null,
      cooldown_seconds: 0,
      history_key_template: `event:${id}`,
      allow_while_active: false,
    },
    event_graph: {
      entry_node_id: "call",
      nodes: [minimalCallNode({ callTemplateId }), minimalEndNode()],
      edges: [
        { from_node_id: "call", to_node_id: "end", via: "accept" },
        { from_node_id: "call", to_node_id: "end", via: "decline" },
      ],
      terminal_node_ids: ["end"],
      graph_rules: {
        acyclic: true,
        max_active_nodes: 1,
        allow_parallel_nodes: false,
      },
    },
    effect_groups: [{ id: "mark", effects: [], description: "Mark effects." }],
    log_templates: [
      { id: "call_log", summary: "Call started.", importance: "normal", visibility: "player_visible" },
      { id: "resolved", summary: "Resolved.", importance: "normal", visibility: "player_visible" },
    ],
    sample_contexts: [],
  };
}

function minimalCallNode({ callTemplateId = "forest_trace_call" } = {}) {
  return {
    id: "call",
    type: "call",
    title: "Call",
    blocking: minimalBlocking(),
    event_log_template_id: "call_log",
    call_template_id: callTemplateId,
    speaker_crew_ref: { type: "primary_crew" },
    urgency: "normal",
    delivery: "incoming_call",
    options: [{ id: "accept", effect_refs: ["mark"] }, { id: "decline" }],
    option_node_mapping: {
      accept: "end",
      decline: "end",
    },
  };
}

function minimalEndNode() {
  return {
    id: "end",
    type: "end",
    title: "End",
    blocking: minimalBlocking(),
    resolution: "resolved",
    result_key: "resolved",
    event_log_template_id: "resolved",
    history_writes: [],
    cleanup_policy: {
      release_blocking_claims: true,
      delete_active_calls: true,
      keep_player_summary: true,
    },
  };
}

function minimalCallTemplate({
  id = "forest_trace_call",
  eventDefinitionId = "forest_trace",
} = {}) {
  return {
    schema_version: "event-program-model-v1",
    id,
    version: 1,
    domain: "forest",
    event_definition_id: eventDefinitionId,
    node_id: "call",
    render_context_fields: [],
    opening_lines: minimalVariantGroup("Opening"),
    option_lines: {
      accept: minimalVariantGroup("Accept"),
      decline: minimalVariantGroup("Decline"),
    },
    fallback_order: ["default"],
    default_variant_required: true,
  };
}

function minimalVariantGroup(text) {
  return {
    variants: [{ id: "default", text, priority: 1 }],
    selection: "first_match",
  };
}

function minimalBlocking() {
  return {
    occupies_crew_action: false,
    occupies_communication: false,
    blocking_key_template: null,
  };
}
