import { describe, expect, it } from "vitest";
import {
  decodeJsonPointerSegment,
  encodeJsonPointerSegment,
  formatJsonPathForDisplay,
  getJsonPathLeaf,
  isJsonPathWithin,
  joinJsonPointer,
  mapIssueJsonPathToDraftPath,
  normalizeJsonPathToPointer,
  parseJsonPointer,
} from "./jsonPath";

describe("jsonPath helpers", () => {
  it("parses and formats JSON Pointer paths with escaped segments", () => {
    const segments = parseJsonPointer("/event_definitions/0/event_graph/nodes/bridge~1call/title~0draft");

    expect(segments).toEqual(["event_definitions", "0", "event_graph", "nodes", "bridge/call", "title~draft"]);
    expect(joinJsonPointer(segments)).toBe("/event_definitions/0/event_graph/nodes/bridge~1call/title~0draft");
    expect(formatJsonPathForDisplay("/event_definitions/0/event_graph/nodes/bridge~1call/title~0draft")).toBe(
      "/event_definitions/0/event_graph/nodes/bridge~1call/title~0draft",
    );
  });

  it("supports loose dot and bracket paths for editor fallback display", () => {
    expect(parseJsonPointer("event_definitions[0].event_graph.nodes[1].id")).toEqual([
      "event_definitions",
      "0",
      "event_graph",
      "nodes",
      "1",
      "id",
    ]);
    expect(formatJsonPathForDisplay("event_definitions[0].event_graph.nodes[1].id")).toBe(
      "event_definitions.0.event_graph.nodes.1.id",
    );
    expect(formatJsonPathForDisplay("$.event_definitions[0].event_graph.nodes[1].id")).toBe(
      "event_definitions.0.event_graph.nodes.1.id",
    );
    expect(getJsonPathLeaf("event_definitions[0].event_graph.nodes[1].id")).toBe("id");
  });

  it("normalizes loose paths to pointers and checks parent containment", () => {
    expect(normalizeJsonPathToPointer("$.event_definitions[0].event_graph.nodes[1].id")).toBe(
      "/event_definitions/0/event_graph/nodes/1/id",
    );
    expect(isJsonPathWithin("/working_definition/event_graph/nodes/0/id", "/working_definition/event_graph/nodes")).toBe(true);
    expect(isJsonPathWithin("/working_definition/effect_groups/0/id", "/working_definition/event_graph/nodes")).toBe(false);
  });

  it("maps publish issue paths back into the draft viewer path space", () => {
    expect(mapIssueJsonPathToDraftPath("/event_definitions/0/event_graph/nodes/0/id")).toBe(
      "/working_definition/event_graph/nodes/0/id",
    );
    expect(mapIssueJsonPathToDraftPath("/call_templates/0/option_lines/ack")).toBe("/working_call_templates/0/option_lines/ack");
    expect(mapIssueJsonPathToDraftPath("/working_definition/title")).toBe("/working_definition/title");
  });

  it("encodes and decodes individual JSON Pointer segments", () => {
    expect(encodeJsonPointerSegment("bridge/call~draft")).toBe("bridge~1call~0draft");
    expect(decodeJsonPointerSegment("bridge~1call~0draft")).toBe("bridge/call~draft");
    expect(joinJsonPointer([])).toBe("");
    expect(formatJsonPathForDisplay(null)).toBe("(no path)");
  });
});
