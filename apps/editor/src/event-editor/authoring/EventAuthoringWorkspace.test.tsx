import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventDraftEnvelope } from "../types";
import EventAuthoringWorkspace from "./EventAuthoringWorkspace";
import { createDefaultNodeTemplate } from "./templates";

vi.mock("./GraphPreviewPanel", () => ({
  default: () => <section aria-label="Read-only graph preview">Graph Preview</section>,
}));

describe("EventAuthoringWorkspace", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the five authoring steps and writes the selected step to the draft editor state", () => {
    const onDraftChange = vi.fn();

    render(<WorkspaceHarness draft={createDraftEnvelope()} onDraftChange={onDraftChange} />);

    const stepNav = screen.getByRole("navigation", { name: "Event authoring steps" });
    for (const label of ["Basic", "Trigger", "Graph", "Effects", "Review"]) {
      expect(within(stepNav).getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(within(stepNav).getByRole("button", { name: "Basic" })).toHaveAttribute("aria-current", "step");

    fireEvent.click(within(stepNav).getByRole("button", { name: "Graph" }));

    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        editor_state: expect.objectContaining({ active_step: "graph", selection: { step: "graph" } }),
      }),
      { markDirty: false },
    );
    expect(within(stepNav).getByRole("button", { name: "Graph" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("heading", { name: "Graph" })).toBeInTheDocument();
    expect(screen.getByLabelText("Draft metadata")).toHaveTextContent("graph");
  });

  it("marks edit-existing domain and definition id as locked in the header", () => {
    render(
      <EventAuthoringWorkspace
        draft={createDraftEnvelope({
          mode: "edit_existing",
          target: {
            domain: "forest",
            definition_id: "forest.signal",
            definition_file_path: "content/events/definitions/forest.json",
            call_template_file_path: "content/events/call_templates/forest.json",
          },
        })}
        onDraftChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Event Authoring Workspace" })).toBeInTheDocument();
    expect(screen.getByLabelText("Draft metadata")).toHaveTextContent("forest_bridge_choice_20260505_153012");
    expect(screen.getByLabelText("Draft metadata")).toHaveTextContent("edit_existing");
    expect(screen.getByLabelText("Draft metadata")).toHaveTextContent("active");
    expect(screen.getByLabelText("Draft metadata")).toHaveTextContent("aaaaaaaa");
    expect(screen.getByLabelText("Draft domain")).toHaveTextContent("forest");
    expect(screen.getByLabelText("Draft domain")).toHaveTextContent("Locked");
    expect(screen.getByLabelText("Draft definition id")).toHaveTextContent("forest.signal");
    expect(screen.getByLabelText("Draft definition id")).toHaveTextContent("Locked");
  });

  it("shows draft dirty state, save action, and save feedback", () => {
    const onSaveDraft = vi.fn();

    render(
      <EventAuthoringWorkspace
        draft={createDraftEnvelope()}
        isDirty
        saveErrorMessage="Draft save did not complete."
        saveIssues={[
          {
            severity: "error",
            code: "invalid_draft",
            message: "Draft id is invalid.",
            json_path: "/draft_id",
          },
        ]}
        onDraftChange={vi.fn()}
        onSaveDraft={onSaveDraft}
      />,
    );

    expect(screen.getByLabelText("Draft save controls")).toHaveTextContent("unsaved changes");
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Draft save did not complete.");
    expect(screen.getByRole("list", { name: "Draft save issues" })).toHaveTextContent("invalid_draft");
  });

  it("runs review validation and jumps node issues back to the graph editor", async () => {
    const onDraftChange = vi.fn();
    const onValidateDraft = vi.fn().mockResolvedValue({
      valid: false,
      issues: [
        {
          severity: "error",
          code: "missing_next_node",
          message: "Missing next node.",
          asset_type: "event_definition",
          asset_id: "forest_bridge_choice",
          json_path: "/event_definitions/0/event_graph/nodes/0/option_node_mapping/ack",
          editor_location: {
            step: "graph",
            section: "event_graph",
            node_id: "call",
            option_id: "ack",
            field_path: "/event_definitions/0/event_graph/nodes/0/option_node_mapping/ack",
          },
        },
      ],
    });
    const draft = createDraftEnvelope({
      editor_state: {
        active_step: "review",
        selection: { step: "review" },
        collapsed_sections: [],
      },
      working_definition: {
        ...createDraftEnvelope().working_definition,
        event_graph: createGraph(),
      },
    });

    render(<WorkspaceHarness draft={draft} onDraftChange={onDraftChange} onValidateDraft={onValidateDraft} />);

    fireEvent.click(screen.getByRole("button", { name: "Run publish validation" }));

    expect(await screen.findByText("Missing next node.")).toBeInTheDocument();
    expect(onValidateDraft).toHaveBeenCalledWith(expect.objectContaining({ draft_id: "forest_bridge_choice_20260505_153012" }));

    fireEvent.click(screen.getByRole("button", { name: "Jump to Graph issue missing_next_node" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-current", "step");
    });
    expect(screen.getByRole("heading", { name: "Graph" })).toBeInTheDocument();
    expect(screen.getByLabelText("Node id")).toHaveValue("call");
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        editor_state: expect.objectContaining({
          active_step: "graph",
          selection: expect.objectContaining({ nodeId: "call", optionId: "ack" }),
        }),
      }),
      { markDirty: false },
    );

    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    expect(screen.getByRole("region", { name: "Structured raw JSON viewer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Graph Nodes" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("/working_definition/event_graph/nodes/0/option_node_mapping/ack")).toBeInTheDocument();
  });
});

