import { describe, expect, it } from "vitest";
import { createInitialMapEditorState, createMapEditorDraft, createVisualLayer } from "./mapEditorModel";

describe("mapEditorModel", () => {
  it("creates a map draft with full gameplay tiles and centered discovery", () => {
    const draft = createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 3, cols: 5 });

    expect(draft.tiles).toHaveLength(15);
    expect(draft.tiles.map((tile) => tile.id)).toEqual([
      "1-1",
      "1-2",
      "1-3",
      "1-4",
      "1-5",
      "2-1",
      "2-2",
      "2-3",
      "2-4",
      "2-5",
      "3-1",
      "3-2",
      "3-3",
      "3-4",
      "3-5",
    ]);
    expect(draft.originTileId).toBe("2-3");
    expect(draft.initialDiscoveredTileIds).toEqual(["2-3"]);
    expect(draft.tiles[0]).toMatchObject({
      areaName: "区域 1-1",
      terrain: "平原",
      weather: "晴朗",
      objectIds: [],
      specialStates: [],
    });
    expect(draft.tiles[0]?.environment).toEqual({
      temperatureCelsius: 20,
      humidityPercent: 40,
      magneticFieldMicroTesla: 50,
      radiationLevel: "none",
      toxicityLevel: "none",
      atmosphericPressureKpa: 101,
    });
    expect(draft.visual.layers).toEqual([]);
  });

  it("uses the first visual layer as the initial active layer", () => {
    const draft = createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 1, cols: 1 });
    draft.visual.layers = [createVisualLayer("base", "Base")];

    expect(createInitialMapEditorState(draft).activeLayerId).toBe("base");
  });

  it("normalizes existing map content that has no visual field", () => {
    const draft = createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 1, cols: 1 });
    delete (draft as Partial<typeof draft>).visual;

    const state = createInitialMapEditorState(draft);

    expect(state.activeLayerId).toBeNull();
    expect(state.draft.visual.layers).toEqual([]);
  });
});
