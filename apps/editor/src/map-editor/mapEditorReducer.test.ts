import { describe, expect, it } from "vitest";
import { createInitialMapEditorState, createMapEditorDraft, createVisualLayer } from "./mapEditorModel";
import { MAP_EDITOR_HISTORY_LIMIT, mapEditorReducer } from "./mapEditorReducer";
import type { MapEditorState, MapVisualCellDefinition } from "./types";

describe("mapEditorReducer", () => {
  const grass: MapVisualCellDefinition = { tilesetId: "kenney-tiny-battle", tileIndex: 1 };
  const water: MapVisualCellDefinition = { tilesetId: "kenney-tiny-battle", tileIndex: 2 };

  it("undoes and redoes one visual paint command", () => {
    const initialState = createState();

    const paintedState = mapEditorReducer(initialState, { type: "visual/brush", tileId: "1-1", cell: grass });
    expect(paintedState.draft.visual.layers[0]?.cells).toEqual({ "1-1": grass });
    expect(paintedState.history.past).toHaveLength(1);

    const undoneState = mapEditorReducer(paintedState, { type: "history/undo" });
    expect(undoneState.draft.visual.layers[0]?.cells).toEqual({});
    expect(undoneState.history.future).toHaveLength(1);

    const redoneState = mapEditorReducer(undoneState, { type: "history/redo" });
    expect(redoneState.draft.visual.layers[0]?.cells).toEqual({ "1-1": grass });
    expect(redoneState.history.future).toEqual([]);
  });

  it("does not create history for locked layer visual commands", () => {
    const initialState = {
      ...createState(),
      activeLayerId: "locked",
    };

    const nextState = mapEditorReducer(initialState, { type: "visual/brush", tileId: "1-1", cell: grass });

    expect(nextState).toBe(initialState);
    expect(nextState.history.past).toEqual([]);
  });

  it("limits visual command history to 100 entries", () => {
    let state = createState();
    for (let index = 0; index < MAP_EDITOR_HISTORY_LIMIT + 5; index += 1) {
      state = mapEditorReducer(state, {
        type: "visual/brush",
        tileId: "1-1",
        cell: { tilesetId: "kenney-tiny-battle", tileIndex: index },
      });
    }

    expect(state.history.past).toHaveLength(MAP_EDITOR_HISTORY_LIMIT);
  });

  it("clears redo history after a new visual command", () => {
    const paintedState = mapEditorReducer(createState(), { type: "visual/brush", tileId: "1-1", cell: grass });
    const undoneState = mapEditorReducer(paintedState, { type: "history/undo" });

    const repaintedState = mapEditorReducer(undoneState, { type: "visual/brush", tileId: "1-1", cell: water });

    expect(repaintedState.draft.visual.layers[0]?.cells).toEqual({ "1-1": water });
    expect(repaintedState.history.future).toEqual([]);
  });

  it("keeps gameplay fields unchanged when painting with the visual brush", () => {
    const initialState = createState();
    const originalTile = initialState.draft.tiles.find((tile) => tile.id === "1-1");

    const nextState = mapEditorReducer(initialState, { type: "visual/brush", tileId: "1-1", cell: grass });

    expect(nextState.draft.tiles.find((tile) => tile.id === "1-1")).toEqual(originalTile);
  });

  it("applies terrain and weather semantic brush commands", () => {
    const terrainState = mapEditorReducer(createState(), {
      type: "gameplay/applySemanticBrush",
      tileId: "1-1",
      brush: { kind: "terrain", value: "水" },
    });
    const weatherState = mapEditorReducer(terrainState, {
      type: "gameplay/applySemanticBrush",
      tileId: "1-2",
      brush: { kind: "weather", value: "酸雨" },
    });

    expect(weatherState.draft.tiles.find((tile) => tile.id === "1-1")?.terrain).toBe("水");
    expect(weatherState.draft.tiles.find((tile) => tile.id === "1-2")?.weather).toBe("酸雨");
  });

  it("sets origin and keeps it in initial discovered tiles", () => {
    const nextState = mapEditorReducer(createState(), {
      type: "gameplay/applySemanticBrush",
      tileId: "1-1",
      brush: { kind: "origin" },
    });

    expect(nextState.draft.originTileId).toBe("1-1");
    expect(nextState.draft.initialDiscoveredTileIds).toContain("1-1");
  });

  it("toggles initial discovered tiles without removing the origin", () => {
    let state = mapEditorReducer(createState(), {
      type: "gameplay/applySemanticBrush",
      tileId: "1-2",
      brush: { kind: "discovered", discovered: true },
    });
    state = mapEditorReducer(state, {
      type: "gameplay/applySemanticBrush",
      tileId: "1-2",
      brush: { kind: "discovered", discovered: false },
    });
    state = mapEditorReducer(state, {
      type: "gameplay/applySemanticBrush",
      tileId: state.draft.originTileId,
      brush: { kind: "discovered", discovered: false },
    });

    expect(state.draft.initialDiscoveredTileIds).not.toContain("1-2");
    expect(state.draft.initialDiscoveredTileIds).toContain(state.draft.originTileId);
  });
});

function createState(): MapEditorState {
  const draft = createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 2, cols: 2 });
  draft.visual.layers = [createVisualLayer("base", "Base"), createVisualLayer("locked", "Locked", { locked: true })];
  return createInitialMapEditorState(draft);
}
