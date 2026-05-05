import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventDraftEnvelope } from "../types";
import EventAuthoringWorkspace from "./EventAuthoringWorkspace";

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
});

function WorkspaceHarness({
  draft,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  const [currentDraft, setCurrentDraft] = useState(draft);

  return (
    <EventAuthoringWorkspace
      draft={currentDraft}
      onDraftChange={(nextDraft) => {
        setCurrentDraft(nextDraft);
        onDraftChange(nextDraft);
      }}
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
