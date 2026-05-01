import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useReducer } from "react";
import { afterEach, describe, expect, it } from "vitest";
import TileInspector from "./TileInspector";
import { createInitialMapEditorState, createMapEditorDraft } from "./mapEditorModel";
import { mapEditorReducer } from "./mapEditorReducer";
import type { MapEditorMapObject } from "./apiClient";
import type { MapEditorCommand, MapEditorState } from "./types";

describe("TileInspector", () => {
  afterEach(() => {
    cleanup();
  });

  it("edits area, terrain, weather, environment, objects, and special states", () => {
    render(<InspectorHarness />);

    fireEvent.change(screen.getByLabelText("Area name"), { target: { value: "Flooded ridge" } });
    fireEvent.change(screen.getByLabelText("Terrain"), { target: { value: "水" } });
    fireEvent.change(screen.getByLabelText("Weather"), { target: { value: "酸雨" } });
    fireEvent.change(screen.getByLabelText("Temp C"), { target: { value: "31" } });
    fireEvent.change(screen.getByLabelText("Radiation"), { target: { value: "high" } });
    fireEvent.click(screen.getByLabelText(/Supply crate/));

    const specialForm = screen.getByLabelText("Add special state");
    fireEvent.change(within(specialForm).getByLabelText("Special state id"), { target: { value: "acid-pool" } });
    fireEvent.change(within(specialForm).getByLabelText("Special state name"), { target: { value: "Acid Pool" } });
    fireEvent.change(within(specialForm).getByLabelText("Special state severity"), { target: { value: "critical" } });
    fireEvent.change(within(specialForm).getByLabelText("Special state visibility"), { target: { value: "hidden" } });
    fireEvent.click(within(specialForm).getByRole("button", { name: "Add special" }));

    const output = screen.getByTestId("tile-state");
    expect(output).toHaveTextContent("Flooded ridge");
    expect(output).toHaveTextContent("水");
    expect(output).toHaveTextContent("酸雨");
    expect(output).toHaveTextContent("\"temperatureCelsius\":31");
    expect(output).toHaveTextContent("\"radiationLevel\":\"high\"");
    expect(output).toHaveTextContent("supply-crate");
    expect(output).toHaveTextContent("acid-pool");

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByTestId("tile-state")).not.toHaveTextContent("acid-pool");
  });
});

function InspectorHarness() {
  const [state, dispatch] = useReducer((current: MapEditorState, command: MapEditorCommand) => mapEditorReducer(current, command), createState());
  const tile = state.draft.tiles[0];

  return (
    <>
      <TileInspector draft={state.draft} selectedTileId="1-1" mapObjects={createMapObjects()} onCommand={dispatch} />
      <output data-testid="tile-state">{JSON.stringify(tile)}</output>
    </>
  );
}

function createState(): MapEditorState {
  return createInitialMapEditorState(createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 2, cols: 2 }));
}

function createMapObjects(): MapEditorMapObject[] {
  return [
    {
      id: "supply-crate",
      name: "Supply crate",
      kind: "structure",
      visibility: "onDiscovered",
    },
  ];
}
