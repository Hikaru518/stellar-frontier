import { describe, expect, it } from "vitest";
import {
  SAMPLE_EVENT_COVERAGE,
  SAMPLE_EVENT_IDS,
  buildSampleEventContentIndex,
  dryRunApprovedSampleEvents,
} from "./sampleFixtures";

describe("sample event fixtures", () => {
  it("exposes the five approved TASK-011 sample event ids", () => {
    expect(SAMPLE_EVENT_IDS).toEqual([
      "forest_trace_small_camp",
      "forest_beast_encounter",
      "mountain_signal_probe",
      "volcanic_ash_trace",
      "lost_relic_argument",
    ]);
  });

  it("covers the required event-program model sample categories", () => {
    expect(SAMPLE_EVENT_COVERAGE).toEqual(
      expect.objectContaining({
        normal_discovery: expect.arrayContaining(["forest_trace_small_camp"]),
        emergency_multi_call: expect.arrayContaining(["forest_beast_encounter"]),
        wait_node: expect.arrayContaining(["mountain_signal_probe"]),
        cross_crew_objective: expect.arrayContaining(["volcanic_ash_trace"]),
        long_term_consequence: expect.arrayContaining(["lost_relic_argument"]),
      }),
    );
  });

  it("builds an index that contains all sample definitions and call templates", () => {
    const { index, errors } = buildSampleEventContentIndex();

    expect(errors).toEqual([]);
    for (const eventId of SAMPLE_EVENT_IDS) {
      const definition = index.definitionsById.get(eventId);

      expect(definition?.status).toBe("approved");
      expect(definition?.sample_contexts.length).toBeGreaterThan(0);
      expect(definition?.content_refs?.call_template_ids ?? []).toEqual(
        expect.arrayContaining(definition?.event_graph.nodes.filter((node) => node.type === "call").map((node) => node.call_template_id) ?? []),
      );
    }
  });

  it("dry-runs every approved sample context to a terminal path", () => {
    const reports = dryRunApprovedSampleEvents();

    expect(reports).toHaveLength(SAMPLE_EVENT_IDS.length);
    expect(reports.map((report) => report.event_definition_id).sort()).toEqual([...SAMPLE_EVENT_IDS].sort());
    for (const report of reports) {
      expect(report.errors).toEqual([]);
      expect(report.terminal_status).toBe("resolved");
      expect(report.terminal_node_id).toBeTruthy();
      expect(report.visited_node_ids).toContain(report.terminal_node_id);
    }
  });
});
