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
    writeJson(root, "content/events/manifest.json", {
      schema_version: "event-manifest.v1",
      domains: [
        {
          id: "crash_site",
          definitions: "definitions/crash_site.json",
          call_templates: "call_templates/crash_site.json",
          presets: null,
        },
      ],
    });

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Event manifest validation failed:");
    expect(result.output).toContain("Unregistered event definition domain file: content/events/definitions/forest.json");
    expect(result.output).toContain("Unregistered call template domain file: content/events/call_templates/forest.json");
  });

  it("rejects map candidate actions missing from object call-actions", () => {
    const root = createContentRoot();
    writeJson(root, "content/call-actions/basic-actions.json", {
      $schema: "../schemas/call-actions.schema.json",
      call_actions: minimalBasicCallActions(),
    });
    writeJson(root, "content/call-actions/object-actions.json", {
      $schema: "../schemas/call-actions.schema.json",
      call_actions: minimalObjectCallActions().filter((action) => action.id !== "scan"),
    });
    const defaultMap = readJson(root, "content/maps/default-map.json");
    defaultMap.tiles[0].objects = [
      {
        id: "scan-target",
        kind: "signal",
        name: "Scan Target",
        visibility: "onDiscovered",
        candidateActions: ["scan"],
      },
    ];
    writeJson(root, "content/maps/default-map.json", defaultMap);

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("candidateActions references missing object call-action: scan");
  });

  it("rejects basic call-actions outside the map candidate enum", () => {
    const root = createContentRoot();
    writeJson(root, "content/call-actions/basic-actions.json", {
      $schema: "../schemas/call-actions.schema.json",
      call_actions: [
        ...minimalBasicCallActions(),
        {
          id: "teleport",
          category: "universal",
          label: "Teleport",
          tone: "accent",
          availableWhenBusy: false,
          durationSeconds: 0,
          handler: "teleport",
        },
      ],
    });
    writeJson(root, "content/call-actions/object-actions.json", {
      $schema: "../schemas/call-actions.schema.json",
      call_actions: minimalObjectCallActions(),
    });

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("teleport");
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
