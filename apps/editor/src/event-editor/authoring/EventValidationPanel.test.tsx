import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventEditorIssue } from "../types";
import EventValidationPanel from "./EventValidationPanel";

describe("EventValidationPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("groups validation issues and preserves severity, code, message, and path", () => {
    render(<EventValidationPanel issues={createIssues()} status="complete" />);

    expect(screen.getByRole("region", { name: "Event validation panel" })).toBeInTheDocument();
    expect(screen.getByLabelText("Validation issue summary")).toHaveTextContent("3 errors");
    expect(screen.getByLabelText("Validation issue summary")).toHaveTextContent("3 warnings");

    expect(within(screen.getByRole("list", { name: "Basic validation issues" })).getByText("Title is required.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Graph validation issues" })).getByText("Missing next node.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Effects validation issues" })).getByText("Unknown effect id.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Call Template validation issues" })).getByText("Missing option line.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Domain / Manifest validation issues" })).getByText("Missing manifest file.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Review / Raw JSON validation issues" })).getByText("Unknown path.")).toBeInTheDocument();

    expect(screen.getByText("required_title")).toBeInTheDocument();
    expect(screen.getByText("/event_definitions/0/title")).toBeInTheDocument();
    expect(screen.getAllByText("warning").length).toBeGreaterThan(0);
    expect(screen.getAllByText("error").length).toBeGreaterThan(0);
  });

  it("reports issue jumps to the parent", () => {
    const onIssueJump = vi.fn();
    const issues = createIssues();

    render(<EventValidationPanel issues={issues} onIssueJump={onIssueJump} />);

    fireEvent.click(screen.getByRole("button", { name: "Jump to Graph issue missing_next_node" }));

    expect(onIssueJump).toHaveBeenCalledWith(issues[1]);
  });
});

function createIssues(): EventEditorIssue[] {
  return [
    {
      severity: "error",
      code: "required_title",
      message: "Title is required.",
      asset_type: "event_definition",
      asset_id: "bridge",
      json_path: "/event_definitions/0/title",
      editor_location: {
        step: "basic",
        section: "title",
        field_path: "/event_definitions/0/title",
      },
    },
    {
      severity: "warning",
      code: "missing_next_node",
      message: "Missing next node.",
      asset_type: "event_definition",
      asset_id: "bridge",
      json_path: "/event_definitions/0/event_graph/nodes/0/next_node_id",
      editor_location: {
        step: "graph",
        section: "event_graph",
        node_id: "wait_bridge",
        field_path: "/event_definitions/0/event_graph/nodes/0/next_node_id",
      },
    },
    {
      severity: "error",
      code: "unknown_effect",
      message: "Unknown effect id.",
      asset_type: "event_definition",
      asset_id: "bridge",
      json_path: "/event_definitions/0/effect_groups/0/effects/0/id",
      editor_location: {
        step: "effects",
        section: "effect_groups",
        effect_group_id: "bridge_effects",
        effect_id: "mark_bridge_ready",
      },
    },
    {
      severity: "warning",
      code: "missing_option_line",
      message: "Missing option line.",
      asset_type: "call_template",
      asset_id: "bridge_call",
      json_path: "/call_templates/0/option_lines/accept",
      editor_location: {
        step: "graph",
        section: "call_templates",
        node_id: "call_bridge",
        option_id: "accept",
        call_template_id: "bridge_call",
      },
    },
    {
      severity: "error",
      code: "missing_manifest_file",
      message: "Missing manifest file.",
      asset_type: "manifest",
      json_path: "/domains/0/definitions",
      editor_location: {
        step: "domain",
        section: "manifest",
      },
    },
    {
      severity: "warning",
      code: "unknown_path",
      message: "Unknown path.",
      json_path: "event_definitions[0].unknown",
    },
  ];
}
