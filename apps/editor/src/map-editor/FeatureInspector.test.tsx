import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useReducer, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import FeatureInspector from "./FeatureInspector";
import { createInitialMapEditorState, createMapEditorDraft } from "./mapEditorModel";
import { mapEditorReducer } from "./mapEditorReducer";
import type { MapEditorCommand, MapEditorState } from "./types";

describe("FeatureInspector", () => {
  afterEach(() => {
    cleanup();
  });

  it("creates a feature from the selected tile, selects it, edits core fields, and deletes it", () => {
    render(<InspectorHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Add feature" }));

    const featureList = screen.getByLabelText("Feature list");
    expect(within(featureList).getByRole("button", { name: "Select feature feature" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("feature-state")).toHaveTextContent('"spans":[{"row":2,"colStart":2,"colEnd":2}]');

    fireEvent.change(screen.getByLabelText("Feature name"), { target: { value: "Generator" } });
    fireEvent.change(screen.getByLabelText("Feature kind"), { target: { value: "facility:power_system" } });
    fireEvent.change(screen.getByLabelText("Feature priority"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("Feature visibility"), { target: { value: "hidden" } });
    fireEvent.change(screen.getByLabelText("Feature tags"), { target: { value: "iafs, repair_target" } });

    const output = screen.getByTestId("feature-state");
    expect(output).toHaveTextContent('"name":"Generator"');
    expect(output).toHaveTextContent('"kind":"facility:power_system"');
    expect(output).toHaveTextContent('"priority":42');
    expect(output).toHaveTextContent('"visibility":"hidden"');
    expect(output).toHaveTextContent('"tags":["iafs","repair_target"]');

    fireEvent.click(screen.getByRole("button", { name: "Delete feature" }));

    expect(screen.getByTestId("feature-state")).toHaveTextContent("[]");
  });

  it("requires status options and initial status when a feature is investigatable", () => {
    render(<InspectorHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Add feature" }));
    fireEvent.click(screen.getByLabelText("Investigatable"));

    const statusOptions = screen.getByLabelText("Status options");
    const initialStatus = screen.getByLabelText("Initial status");
    expect(statusOptions).toBeRequired();
    expect(initialStatus).toBeRequired();

    fireEvent.change(statusOptions, { target: { value: "" } });
    fireEvent.change(initialStatus, { target: { value: "" } });

    expect(statusOptions).toHaveAttribute("aria-invalid", "true");
    expect(initialStatus).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Status options are required.")).toBeInTheDocument();
    expect(screen.getByText("Initial status is required.")).toBeInTheDocument();
  });

  it("edits basic action fields for an investigatable feature", () => {
    render(<InspectorHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Add feature" }));
    fireEvent.click(screen.getByLabelText("Investigatable"));
    fireEvent.click(screen.getByRole("button", { name: "Add action" }));
    fireEvent.change(screen.getByLabelText("Action 1 id"), { target: { value: "feature:inspect" } });
    fireEvent.change(screen.getByLabelText("Action 1 label"), { target: { value: "Inspect" } });
    fireEvent.change(screen.getByLabelText("Action 1 tone"), { target: { value: "accent" } });
    fireEvent.change(screen.getByLabelText("Action 1 event id"), { target: { value: "feature_inspect_event" } });

    const output = screen.getByTestId("feature-state");
    expect(output).toHaveTextContent('"actions":[{"id":"feature:inspect"');
    expect(output).toHaveTextContent('"label":"Inspect"');
    expect(output).toHaveTextContent('"tone":"accent"');
    expect(output).toHaveTextContent('"event_id":"feature_inspect_event"');

    fireEvent.click(screen.getByRole("button", { name: "Delete action" }));

    expect(screen.getByTestId("feature-state")).toHaveTextContent('"actions":[]');
  });
});

function InspectorHarness() {
  const [state, dispatch] = useReducer(
    (current: MapEditorState, command: MapEditorCommand) => mapEditorReducer(current, command),
    createInitialMapEditorState(createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 2, cols: 2 })),
  );
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [footprintBrushMode, setFootprintBrushMode] = useState<"add" | "erase">("add");

  return (
    <>
      <FeatureInspector
        draft={state.draft}
        selectedTileId="2-2"
        selectedFeatureId={selectedFeatureId}
        footprintBrushMode={footprintBrushMode}
        onFootprintBrushModeChange={setFootprintBrushMode}
        onSelectFeature={setSelectedFeatureId}
        onCommand={dispatch}
      />
      <output data-testid="feature-state">{JSON.stringify(state.draft.features)}</output>
    </>
  );
}
