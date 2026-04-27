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
  fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, removeUndefined, 2)}\n`);
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
