import { describe, expect, it } from "vitest";
import {
  SAMPLE_EVENT_COVERAGE,
  SAMPLE_EVENT_IDS,
  SAMPLE_EVENT_REACHABILITY,
  buildSampleEventContentIndex,
  dryRunApprovedSampleEvents,
} from "./sampleFixtures";

const LEGACY_DEMO_EVENT_IDS = [
  "forest_trace_small_camp",
  "forest_beast_emergency",
  "volcanic_ash_trace",
  "mine_anomaly_report",
  "garry_mine_anomaly_report",
  "crash_site_wreckage_recon",
] as const;
const LEGACY_DEMO_EVENT_ID_SET = new Set<string>(LEGACY_DEMO_EVENT_IDS);

describe("sample event fixtures", () => {
  it("exposes the supported approved sample event ids", () => {
    expect(SAMPLE_EVENT_IDS).toEqual([
      "fixture_normal_discovery",
      "fixture_emergency_call",
      "fixture_cross_crew_objective",
    ]);
  });

  it("covers the required event-program model sample categories", () => {
    expect(SAMPLE_EVENT_COVERAGE).toEqual(
      expect.objectContaining({
        normal_discovery: expect.arrayContaining(["fixture_normal_discovery"]),
        emergency_multi_call: expect.arrayContaining(["fixture_emergency_call"]),
        cross_crew_objective: expect.arrayContaining(["fixture_cross_crew_objective"]),
      }),
    );
  });

  it("documents whether approved samples are manual, seeded, or future integration coverage", () => {
    expect(SAMPLE_EVENT_REACHABILITY).toEqual({
      fixture_normal_discovery: "seeded-regression",
      fixture_emergency_call: "seeded-regression",
      fixture_cross_crew_objective: "seeded-regression",
    });
  });

  it("uses fixture-only ids instead of legacy playable demo event ids", () => {
    expect(SAMPLE_EVENT_IDS.filter((eventId) => LEGACY_DEMO_EVENT_ID_SET.has(eventId))).toEqual([]);
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
