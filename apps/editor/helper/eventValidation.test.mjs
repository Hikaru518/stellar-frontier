// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateEventAssetsForPublish, validateEventManifestForEditor } from "./eventValidation.mjs";

describe("eventValidation", () => {
  it("maps event definition schema errors to editor issues", async () => {
    const definition = {
      ...minimalEventDefinition({}),
      title: "",
    };

    const result = await validateEventAssetsForPublish({
      eventDefinitions: [definition],
      callTemplates: [minimalCallTemplate({})],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "schema_minLength",
          message: expect.stringContaining("Event definition"),
          asset_type: "event_definition",
          asset_id: "forest_trace",
          json_path: "/event_definitions/0/title",
        }),
      ]),
    );
  });

  it("maps call template schema errors to call template editor issues", async () => {
    const template = {
      ...minimalCallTemplate({}),
      opening_lines: {
        ...minimalVariantGroup("Opening"),
        variants: [{ id: "default", text: "", priority: 1 }],
      },
    };

    const result = await validateEventAssetsForPublish({
      eventDefinitions: [minimalEventDefinition({})],
      callTemplates: [template],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "schema_minLength",
          message: expect.stringContaining("Call template"),
          asset_type: "call_template",
          asset_id: "forest_trace_call",
          json_path: "/call_templates/0/opening_lines/variants/0/text",
        }),
      ]),
    );
  });

  it("maps cross-reference issues to editor issues with JSON pointers and editor locations", async () => {
    const missingRefsDefinition = minimalEventDefinition({
      id: "missing_refs",
      nodes: [
        minimalCallNode({
          call_template_id: "missing_template",
          options: [{ id: "accept", effect_refs: ["missing_effect"] }, { id: "decline" }],
        }),
        minimalEndNode(),
      ],
    });
    const mismatchedDefinition = minimalEventDefinition({
      id: "template_mismatch",
      nodes: [
        minimalCallNode({
          call_template_id: "template_mismatch_call",
        }),
        minimalEndNode(),
      ],
    });
    const mismatchedTemplate = minimalCallTemplate({
      id: "template_mismatch_call",
      event_definition_id: "template_mismatch",
      option_lines: {
        accept: minimalVariantGroup("Accept"),
        extra: minimalVariantGroup("Extra"),
      },
    });

    const result = await validateEventAssetsForPublish({
      eventDefinitions: [missingRefsDefinition, mismatchedDefinition],
      callTemplates: [mismatchedTemplate],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown_call_template",
          asset_type: "event_definition",
          asset_id: "missing_refs",
          json_path: "/event_definitions/0/event_graph/nodes/0/call_template_id",
          editor_location: expect.objectContaining({
            step: "graph",
            node_id: "call",
            field_path: "/event_definitions/0/event_graph/nodes/0/call_template_id",
          }),
        }),
        expect.objectContaining({
          code: "unknown_effect_ref",
          asset_type: "event_definition",
          asset_id: "missing_refs",
          json_path: "/event_definitions/0/event_graph/nodes/0/options/0/effect_refs/0",
          editor_location: expect.objectContaining({
            step: "graph",
            node_id: "call",
            option_id: "accept",
          }),
        }),
        expect.objectContaining({
          code: "missing_call_template_option_line",
          asset_type: "call_template",
          asset_id: "template_mismatch_call",
          json_path: "/call_templates/0/option_lines/decline",
          editor_location: expect.objectContaining({
            step: "graph",
            node_id: "call",
            option_id: "decline",
            call_template_id: "template_mismatch_call",
          }),
        }),
        expect.objectContaining({
          code: "extra_call_template_option_line",
          asset_type: "call_template",
          asset_id: "template_mismatch_call",
          json_path: "/call_templates/0/option_lines/extra",
          editor_location: expect.objectContaining({
            step: "graph",
            node_id: "call",
            option_id: "extra",
          }),
        }),
      ]),
    );
  });

  it("maps manifest validation issues to editor issues", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-event-validation-manifest-"));
    try {
      await writeJson(repoRoot, "content/events/manifest.json", {
        schema_version: "event-manifest.v1",
        domains: [
          {
            id: "Bad/Domain",
            definitions: "definitions/missing.json",
            call_templates: "call_templates/missing.json",
            presets: null,
          },
        ],
      });

      const result = await validateEventManifestForEditor({ repoRoot });

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "error",
            code: "invalid_domain_id",
            asset_type: "domain",
            asset_id: "Bad/Domain",
            json_path: "/domains/0/id",
            editor_location: expect.objectContaining({ step: "domain" }),
          }),
          expect.objectContaining({
            severity: "error",
            code: "missing_manifest_file",
            asset_type: "manifest",
          }),
        ]),
      );
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("does not write content files while validating", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-event-validation-nowrite-"));
    try {
      const sourceRepoRoot = path.resolve(import.meta.dirname, "../../..");
      await fs.cp(path.join(sourceRepoRoot, "content/schemas"), path.join(repoRoot, "content/schemas"), {
        recursive: true,
      });
      await writeJson(repoRoot, "content/events/definitions/forest.json", { event_definitions: [] });
      const before = await readText(repoRoot, "content/events/definitions/forest.json");

      await validateEventAssetsForPublish({
        repoRoot,
        eventDefinitions: [{ ...minimalEventDefinition({}), title: "" }],
        callTemplates: [minimalCallTemplate({})],
      });

      await expect(readText(repoRoot, "content/events/definitions/forest.json")).resolves.toBe(before);
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });
});

