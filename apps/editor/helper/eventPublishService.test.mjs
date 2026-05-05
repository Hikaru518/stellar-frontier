// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEventDraftStore } from "./eventDraftStore.mjs";
import { createEventPublishService } from "./eventPublishService.mjs";

describe("eventPublishService", () => {
  let repoRoot;
  let draftStore;
  let publishService;

  beforeEach(async () => {
    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-event-publish-service-"));
    await copyValidationFixtures();
    await writeJson("content/events/manifest.json", {
      schema_version: "event-manifest.v1",
      domains: [manifestDomain("forest"), manifestDomain("desert")],
    });
    await writeJson("content/events/handler_registry.json", { handlers: [] });
    await writeJson("content/events/definitions/forest.json", {
      event_definitions: [
        twoCallEventDefinition({ id: "forest_existing", title: "Existing signal" }),
        minimalEventDefinition({ id: "forest_other", title: "Other event", callTemplateId: "forest_other.call.call" }),
      ],
    });
    await writeJson("content/events/call_templates/forest.json", {
      call_templates: [
        minimalCallTemplate({
          id: "forest_existing.call.report",
          eventDefinitionId: "forest_existing",
          nodeId: "report",
          optionIds: ["ack"],
          opening: "Existing report.",
        }),
        minimalCallTemplate({
          id: "forest_existing.call.stale",
          eventDefinitionId: "forest_existing",
          nodeId: "stale",
          optionIds: ["done"],
          opening: "Stale follow-up.",
        }),
        minimalCallTemplate({
          id: "forest_other.call.call",
          eventDefinitionId: "forest_other",
          nodeId: "call",
          optionIds: ["accept", "decline"],
          opening: "Other event.",
        }),
      ],
    });
    await writeJson("content/events/definitions/desert.json", { event_definitions: [] });
    await writeJson("content/events/call_templates/desert.json", { call_templates: [] });

    draftStore = createEventDraftStore({
      repoRoot,
      now: () => new Date("2026-05-05T15:30:12.000Z"),
    });
    publishService = createEventPublishService({
      repoRoot,
      now: () => new Date("2026-05-05T16:00:00.000Z"),
    });
  });

  afterEach(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it("publishes a new event into target definition and call template files, then archives the draft", async () => {
    const created = await draftStore.createDraft({
      mode: "new",
      target_domain: "forest",
      definition_id: "forest_new_signal",
      title: "New signal",
    });
    await saveWorkingDraft(created.draft, {
      working_definition: minimalEventDefinition({
        id: "forest_new_signal",
        title: "New signal",
        callTemplateId: "forest_new_signal.call.call",
      }),
      working_call_templates: [
        minimalCallTemplate({
          id: "forest_new_signal.call.call",
          eventDefinitionId: "forest_new_signal",
          opening: "New signal opening.",
        }),
      ],
    });

    const result = await publishService.publishDraft({ draftId: created.draft.draft_id });

    expect(result).toEqual(
      expect.objectContaining({
        published: true,
        written_files: [
          "content/events/definitions/forest.json",
          "content/events/call_templates/forest.json",
          "content/events/manifest.json",
        ],
        archived_draft_path: "content/events/drafts/archive/forest_new_signal_20260505_153012.json",
        issues: [],
        generated: expect.objectContaining({
          definition: expect.objectContaining({
            id: "forest_new_signal",
            domain: "forest",
            status: "ready_for_test",
          }),
        }),
      }),
    );

    const definitions = await readJson("content/events/definitions/forest.json");
    expect(definitions.event_definitions.map((definition) => definition.id)).toEqual([
      "forest_existing",
      "forest_other",
      "forest_new_signal",
    ]);
    const templates = await readJson("content/events/call_templates/forest.json");
    expect(templates.call_templates.map((template) => template.id)).toEqual([
      "forest_existing.call.report",
      "forest_existing.call.stale",
      "forest_other.call.call",
      "forest_new_signal.call.call",
    ]);
    await expect(readText("content/events/definitions/forest.json")).resolves.toMatch(/\n$/);
    await expect(fs.access(path.join(repoRoot, created.file_path))).rejects.toThrow();
    await expect(readJson(result.archived_draft_path)).resolves.toEqual(
      expect.objectContaining({
        status: "archived",
        published_at: "2026-05-05T16:00:00.000Z",
        published_files: result.written_files,
      }),
    );
  });

  it("rejects a new event with a duplicate definition id without writing formal files", async () => {
    const created = await draftStore.createDraft({
      mode: "new",
      target_domain: "forest",
      definition_id: "forest_existing",
      title: "Duplicate signal",
    });
    await saveWorkingDraft(created.draft, {
      working_definition: minimalEventDefinition({
        id: "forest_existing",
        title: "Duplicate signal",
        callTemplateId: "forest_existing.call.new",
      }),
      working_call_templates: [
        minimalCallTemplate({
          id: "forest_existing.call.new",
          eventDefinitionId: "forest_existing",
        }),
      ],
    });
    const before = await snapshotFormalFiles();

    const result = await publishService.publishDraft({ draftId: created.draft.draft_id });

    expect(result.published).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "duplicate_definition_id",
          asset_type: "event_definition",
          asset_id: "forest_existing",
        }),
      ]),
    );
    await expect(snapshotFormalFiles()).resolves.toEqual(before);
    await expect(fs.access(path.join(repoRoot, created.file_path))).resolves.toBeUndefined();
  });

  it("publishes edit_existing by replacing the definition and dropping stale call templates for that event", async () => {
    const created = await draftStore.createDraft({
      mode: "edit_existing",
      domain: "forest",
      definition_id: "forest_existing",
    });
    await saveWorkingDraft(created.draft, {
      working_definition: minimalEventDefinition({
        id: "forest_existing",
        title: "Reworked signal",
        callTemplateId: "forest_existing.call.report",
        nodeId: "report",
        optionIds: ["ack"],
        optionNodeMapping: { ack: "end" },
      }),
      working_call_templates: [
        minimalCallTemplate({
          id: "forest_existing.call.report",
          eventDefinitionId: "forest_existing",
          nodeId: "report",
          optionIds: ["ack"],
          opening: "Keep the report.",
        }),
      ],
    });

    const result = await publishService.publishDraft({ draftId: created.draft.draft_id });

    expect(result.published).toBe(true);
    const definitions = await readJson("content/events/definitions/forest.json");
    expect(definitions.event_definitions).toEqual([
      expect.objectContaining({ id: "forest_existing", title: "Reworked signal", status: "ready_for_test" }),
      expect.objectContaining({ id: "forest_other" }),
    ]);
    const templates = await readJson("content/events/call_templates/forest.json");
    expect(templates.call_templates.map((template) => template.id)).toEqual([
      "forest_other.call.call",
      "forest_existing.call.report",
    ]);
    expect(templates.call_templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "forest_existing.call.report",
          event_definition_id: "forest_existing",
          node_id: "report",
        }),
        expect.objectContaining({
          id: "forest_other.call.call",
          event_definition_id: "forest_other",
        }),
      ]),
    );
  });

  it("does not write formal files when schema validation fails", async () => {
    const created = await draftStore.createDraft({
      mode: "new",
      target_domain: "forest",
      definition_id: "forest_schema_bad",
    });
    await saveWorkingDraft(created.draft, {
      working_definition: minimalEventDefinition({
        id: "forest_schema_bad",
        title: "",
        callTemplateId: "forest_schema_bad.call.call",
      }),
      working_call_templates: [
        minimalCallTemplate({
          id: "forest_schema_bad.call.call",
          eventDefinitionId: "forest_schema_bad",
        }),
      ],
    });
    const before = await snapshotFormalFiles();

    const result = await publishService.publishDraft({ draftId: created.draft.draft_id });

    expect(result.published).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "schema_minLength",
          asset_type: "event_definition",
          asset_id: "forest_schema_bad",
        }),
      ]),
    );
    await expect(snapshotFormalFiles()).resolves.toEqual(before);
    await expect(fs.access(path.join(repoRoot, created.file_path))).resolves.toBeUndefined();
  });

  it("does not write formal files when cross-reference validation fails", async () => {
    const created = await draftStore.createDraft({
      mode: "new",
      target_domain: "forest",
      definition_id: "forest_cross_bad",
    });
    await saveWorkingDraft(created.draft, {
      working_definition: minimalEventDefinition({
        id: "forest_cross_bad",
        title: "Missing effect reference",
        callTemplateId: "forest_cross_bad.call.call",
        optionEffectRefs: { accept: ["missing_effect"] },
      }),
      working_call_templates: [
        minimalCallTemplate({
          id: "forest_cross_bad.call.call",
          eventDefinitionId: "forest_cross_bad",
        }),
      ],
    });
    const before = await snapshotFormalFiles();

    const result = await publishService.publishDraft({ draftId: created.draft.draft_id });

    expect(result.published).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown_effect_ref",
          asset_type: "event_definition",
          asset_id: "forest_cross_bad",
        }),
      ]),
    );
    await expect(snapshotFormalFiles()).resolves.toEqual(before);
    await expect(fs.access(path.join(repoRoot, created.file_path))).resolves.toBeUndefined();
  });

  it("does not write formal files when an edit_existing source hash conflicts", async () => {
    const created = await draftStore.createDraft({
      mode: "edit_existing",
      domain: "forest",
      definition_id: "forest_existing",
    });
    await saveWorkingDraft(created.draft, {
      working_definition: minimalEventDefinition({
        id: "forest_existing",
        title: "Local draft change",
        callTemplateId: "forest_existing.call.report",
        nodeId: "report",
        optionIds: ["ack"],
        optionNodeMapping: { ack: "end" },
      }),
      working_call_templates: [
        minimalCallTemplate({
          id: "forest_existing.call.report",
          eventDefinitionId: "forest_existing",
          nodeId: "report",
          optionIds: ["ack"],
        }),
      ],
    });
    const externallyChangedDefinitions = await readJson("content/events/definitions/forest.json");
    externallyChangedDefinitions.event_definitions[0].title = "External change";
    await writeJson("content/events/definitions/forest.json", externallyChangedDefinitions);
    const before = await snapshotFormalFiles();

    const result = await publishService.publishDraft({ draftId: created.draft.draft_id });

    expect(result.published).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "source_hash_conflict",
          asset_type: "source_file",
          asset_id: "content/events/definitions/forest.json",
        }),
      ]),
    );
    await expect(snapshotFormalFiles()).resolves.toEqual(before);
    await expect(fs.access(path.join(repoRoot, created.file_path))).resolves.toBeUndefined();
  });

  async function saveWorkingDraft(baseDraft, overrides) {
    const draft = {
      ...baseDraft,
      ...overrides,
    };
    return draftStore.saveDraft({
      draftId: baseDraft.draft_id,
      draft,
      expectedDraftHash: baseDraft.hashes.draft,
    });
  }

  async function copyValidationFixtures() {
    const sourceRepoRoot = path.resolve(import.meta.dirname, "../../..");
    await fs.cp(path.join(sourceRepoRoot, "content/schemas"), path.join(repoRoot, "content/schemas"), {
      recursive: true,
    });
    const runtimeValidationTarget = path.join(repoRoot, "apps/pc-client/src/events/validation.ts");
    await fs.mkdir(path.dirname(runtimeValidationTarget), { recursive: true });
    await fs.copyFile(path.join(sourceRepoRoot, "apps/pc-client/src/events/validation.ts"), runtimeValidationTarget);
  }

  async function snapshotFormalFiles() {
    return {
      definitions: await readText("content/events/definitions/forest.json"),
      callTemplates: await readText("content/events/call_templates/forest.json"),
      manifest: await readText("content/events/manifest.json"),
    };
  }

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