function WorkspaceHarness({
  draft,
  onDraftChange,
  onValidateDraft,
}: {
  draft: EventDraftEnvelope;
  onDraftChange: (draft: EventDraftEnvelope, options?: { markDirty?: boolean }) => void;
  onValidateDraft?: Parameters<typeof EventAuthoringWorkspace>[0]["onValidateDraft"];
}) {
  const [currentDraft, setCurrentDraft] = useState(draft);

  return (
    <EventAuthoringWorkspace
      draft={currentDraft}
      onDraftChange={(nextDraft, options) => {
        setCurrentDraft(nextDraft);
        onDraftChange(nextDraft, options);
      }}
      onValidateDraft={onValidateDraft}
    />
  );
}

function createDraftEnvelope(overrides: Partial<EventDraftEnvelope> = {}): EventDraftEnvelope {
  const draft: EventDraftEnvelope = {
    schema_version: "event-editor-draft-v1",
    draft_id: "forest_bridge_choice_20260505_153012",
    mode: "new",
    status: "active",
    source: null,
    target: {
      domain: "forest",
      definition_id: "forest_bridge_choice",
      definition_file_path: "content/events/definitions/forest.json",
      call_template_file_path: "content/events/call_templates/forest.json",
    },
    working_definition: {
      id: "forest_bridge_choice",
      domain: "forest",
      title: "Bridge choice",
      summary: "Choose how to cross the bridge.",
    },
    working_call_templates: [],
    editor_state: {
      active_step: "basic",
      selection: null,
      collapsed_sections: [],
    },
    hashes: {
      source_definition_file: null,
      source_call_template_file: null,
      source_manifest: null,
      draft: "a".repeat(64),
    },
    created_at: "2026-05-05T15:30:12.000Z",
    updated_at: "2026-05-05T15:30:12.000Z",
    published_at: null,
    published_files: [],
  };

  return {
    ...draft,
    ...overrides,
  };
}

function createGraph() {
  return {
    entry_node_id: "call",
    nodes: [
      createDefaultNodeTemplate({
        type: "call",
        eventDefinitionId: "forest_bridge_choice",
        nodeId: "call",
        nextNodeId: "end",
      }),
      createDefaultNodeTemplate({
        type: "end",
        eventDefinitionId: "forest_bridge_choice",
        nodeId: "end",
      }),
    ],
    edges: [{ from_node_id: "call", to_node_id: "end", via: "ack" }],
    terminal_node_ids: ["end"],
    graph_rules: {
      acyclic: true,
      max_active_nodes: 1,
      allow_parallel_nodes: false,
    },
  };
}