async function writeJson(repoRoot, relativePath, value) {
  const absolutePath = path.join(repoRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readText(repoRoot, relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

function minimalEventDefinition({
  id = "forest_trace",
  nodes = [minimalCallNode(), minimalEndNode()],
  edges = [
    { from_node_id: "call", to_node_id: "end", via: "accept" },
    { from_node_id: "call", to_node_id: "end", via: "decline" },
  ],
  effect_groups = [{ id: "mark", effects: [], description: "Mark effects." }],
  log_templates = [
    { id: "call_log", summary: "Call started.", importance: "normal", visibility: "player_visible" },
    { id: "resolved", summary: "Resolved.", importance: "normal", visibility: "player_visible" },
  ],
} = {}) {
  return {
    schema_version: "event-program-model-v1",
    id,
    version: 1,
    domain: "forest",
    title: "Forest Trace",
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
      entry_node_id: nodes[0]?.id ?? "call",
      nodes,
      edges,
      terminal_node_ids: ["end"],
      graph_rules: {
        acyclic: true,
        max_active_nodes: 1,
        allow_parallel_nodes: false,
      },
    },
    effect_groups,
    log_templates,
    sample_contexts: [],
  };
}

function minimalCallNode(overrides = {}) {
  return {
    id: "call",
    type: "call",
    title: "Call",
    blocking: minimalBlocking(),
    event_log_template_id: "call_log",
    call_template_id: "forest_trace_call",
    speaker_crew_ref: { type: "primary_crew" },
    urgency: "normal",
    delivery: "incoming_call",
    options: [{ id: "accept", effect_refs: ["mark"] }, { id: "decline" }],
    option_node_mapping: {
      accept: "end",
      decline: "end",
    },
    ...overrides,
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

function minimalCallTemplate(overrides = {}) {
  return {
    schema_version: "event-program-model-v1",
    id: "forest_trace_call",
    version: 1,
    domain: "forest",
    event_definition_id: "forest_trace",
    node_id: "call",
    render_context_fields: [],
    opening_lines: minimalVariantGroup("Opening"),
    option_lines: {
      accept: minimalVariantGroup("Accept"),
      decline: minimalVariantGroup("Decline"),
    },
    fallback_order: ["default"],
    default_variant_required: true,
    ...overrides,
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
