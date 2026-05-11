import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MapGrid from "./MapGrid";
import { createMapEditorDraft } from "./mapEditorModel";
import type { MapEditorDraft } from "./types";

describe("MapGrid", () => {
  afterEach(() => {
    cleanup();
  });

  it("emits one stroke with every tile the pointer enters", () => {
    const onTilePointerDown = vi.fn();
    const onTilePointerEnter = vi.fn();
    const onTilePointerUp = vi.fn();
    render(
      <MapGrid
        draft={createDraft()}
        selectedTileId={null}
        selectedFeatureId={null}
        gameplayOverlay={false}
        onSelectTile={vi.fn()}
        onTileClick={vi.fn()}
        onTilePointerDown={onTilePointerDown}
        onTilePointerEnter={onTilePointerEnter}
        onTilePointerUp={onTilePointerUp}
      />,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Select tile 1-1" }), { button: 0, pointerType: "mouse" });
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Select tile 1-2" }));
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Select tile 2-2" }));
    fireEvent.pointerUp(screen.getByRole("button", { name: "Select tile 2-2" }));

    expect(onTilePointerDown).toHaveBeenCalledWith("1-1");
    expect(onTilePointerEnter).toHaveBeenNthCalledWith(1, "1-2");
    expect(onTilePointerEnter).toHaveBeenNthCalledWith(2, "2-2");
    expect(onTilePointerUp).toHaveBeenCalledTimes(1);
    expect(onTilePointerUp).toHaveBeenCalledWith("2-2");
  });

  it("routes keyboard or synthetic tile clicks through the tile click callback", () => {
    const onTileClick = vi.fn();
    render(
      <MapGrid
        draft={createDraft()}
        selectedTileId={null}
        selectedFeatureId={null}
        gameplayOverlay={false}
        onSelectTile={vi.fn()}
        onTileClick={onTileClick}
        onTilePointerDown={vi.fn()}
        onTilePointerEnter={vi.fn()}
        onTilePointerUp={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select tile 1-1" }));

    expect(onTileClick).toHaveBeenCalledWith("1-1");
  });

  it("marks selected feature footprints and overlapping feature tiles", () => {
    render(
      <MapGrid
        draft={createDraftWithFeatures()}
        selectedTileId="1-1"
        selectedFeatureId="feature-a"
        gameplayOverlay={false}
        onSelectTile={vi.fn()}
        onTileClick={vi.fn()}
        onTilePointerDown={vi.fn()}
        onTilePointerEnter={vi.fn()}
        onTilePointerUp={vi.fn()}
      />,
    );

    const overlappedTile = screen.getByRole("button", { name: "Select tile 1-2" });
    expect(overlappedTile).toHaveClass("map-grid-tile-feature-footprint");
    expect(overlappedTile).toHaveClass("map-grid-tile-feature-overlap");
    expect(overlappedTile).toHaveTextContent("F2");
  });
});

function createDraft(): MapEditorDraft {
  return createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 2, cols: 2 });
}

function createDraftWithFeatures(): MapEditorDraft {
  return {
    ...createDraft(),
    features: [
      {
        id: "feature-a",
        name: "Feature A",
        kind: "feature",
        priority: 10,
        visibility: "onDiscovered",
        footprint: {
          type: "row_spans",
          spans: [{ row: 1, colStart: 1, colEnd: 2 }],
        },
      },
      {
        id: "feature-b",
        name: "Feature B",
        kind: "feature",
        priority: 20,
        visibility: "onDiscovered",
        footprint: {
          type: "row_spans",
          spans: [{ row: 1, colStart: 2, colEnd: 2 }],
        },
      },
    ],
  };
}
