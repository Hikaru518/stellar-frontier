import { describe, expect, it, vi } from "vitest";
import { createSceneState, type PhaserMapCanvasProps, type PhaserMapSceneState } from "./PhaserMapCanvas";
import { MapScene } from "./MapScene";
import { TILE_GAP, TILE_SIZE } from "./mapView";

describe("MapScene", () => {
  it("is configured as the Phaser MapScene and keeps the state ref current", () => {
    const state = sceneState([tileView("0-0")]);
    const scene = attachSceneDoubles(new MapScene({ current: state }));
    const nextState = sceneState([tileView("0-1", { col: 1 })]);

    scene.updateState(nextState);

    expect(scene.getState()).toBe(nextState);
    expect(scene.key).toBe("MapScene");
    expect(scene.extend.updateState).toBe(scene.updateState);
  });

  it("draws full-size terrain rectangles at tile grid coordinates with tile fill colors", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([]) }));
    const discoveredTile = tileView("1-2", { row: 1, col: 2, fillColor: "#2f8f46" });
    const frontierTile = tileView("0-0", { row: 0, col: 0, fillColor: "#6f7378", status: "frontier" });

    scene.updateState(sceneState([discoveredTile, frontierTile]));

    expect(scene.add.rectangle).toHaveBeenCalledWith(2 * (TILE_SIZE + TILE_GAP), TILE_SIZE + TILE_GAP, TILE_SIZE, TILE_SIZE, 0x2f8f46);
    expect(scene.add.rectangle).toHaveBeenCalledWith(0, 0, TILE_SIZE, TILE_SIZE, 0x6f7378);
    expect(scene.createdRectangles.map((rectangle) => rectangle.setDepth)).toHaveLength(2);
    expect(scene.createdRectangles.every((rectangle) => rectangle.setOrigin.mock.calls[0]?.[0] === 0 && rectangle.setOrigin.mock.calls[0]?.[1] === 0)).toBe(true);
    expect(scene.createdRectangles.every((rectangle) => rectangle.setDepth.mock.calls[0]?.[0] === 1)).toBe(true);
  });

  it("clears previous terrain objects and recenters camera when state changes", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([]) }));

    scene.updateState(sceneState([tileView("0-0", { row: 0, col: 0 })]));
    const firstRectangle = scene.createdRectangles[0];
    scene.updateState(sceneState([tileView("1-1", { row: 1, col: 1, fillColor: "#d8b45f" })]));

    expect(firstRectangle?.destroy).toHaveBeenCalledOnce();
    expect(scene.add.rectangle).toHaveBeenCalledTimes(2);
    expect(scene.cameras.main.setBounds).toHaveBeenLastCalledWith(0, 0, 2 * (TILE_SIZE + TILE_GAP), 2 * (TILE_SIZE + TILE_GAP));
    expect(scene.cameras.main.centerOn).toHaveBeenLastCalledWith(TILE_SIZE + TILE_GAP, TILE_SIZE + TILE_GAP);
  });

  it("create builds the base layer from the current state", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")]) }));

    (scene.create as unknown as () => void).call(scene);

    expect(scene.add.rectangle).toHaveBeenCalledOnce();
    expect(scene.cameras.main.setBounds).toHaveBeenCalledWith(0, 0, TILE_SIZE + TILE_GAP, TILE_SIZE + TILE_GAP);
  });
});

function sceneState(tileViews: PhaserMapCanvasProps["tileViews"]): PhaserMapSceneState {
  return createSceneState({
    columns: 3,
    tileViews,
    crewMarkers: [],
    onSelectTile: vi.fn(),
  });
}

function tileView(id: string, overrides: Partial<PhaserMapCanvasProps["tileViews"][number]> = {}): PhaserMapCanvasProps["tileViews"][number] {
  return {
    id,
    row: 0,
    col: 0,
    displayCoord: "(0,0)",
    status: "discovered",
    fillColor: "#2f8f46",
    tooltip: "营地 | 森林 | (0,0)",
    label: "营地",
    terrain: "森林",
    semanticLines: ["营地", "森林"],
    crewLabels: [],
    isDanger: false,
    isRoute: false,
    isSelected: false,
    isTarget: false,
    ...overrides,
  };
}

function attachSceneDoubles(scene: MapScene) {
  const createdRectangles: Array<{ setOrigin: ReturnType<typeof vi.fn>; setDepth: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
  const sceneWithDoubles = scene as MapScene & {
    add: { rectangle: ReturnType<typeof vi.fn> };
    cameras: { main: { setBounds: ReturnType<typeof vi.fn>; centerOn: ReturnType<typeof vi.fn> } };
    createdRectangles: typeof createdRectangles;
  };

  sceneWithDoubles.add = {
    rectangle: vi.fn(() => {
      const rectangle = { setOrigin: vi.fn(), setDepth: vi.fn(), destroy: vi.fn() };
      createdRectangles.push(rectangle);
      return rectangle;
    }),
  };
  sceneWithDoubles.cameras = {
    main: {
      setBounds: vi.fn(),
      centerOn: vi.fn(),
    },
  };
  sceneWithDoubles.createdRectangles = createdRectangles;
  return sceneWithDoubles;
}
