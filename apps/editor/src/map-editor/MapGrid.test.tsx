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
        baseLayerMode="radar"
        interactionMode="paint"
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
        baseLayerMode="radar"
        interactionMode="pan"
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

  it("pans the viewport in select mode while preserving tile clicks", () => {
    const onTileClick = vi.fn();
    render(
      <MapGrid
        draft={createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 40, cols: 40 })}
        selectedTileId="20-20"
        selectedFeatureId={null}
        baseLayerMode="radar"
        interactionMode="pan"
        onSelectTile={vi.fn()}
        onTileClick={onTileClick}
        onTilePointerDown={vi.fn()}
        onTilePointerEnter={vi.fn()}
        onTilePointerUp={vi.fn()}
      />,
    );

    const viewport = screen.getByLabelText("Test Map grid preview");
    Object.defineProperty(viewport, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500, x: 0, y: 0, toJSON: () => ({}) }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Select tile 20-20" }));
    expect(onTileClick).toHaveBeenCalledWith("20-20");

    fireEvent.pointerDown(screen.getByRole("button", { name: "Select tile 20-20" }), { button: 0, pointerType: "mouse", pointerId: 1, clientX: 250, clientY: 250 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 50, clientY: 250 });
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 50, clientY: 250 });

    expect(screen.getByText("rows 8-32 / cols 16-40")).toBeInTheDocument();
  });

  it("selects a tile from a pointer click in pan mode", () => {
    const onTileClick = vi.fn();
    render(
      <MapGrid
        draft={createMapEditorDraft({ id: "test-map", name: "Test Map", rows: 40, cols: 40 })}
        selectedTileId="20-20"
        selectedFeatureId={null}
        baseLayerMode="radar"
        interactionMode="pan"
        onSelectTile={vi.fn()}
        onTileClick={onTileClick}
        onTilePointerDown={vi.fn()}
        onTilePointerEnter={vi.fn()}
        onTilePointerUp={vi.fn()}
      />,
    );

    const viewport = screen.getByLabelText("Test Map grid preview");
    const tile = screen.getByRole("button", { name: "Select tile 20-20" });
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => tile),
    });

    try {
      fireEvent.pointerDown(tile, { button: 0, pointerType: "mouse", pointerId: 1, clientX: 250, clientY: 250 });
      fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 250, clientY: 250 });
      expect(onTileClick).toHaveBeenCalledWith("20-20");
    } finally {
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
    }
  });

  it("marks all feature overlaps when no feature is selected", () => {
    render(
      <MapGrid
        draft={createDraftWithFeatures()}
        selectedTileId="1-1"
        selectedFeatureId={null}
        baseLayerMode="radar"
        featureOverlay
        interactionMode="pan"
        onSelectTile={vi.fn()}
        onTileClick={vi.fn()}
        onTilePointerDown={vi.fn()}
        onTilePointerEnter={vi.fn()}
        onTilePointerUp={vi.fn()}
      />,
    );

    const overlappedTile = screen.getByRole("button", { name: "Select tile 1-2" });
    expect(overlappedTile).toHaveClass("map-grid-tile-feature-overlap");
    expect(overlappedTile).toHaveTextContent("F2");
  });

  it("filters the feature overlay to the selected feature", () => {
    render(
      <MapGrid
        draft={createDraftWithFeatures()}
        selectedTileId="1-1"
        selectedFeatureId="feature-a"
        baseLayerMode="radar"
        featureOverlay
        interactionMode="paint"
        onSelectTile={vi.fn()}
        onTileClick={vi.fn()}
        onTilePointerDown={vi.fn()}
        onTilePointerEnter={vi.fn()}
        onTilePointerUp={vi.fn()}
      />,
    );

    const overlappedTile = screen.getByRole("button", { name: "Select tile 1-2" });
    expect(overlappedTile).toHaveClass("map-grid-tile-feature-footprint");
    expect(overlappedTile).not.toHaveClass("map-grid-tile-feature-overlap");
    expect(overlappedTile).toHaveTextContent("F1");
  });

  it("shows feature footprints without radar, gameplay, or coordinate text in none mode", () => {
    render(
      <MapGrid
        draft={createDraftWithFeatures()}
        selectedTileId="1-1"
        selectedFeatureId={null}
        baseLayerMode="none"
        featureOverlay
        interactionMode="pan"
        onSelectTile={vi.fn()}
        onTileClick={vi.fn()}
        onTilePointerDown={vi.fn()}
        onTilePointerEnter={vi.fn()}
        onTilePointerUp={vi.fn()}
      />,
    );

    const featureTile = screen.getByRole("button", { name: "Select tile 1-1" });
    const emptyTile = screen.getByRole("button", { name: "Select tile 2-1" });
    expect(featureTile).toHaveClass("map-grid-tile-feature");
    expect(featureTile).toHaveTextContent("F1");
    expect(featureTile).not.toHaveTextContent("1,1");
    expect(emptyTile).not.toHaveTextContent("2,1");
    expect(screen.queryByText("i")).not.toBeInTheDocument();
    expect(screen.queryByText("平原")).not.toBeInTheDocument();
  });

  it("keeps tile clicks working in none mode", () => {
    const onTileClick = vi.fn();
    render(
      <MapGrid
        draft={createDraftWithFeatures()}
        selectedTileId="1-1"
        selectedFeatureId={null}
        baseLayerMode="none"
        featureOverlay
        interactionMode="pan"
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
