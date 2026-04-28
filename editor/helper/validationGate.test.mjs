// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildValidationReport } from "./validationGate.mjs";

describe("validationGate", () => {
  it("maps content index and event reference issues into a structured report", async () => {
    const report = await buildValidationReport({
      event_definitions: [
        {
          id: "event.alpha",
          domain: "test",
          trigger: { type: "action_complete" },
          candidate_selection: { mutex_group: null },
          event_graph: {
            entry_node_id: "missing",
            terminal_node_ids: [],
            nodes: [],
            edges: [],
            graph_rules: { acyclic: true, max_active_nodes: 1, allow_parallel_nodes: false },
          },
        },
      ],
      call_templates: [],
      handlers: [],
      presets: [],
    });

    expect(report.passed).toBe(false);
    expect(report.command).toBe("npm run validate:content");
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "missing_entry_node",
          asset_type: "event_definition",
          asset_id: "event.alpha",
          json_path: "/event_definitions/0/event_graph/entry_node_id",
        }),
      ]),
    );
  });
});
