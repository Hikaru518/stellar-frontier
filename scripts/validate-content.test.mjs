import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoots = [];

describe("validate-content", () => {
  afterEach(() => {
    while (tempRoots.length > 0) {
      fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
    }
  });

  it("validates event assets from the new content/events directories", () => {
    const root = createContentRoot();
    writeJson(root, "content/events/definitions/forest.json", {
      event_definitions: [{ ...minimalEventDefinition(), title: undefined }],
    });

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Schema validation failed: content/events/definitions/forest.json");
    expect(result.output).toContain("/event_definitions/0/title");
  });

  it("does not require the removed event asset or schema", () => {
    const root = createContentRoot();
    fs.rmSync(path.join(root, "content", "events", ["events", "json"].join(".")), { force: true });
    fs.rmSync(path.join(root, "content/schemas/events.schema.json"), { force: true });

    const result = runValidator(root);

    expect(result.status).toBe(0);
    expect(result.output).toContain("Content validation passed.");
  });

  it("reports forbidden editor and runtime fields with concrete paths", () => {
    const root = createContentRoot();
    const definition = minimalEventDefinition();
    definition.current_node_id = "start";
    definition.event_graph.nodes[0].editor_position = { x: 10, y: 20 };
    writeJson(root, "content/events/definitions/forest.json", {
      event_definitions: [definition],
    });

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("/event_definitions/0/current_node_id");
    expect(result.output).toContain("/event_definitions/0/event_graph/nodes/0/editor_position");
  });

  it("rejects unsupported trigger, node, condition, and effect types", () => {
    const root = createContentRoot();
    const definition = minimalEventDefinition();
    definition.trigger.type = "unsupported_trigger";
    definition.trigger.conditions = [{ type: "unsupported_condition" }];
    definition.event_graph.nodes[0].type = "unsupported_node";
    definition.effect_groups = [
      {
        id: "bad_effects",
        effects: [
          {
            ...minimalEffect(),
            type: "unsupported_effect",
          },
        ],
      },
    ];
    writeJson(root, "content/events/definitions/forest.json", {
      event_definitions: [definition],
    });

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("/event_definitions/0/trigger/type");
    expect(result.output).toContain("/event_definitions/0/trigger/conditions/0/type");
    expect(result.output).toContain("/event_definitions/0/event_graph/nodes/0/type");
    expect(result.output).toContain("/event_definitions/0/effect_groups/0/effects/0/type");
  });

  it("rejects bad event program cross-references with useful paths", () => {
    const root = createContentRoot();
    const definition = minimalEventDefinition();
    definition.event_graph.entry_node_id = "call";
    definition.event_graph.nodes.unshift(minimalCallNode({ call_template_id: "missing_call_template" }));
    writeJson(root, "content/events/definitions/forest.json", {
      event_definitions: [definition],
    });

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Event cross-reference validation failed:");
    expect(result.output).toContain("unknown_call_template");
    expect(result.output).toContain("event_graph.nodes[0].call_template_id");
  });

  it("rejects manifest entries that point to missing event files", () => {
    const root = createContentRoot();
    writeJson(root, "content/events/manifest.json", {
      schema_version: "event-manifest.v1",
      domains: [
        {
          id: "forest",
          definitions: "definitions/missing.json",
          call_templates: "call_templates/forest.json",
          presets: null,
        },
      ],
    });

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Event manifest validation failed:");
    expect(result.output).toContain("Missing definitions file listed in manifest: content/events/definitions/missing.json");
  });

  it("rejects event domain files missing from the manifest", () => {
    const root = createContentRoot();
    const manifest = readJson(root, "content/events/manifest.json");
    manifest.domains = manifest.domains.filter((domain) => domain.id !== "mainline_crash_site");
    writeJson(root, "content/events/manifest.json", manifest);

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Event manifest validation failed:");
    expect(result.output).toContain(
      "Unregistered event definition domain file: content/events/definitions/mainline_crash_site.json",
    );
    expect(result.output).toContain(
      "Unregistered call template domain file: content/events/call_templates/mainline_crash_site.json",
    );
  });

  it("rejects manifest event domains outside the mainline runtime boundary", () => {
    const root = createContentRoot();
    const definition = minimalEventDefinition();
    definition.domain = "forest";
    writeJson(root, "content/events/definitions/forest.json", {
      event_definitions: [definition],
    });
    writeJson(root, "content/events/call_templates/forest.json", {
      call_templates: [minimalCallTemplate()],
    });
    writeJson(root, "content/events/manifest.json", {
      schema_version: "event-manifest.v1",
      domains: [
        {
          id: "forest",
          definitions: "definitions/forest.json",
          call_templates: "call_templates/forest.json",
          presets: null,
        },
      ],
    });

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Forbidden event manifest domain at domains[0].id: forest");
  });

  it("rejects preset files missing from the manifest", () => {
    const root = createContentRoot();
    writeJson(root, "content/events/presets/forest.json", {
      presets: [minimalPreset()],
    });

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Unregistered event preset domain file: content/events/presets/forest.json");
  });

  it("validates registered preset files against the preset schema", () => {
    const root = createContentRoot();
    const manifest = readJson(root, "content/events/manifest.json");
    manifest.domains[0].presets = "presets/mainline_crash_site.json";
    writeJson(root, "content/events/manifest.json", manifest);
    writeJson(root, "content/events/presets/mainline_crash_site.json", {
      presets: [{ id: "bad_preset" }],
    });

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Schema validation failed: content/events/presets/mainline_crash_site.json");
    expect(result.output).toContain("/presets/0/kind");
  });

  it("rejects map-object actions that point to missing event definitions", () => {
    const root = createContentRoot();
    writeJson(root, "content/map-objects/resources.json", {
      $schema: "../schemas/map-objects.schema.json",
      map_objects: [
        minimalMapObject({
          id: "invalid-event-action-object",
          actions: [
            {
              id: "invalid-event-action-object:inspect",
              category: "object",
              label: "Inspect invalid event action",
              conditions: [],
              event_id: "missing_event_definition",
            },
          ],
        }),
      ],
    });

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Unknown event_id in map object action: missing_event_definition");
    expect(result.output).toContain("content/map-objects/resources.json/map_objects/0/actions/0/event_id");
    expect(result.output).toContain("invalid-event-action-object");
  });

  it("reports default map objectIds that do not exist with a concrete path", () => {
    const root = createContentRoot();
    const defaultMap = readJson(root, "content/maps/default-map.json");
    defaultMap.tiles[0].objectIds = ["missing-map-object"];
    writeJson(root, "content/maps/default-map.json", defaultMap);

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Unknown objectId in default map: missing-map-object");
    expect(result.output).toContain("content/maps/default-map.json/tiles/0/objectIds/0");
  });

  it("rejects forbidden legacy objectIds when they reappear in the default map", () => {
    const root = createContentRoot();
    writeJson(root, "content/map-objects/resources.json", {
      $schema: "../schemas/map-objects.schema.json",
      map_objects: [minimalMapObject({ id: "black-pine-stand" })],
    });
    const defaultMap = readJson(root, "content/maps/default-map.json");
    defaultMap.tiles[0].objectIds = ["black-pine-stand"];
    writeJson(root, "content/maps/default-map.json", defaultMap);

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Forbidden legacy objectId in default map: black-pine-stand");
    expect(result.output).toContain("content/maps/default-map.json/tiles/0/objectIds/0");
  });

  it("rejects structured event content that references unknown crew ids", () => {
    const root = createContentRoot();
    const medicalDefinitions = readJson(root, "content/events/definitions/mainline_medical.json");
    medicalDefinitions.event_definitions[0].sample_contexts[0].crew_id = "unknown_crew";
    writeJson(root, "content/events/definitions/mainline_medical.json", medicalDefinitions);

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Unknown crew id in structured event content: unknown_crew");
    expect(result.output).toContain("content/events/definitions/mainline_medical.json");
  });
});

function createContentRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stellar-content-"));
  tempRoots.push(root);
  fs.cpSync(path.join(projectRoot, "content"), path.join(root, "content"), { recursive: true });
  return root;
}

function runValidator(root) {
  try {
    const output = execFileSync("node", [path.join(projectRoot, "scripts/validate-content.mjs")], {
      cwd: projectRoot,
      env: { ...process.env, VALIDATE_CONTENT_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output };
  } catch (error) {
    return {
      status: error.status ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

function writeJson(root, relativePath, value) {
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, removeUndefined, 2)}\n`);
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function removeUndefined(_key, value) {
  return value === undefined ? undefined : value;
}

function minimalEventDefinition() {
  return {
    schema_version: "event-program-model-v1",
    id: "forest_trace",
    version: 1,
    domain: "forest",
    title: "Forest Trace",
    summary: "A quiet forest trace.",
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
      history_key_template: "event:forest_trace",
      allow_while_active: false,
    },
    event_graph: {
      entry_node_id: "end",
      nodes: [
        {
          id: "end",
          type: "end",
          title: "End",
          blocking: {
            occupies_crew_action: false,
            occupies_communication: false,
            blocking_key_template: null,
          },
          resolution: "resolved",
          result_key: "resolved",
          event_log_template_id: "forest_trace_resolved",
          history_writes: [],
          cleanup_policy: {
            release_blocking_claims: true,
            delete_active_calls: true,
            keep_player_summary: true,
          },
        },
      ],
      edges: [],
      terminal_node_ids: ["end"],
      graph_rules: {
        acyclic: true,
        max_active_nodes: 1,
        allow_parallel_nodes: false,
      },
    },
    sample_contexts: [],
  };
}

function minimalEffect() {
  return {
    id: "write_log",
    type: "add_event_log",
    target: {
      type: "event_log",
    },
    params: {},
    failure_policy: "fail_event",
    record_policy: {
      write_event_log: true,
      write_world_history: false,
      history_key_template: null,
    },
  };
}

function minimalCallNode(overrides = {}) {
  return {
    id: "call",
    type: "call",
    title: "Call",
    call_template_id: "forest_trace_call",
    speaker_crew_ref: {
      type: "primary_crew",
    },
    urgency: "normal",
    delivery: "queued_message",
    options: [
      {
        id: "accept",
        is_default: true,
      },
    ],
    option_node_mapping: {
      accept: "end",
    },
    blocking: {
      occupies_crew_action: false,
      occupies_communication: true,
      blocking_key_template: null,
    },
    expires_in_seconds: 120,
    ...overrides,
  };
}

function minimalCallTemplate(overrides = {}) {
  return {
    schema_version: "call-template-v1",
    id: "forest_trace_call",
    version: 1,
    domain: "forest",
    event_definition_id: "forest_trace",
    node_id: "call",
    render_context_fields: [],
    opening_lines: minimalTextVariantGroup("opening"),
    option_lines: {
      accept: minimalTextVariantGroup("accept"),
    },
    fallback_order: ["default"],
    default_variant_required: true,
    ...overrides,
  };
}

function minimalTextVariantGroup(id) {
  return {
    variants: [
      {
        id: `${id}_default`,
        text: "Sample text.",
        priority: 1,
      },
    ],
    selection: "first_match",
  };
}

function minimalPreset(overrides = {}) {
  return {
    id: "forest_flag_preset",
    kind: "condition",
    expands_to: {
      type: "world_flag_equals",
      field: "sample_flag",
      value: true,
    },
    description: "Sample preset.",
    ...overrides,
  };
}

function minimalMapObject(overrides = {}) {
  return {
    id: "sample-map-object",
    kind: "structure",
    name: "Sample Map Object",
    visibility: "onDiscovered",
    status_options: ["pristine"],
    initial_status: "pristine",
    actions: [],
    ...overrides,
  };
}

function minimalBasicCallActions() {
  return [
    minimalCallAction({ id: "survey", label: "Survey Area", handler: "survey" }),
    minimalCallAction({ id: "move", label: "Move", handler: "move" }),
    minimalCallAction({ id: "standby", label: "Standby", handler: "standby", durationSeconds: 0 }),
    minimalCallAction({
      id: "stop",
      label: "Stop",
      handler: "stop",
      tone: "danger",
      availableWhenBusy: true,
      durationSeconds: 10,
    }),
  ];
}

function minimalObjectCallActions() {
  return [
    minimalObjectCallAction({ id: "survey", label: "Survey {objectName}", handler: "survey_object" }),
    minimalObjectCallAction({ id: "gather", label: "Gather {objectName}", handler: "gather" }),
    minimalObjectCallAction({ id: "build", label: "Build {objectName}", handler: "build" }),
    minimalObjectCallAction({ id: "extract", label: "Extract {objectName}", handler: "extract" }),
    minimalObjectCallAction({ id: "scan", label: "Scan {objectName}", handler: "scan" }),
  ];
}

function minimalObjectCallAction(overrides = {}) {
  return minimalCallAction({
    category: "object_action",
    applicableObjectKinds: ["resourceNode", "structure", "signal"],
    ...overrides,
  });
}

function minimalCallAction(overrides = {}) {
  return {
    id: "survey",
    category: "universal",
    label: "Survey",
    tone: "neutral",
    availableWhenBusy: false,
    durationSeconds: 60,
    handler: "survey",
    ...overrides,
  };
}