function manifestDomain(id) {
  return {
    id,
    definitions: `definitions/${id}.json`,
    call_templates: `call_templates/${id}.json`,
    presets: null,
  };
}

function twoCallEventDefinition({ id, title }) {
  return minimalEventDefinition({
    id,
    title,
    nodeId: "report",
    callTemplateId: `${id}.call.report`,
    optionIds: ["ack"],
    optionNodeMapping: { ack: "stale" },
    extraNodes: [
      callNode({
        id: "stale",
        callTemplateId: `${id}.call.stale`,
        optionIds: ["done"],
        optionNodeMapping: { done: "end" },
      }),
    ],
    extraEdges: [{ from_node_id: "stale", to_node_id: "end", via: "done" }],
  });
}

function minimalEventDefinition({
  id,
  title,
  callTemplateId,
  nodeId = "call",
  optionIds = ["accept", "decline"],
  optionNodeMapping = { accept: "end", decline: "end" },
  optionEffectRefs = {},
  extraNodes = [],
  extraEdges = [],
}) {
  const node = callNode({ id: nodeId, callTemplateId, optionIds, optionNodeMapping, optionEffectRefs });
  return {
    schema_version: "event-program-model-v1",
    id,
    version: 1,
    domain: "forest",
    title,
    summary: `${title || id} summary.`,
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
      entry_node_id: nodeId,
      nodes: [node, ...extraNodes, endNode()],
      edges: [
        ...optionIds.map((optionId) => ({
          from_node_id: nodeId,
          to_node_id: optionNodeMapping[optionId],
          via: optionId,
        })),
        ...extraEdges,
      ],
      terminal_node_ids: ["end"],
      graph_rules: {
        acyclic: true,
        max_active_nodes: 1,
        allow_parallel_nodes: false,
      },
    },
    effect_groups: [],
    log_templates: [
      { id: `${nodeId}_log`, summary: "Call started.", importance: "normal", visibility: "player_visible" },
      ...extraNodes
        .map((extraNode) => extraNode.event_log_template_id)
        .filter((logTemplateId) => typeof logTemplateId === "string" && logTemplateId !== `${nodeId}_log`)
        .map((logTemplateId) => ({
          id: logTemplateId,
          summary: "Follow-up call.",
          importance: "normal",
          visibility: "player_visible",
        })),
      { id: "resolved", summary: "Resolved.", importance: "normal", visibility: "player_visible" },
    ],
    sample_contexts: [],
  };
}

