import { describe, expect, it } from "vitest";
import { createInitialMapEditorState, createMapEditorDraft } from "./mapEditorModel";
import { MAP_EDITOR_HISTORY_LIMIT, mapEditorReducer } from "./mapEditorReducer";
import type { MapEditorState } from "./types";

describe("mapEditorReducer", () => {
  it("undoes and redoes one semantic edit", () => {
    const initialState = createState();

    const editedState = mapEditorReducer(initialState, {
      type: "gameplay/applySemanticBrush",
      tileId: "1-1",
      brush: { kind: "terrain", value: "水" },
    });
    expect(editedState.draft.tiles.find((tile) => tile.id === "1-1")?.terrain).toBe("水");
    expect(editedState.history.past).toHaveLength(1);

    const undoneState = mapEditorReducer(editedState, { type: "history/undo" });
    expect(undoneState.draft.tiles.find((tile) => tile.id === "1-1")?.terrain).toBe("平原");
    expect(undoneState.history.future).toHaveLength(1);

    const redoneState = mapEditorReducer(undoneState, { type: "history/redo" });
    expect(redoneState.draft.tiles.find((tile) => tile.id === "1-1")?.terrain).toBe("水");
    expect(redoneState.history.future).toEqual([]);
  });

  it("limits semantic edit history to 100 entries", () => {
    let state = createState();
    for (let index = 0; index < MAP_EDITOR_HISTORY_LIMIT + 5; index += 1) {
      state = mapEditorReducer(state, {
        type: "radar/updateCell",
        tileId: "1-1",
        glyph: String(index % 10),
      });
    }

    expect(state.history.past).toHaveLength(MAP_EDITOR_HISTORY_LIMIT);
  });

  it("applies terrain, weather, radar glyph, and radar tone semantic brush commands", () => {
    let state = mapEditorReducer(createState(), {
      type: "gameplay/applySemanticBrush",
      tileId: "1-1",
      brush: { kind: "terrain", value: "水" },
    });
    state = mapEditorReducer(state, {
      type: "gameplay/applySemanticBrush",
      tileId: "1-2",
      brush: { kind: "weather", value: "酸雨" },
    });
    state = mapEditorReducer(state, {
      type: "gameplay/applySemanticBrush",
      tileId: "2-1",
      brush: { kind: "radarGlyph", glyph: "#" },
    });
    state = mapEditorReducer(state, {
      type: "gameplay/applySemanticBrush",
      tileId: "2-2",
      brush: { kind: "radarTone", tone: "r" },
    });

    expect(state.draft.tiles.find((tile) => tile.id === "1-1")?.terrain).toBe("水");
    expect(state.draft.tiles.find((tile) => tile.id === "1-2")?.weather).toBe("酸雨");
    expect(state.draft.radar.glyphRows[1]?.[0]).toBe("#");
    expect(state.draft.radar.toneRows[1]?.[1]).toBe("r");
  });

  it("sets origin, updates radar origin, and keeps it in initial discovered tiles", () => {
    const nextState = mapEditorReducer(createState(), {
      type: "gameplay/applySemanticBrush",
      tileId: "1-1",
      brush: { kind: "origin" },
    });

    expect(nextState.draft.originTileId).toBe("1-1");
    expect(nextState.draft.radar.world.origin).toEqual({ x: 0, y: 0 });
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

  it("creates, edits, and deletes map features", () => {
    let state = mapEditorReducer(createState(), {
      type: "feature/create",
      feature: {
        id: "test_feature",
        name: "Test Feature",
        kind: "feature",
        priority: 10,
        visibility: "onDiscovered",
        footprint: {
          type: "row_spans",
          spans: [{ row: 1, colStart: 1, colEnd: 1 }],
        },
      },
    });

    expect(state.draft.features).toHaveLength(1);
    expect(state.draft.features[0]?.footprint.spans).toEqual([{ row: 1, colStart: 1, colEnd: 1 }]);

    state = mapEditorReducer(state, {
      type: "feature/update",
      featureId: "test_feature",
      patch: {
        name: "Generator",
        kind: "facility:power_system",
        priority: 42,
        visibility: "hidden",
      },
    });

    expect(state.draft.features[0]).toMatchObject({
      id: "test_feature",
      name: "Generator",
      kind: "facility:power_system",
      priority: 42,
      visibility: "hidden",
    });

    state = mapEditorReducer(state, {
      type: "feature/update",
      featureId: "test_feature",
      patch: {
        investigatable: true,
        status_options: ["damaged", "repaired"],
        initial_status: "damaged",
        actions: [
          {
            id: "test_feature:inspect",
            category: "feature",
            label: "Inspect",
            tone: "accent",
            conditions: [],
            event_id: "test_feature_inspect",
          },
        ],
      },
    });

    expect(state.draft.features[0]).toMatchObject({
      investigatable: true,
      status_options: ["damaged", "repaired"],
      initial_status: "damaged",
      actions: [
        expect.objectContaining({
          id: "test_feature:inspect",
          label: "Inspect",
          tone: "accent",
          event_id: "test_feature_inspect",
        }),
      ],
    });

    state = mapEditorReducer(state, {
      type: "feature/delete",
      featureId: "test_feature",
    });

    expect(state.draft.features.some((feature) => feature.id === "test_feature")).toBe(false);
  });
});

function createState(): MapEditorState {
  return createInitialMapEditorState(createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 2, cols: 2 }));
}
