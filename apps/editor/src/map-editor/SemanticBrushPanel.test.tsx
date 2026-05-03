import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useReducer, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import SemanticBrushPanel from "./SemanticBrushPanel";
import { createInitialMapEditorState, createMapEditorDraft } from "./mapEditorModel";
import { mapEditorReducer } from "./mapEditorReducer";
import type { MapEditorCommand, MapEditorState, SemanticBrush } from "./types";

describe("SemanticBrushPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("arms terrain and weather semantic brushes", () => {
    render(<SemanticHarness />);

    fireEvent.change(screen.getByLabelText("Terrain brush"), { target: { value: "水" } });
    expect(screen.getByTestId("active-brush")).toHaveTextContent("terrain");
    expect(screen.getByTestId("active-brush")).toHaveTextContent("水");

    fireEvent.change(screen.getByLabelText("Weather brush"), { target: { value: "酸雨" } });
    expect(screen.getByTestId("active-brush")).toHaveTextContent("weather");
    expect(screen.getByTestId("active-brush")).toHaveTextContent("酸雨");
  });

  it("sets origin and toggles initial discovered for the selected tile", () => {
    render(<SemanticHarness selectedTileId="1-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Set selected origin" }));
    expect(screen.getByTestId("draft-state")).toHaveTextContent('"originTileId":"1-1"');
    expect(screen.getByTestId("draft-state")).toHaveTextContent('"1-1"');

    fireEvent.click(screen.getByRole("button", { name: "Toggle selected discovered" }));
    expect(screen.getByTestId("draft-state")).toHaveTextContent('"initialDiscoveredTileIds":["1-1"]');
  });

  it("arms discovered brushes", () => {
    render(<SemanticHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Discover Brush" }));
    expect(screen.getByTestId("active-brush")).toHaveTextContent("discovered");
    expect(screen.getByTestId("active-brush")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "Hide Brush" }));
    expect(screen.getByTestId("active-brush")).toHaveTextContent("false");
  });
});

function SemanticHarness({ selectedTileId = "2-2" }: { selectedTileId?: string }) {
  const [state, dispatch] = useReducer((current: MapEditorState, command: MapEditorCommand) => mapEditorReducer(current, command), createState());
  const [activeBrush, setActiveBrush] = useState<SemanticBrush | null>(null);

  return (
    <>
      <SemanticBrushPanel
        draft={state.draft}
        selectedTileId={selectedTileId}
        activeBrush={activeBrush}
        onActiveBrushChange={setActiveBrush}
        onCommand={dispatch}
      />
      <output data-testid="active-brush">{JSON.stringify(activeBrush)}</output>
      <output data-testid="draft-state">{JSON.stringify(state.draft)}</output>
    </>
  );
}

function createState(): MapEditorState {
  return createInitialMapEditorState(createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 2, cols: 2 }));
}
