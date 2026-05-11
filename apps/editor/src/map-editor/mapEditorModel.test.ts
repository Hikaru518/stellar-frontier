import { describe, expect, it } from "vitest";
import { createInitialMapEditorState, createMapEditorDraft } from "./mapEditorModel";

describe("mapEditorModel", () => {
  it("creates a map draft with explicit gameplay tiles and radar rows", () => {
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
    expect(draft.radar.world).toEqual({ width: 5, height: 3, origin: { x: 2, y: 1 } });
    expect(draft.radar.glyphRows).toEqual([".....", ".....", "....."]);
    expect(draft.radar.toneRows).toEqual(["ggggg", "ggggg", "ggggg"]);
  });

  it("normalizes existing map content that has no radar field", () => {
    const draft = createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 1, cols: 1 });
    delete (draft as Partial<typeof draft>).radar;

    const state = createInitialMapEditorState(draft);

    expect(state.draft.radar.glyphRows).toEqual(["."]);
    expect(state.draft.radar.toneRows).toEqual(["g"]);
  });
});
