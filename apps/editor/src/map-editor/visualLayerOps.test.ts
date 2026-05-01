import { describe, expect, it } from "vitest";
import { createMapEditorDraft, createVisualLayer } from "./mapEditorModel";
import {
  bucketFillVisualCells,
  eraseVisualCell,
  paintVisualCell,
  rectangleFillVisualCells,
} from "./visualLayerOps";
import type { MapEditorDraft, MapVisualCellDefinition } from "./types";

describe("visualLayerOps", () => {
  const grass: MapVisualCellDefinition = { tilesetId: "kenney-tiny-battle", tileIndex: 1 };
  const water: MapVisualCellDefinition = { tilesetId: "kenney-tiny-battle", tileIndex: 2 };

  it("brush, eraser, bucket fill, and rectangle fill only modify the requested layer cells", () => {
    let draft = createDraftWithLayers();
    const originalTiles = structuredClone(draft.tiles);

    draft = paintVisualCell(draft, "objects", "1-1", grass);
    expect(draft.visual.layers[0]?.cells).toEqual({});
    expect(draft.visual.layers[1]?.cells).toEqual({ "1-1": grass });

    draft = rectangleFillVisualCells(draft, "base", "1-1", "2-2", water);
    expect(draft.visual.layers[0]?.cells).toEqual({
      "1-1": water,
      "1-2": water,
      "2-1": water,
      "2-2": water,
    });
    expect(draft.visual.layers[1]?.cells).toEqual({ "1-1": grass });

    draft = eraseVisualCell(draft, "base", "1-1");
    expect(draft.visual.layers[0]?.cells).not.toHaveProperty("1-1");
    expect(draft.visual.layers[1]?.cells).toEqual({ "1-1": grass });

    draft = bucketFillVisualCells(draft, "base", "3-3", grass);
    expect(draft.visual.layers[0]?.cells["3-3"]).toEqual(grass);
    expect(draft.tiles).toEqual(originalTiles);
  });

  it("does not modify a locked layer", () => {
    const draft = createDraftWithLayers();

    const nextDraft = paintVisualCell(draft, "locked", "1-1", grass);

    expect(nextDraft).toBe(draft);
    expect(nextDraft.visual.layers[2]?.cells).toEqual({});
  });

  it("visual operations do not modify gameplay fields", () => {
    const draft = createDraftWithLayers();
    draft.tiles[0] = {
      ...draft.tiles[0]!,
      terrain: "水",
      weather: "酸雨",
      objectIds: ["signal"],
      specialStates: [
        {
          id: "hazard",
          name: "Hazard",
          visibility: "onDiscovered",
          severity: "high",
          startsActive: true,
        },
      ],
    };
    const originalTile = structuredClone(draft.tiles[0]);

    const nextDraft = bucketFillVisualCells(draft, "base", "1-1", grass);

    expect(nextDraft.tiles[0]).toEqual(originalTile);
  });

  it("bucket fill replaces a contiguous region with matching visual cells", () => {
    const draft = createDraftWithLayers();
    draft.visual.layers[0]!.cells = {
      "1-1": grass,
      "1-2": grass,
      "2-1": grass,
      "3-3": grass,
    };

    const nextDraft = bucketFillVisualCells(draft, "base", "1-1", water);

    expect(nextDraft.visual.layers[0]?.cells).toEqual({
      "1-1": water,
      "1-2": water,
      "2-1": water,
      "3-3": grass,
    });
  });
});

function createDraftWithLayers(): MapEditorDraft {
  const draft = createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 3, cols: 3 });
  return {
    ...draft,
    visual: {
      layers: [
        createVisualLayer("base", "Base"),
        createVisualLayer("objects", "Objects"),
        createVisualLayer("locked", "Locked", { locked: true }),
      ],
    },
  };
}
