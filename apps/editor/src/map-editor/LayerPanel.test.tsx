import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import LayerPanel from "./LayerPanel";
import { createInitialMapEditorState, createMapEditorDraft, createVisualLayer } from "./mapEditorModel";
import { mapEditorReducer } from "./mapEditorReducer";
import type { MapEditorCommand, MapEditorState } from "./types";

describe("LayerPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("adds, renames, activates, toggles, adjusts, reorders, and deletes visual layers", () => {
    render(<LayerPanelHarness />);

    expect(screen.getByDisplayValue("Base")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Layer" }));
    expect(screen.getByDisplayValue("Layer 2")).toBeInTheDocument();
    expect(screen.getByText("active=layer-2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Layer name layer-2"), { target: { value: "Objects" } });
    expect(screen.getByDisplayValue("Objects")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Active" })[0]!);
    expect(screen.getByText("active=base")).toBeInTheDocument();

    const baseRow = screen.getByText("base").closest("li");
    expect(baseRow).not.toBeNull();
    fireEvent.click(within(baseRow as HTMLElement).getByLabelText("Visible"));
    fireEvent.click(within(baseRow as HTMLElement).getByLabelText("Locked"));
    fireEvent.change(within(baseRow as HTMLElement).getByLabelText("Opacity"), { target: { value: "35" } });

    expect(screen.getByTestId("draft-json")).toHaveTextContent('"visible":false');
    expect(screen.getByTestId("draft-json")).toHaveTextContent('"locked":true');
    expect(screen.getByTestId("draft-json")).toHaveTextContent('"opacity":0.35');

    fireEvent.click(screen.getByRole("button", { name: "Move Objects up" }));
    expect(screen.getByText("order=layer-2,base")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Objects" }));
    expect(screen.queryByDisplayValue("Objects")).not.toBeInTheDocument();
    expect(screen.getByText("order=base")).toBeInTheDocument();
  });

  it("keeps solo as local editor state outside draft JSON", () => {
    render(<LayerPanelHarness />);

    const baseRow = screen.getByText("base").closest("li");
    expect(baseRow).not.toBeNull();
    fireEvent.click(within(baseRow as HTMLElement).getByLabelText("Solo"));

    expect(within(baseRow as HTMLElement).getByLabelText("Solo")).toBeChecked();
    expect(screen.getByText("solo=base")).toBeInTheDocument();
    expect(screen.getByTestId("draft-json")).not.toHaveTextContent("solo");
  });
});

function LayerPanelHarness() {
  const [state, setState] = useState<MapEditorState>(() => {
    const draft = createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 2, cols: 2 });
    draft.visual.layers = [createVisualLayer("base", "Base")];
    return createInitialMapEditorState(draft);
  });
  const [soloLayerId, setSoloLayerId] = useState<string | null>(null);

  function dispatch(command: MapEditorCommand) {
    setState((current) => mapEditorReducer(current, command));
  }

  return (
    <>
      <LayerPanel state={state} soloLayerId={soloLayerId} onSoloLayerChange={setSoloLayerId} onCommand={dispatch} />
      <p>active={state.activeLayerId ?? "none"}</p>
      <p>solo={soloLayerId ?? "none"}</p>
      <p>order={state.draft.visual.layers.map((layer) => layer.id).join(",")}</p>
      <pre data-testid="draft-json">{JSON.stringify(state.draft.visual.layers, null, 0)}</pre>
    </>
  );
}