function callNode({ id, callTemplateId, optionIds, optionNodeMapping, optionEffectRefs = {} }) {
  return {
    id,
    type: "call",
    title: id,
    blocking: minimalBlocking(),
    event_log_template_id: `${id}_log`,
    call_template_id: callTemplateId,
    speaker_crew_ref: { type: "primary_crew" },
    urgency: "normal",
    delivery: "incoming_call",
    options: optionIds.map((optionId) => ({
      id: optionId,
      ...(optionEffectRefs[optionId] ? { effect_refs: optionEffectRefs[optionId] } : {}),
    })),
    option_node_mapping: optionNodeMapping,
  };
}

function endNode() {
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
  id,
  eventDefinitionId,
  nodeId = "call",
  optionIds = ["accept", "decline"],
  opening = "Opening.",
}) {
  return {
    schema_version: "event-program-model-v1",
    id,
    version: 1,
    domain: "forest",
    event_definition_id: eventDefinitionId,
    node_id: nodeId,
    render_context_fields: [],
    opening_lines: variantGroup(opening),
    option_lines: Object.fromEntries(optionIds.map((optionId) => [optionId, variantGroup(`${optionId}.`)])),
    fallback_order: ["default"],
    default_variant_required: true,
  };
}

function variantGroup(text) {
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
