import { describe, expect, it, vi } from "vitest";
import { createSceneState, type PhaserMapCanvasProps, type PhaserMapSceneState } from "./PhaserMapCanvas";
import { INITIAL_ZOOM_LEVEL_INDEX, MapScene, ZOOM_LEVELS } from "./MapScene";
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

  it("zooms in on wheel up and writes the zoom level bridge", () => {
    const setZoomLevelInReact = vi.fn();
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")], { setZoomLevelInReact }) }));

    (scene.create as unknown as () => void).call(scene);
    scene.inputHandlers.wheel({ x: 64, y: 48 }, {}, 0, -1, 0);

    expect(scene.cameras.main.zoom).toBe(ZOOM_LEVELS[2]);
    expect(setZoomLevelInReact).toHaveBeenLastCalledWith(2);
    expect(document.querySelector(".phaser-map-stage")?.getAttribute("data-zoom-level")).toBe("2");
  });

  it("zooms out on wheel down and clamps at the minimum zoom level", () => {
    const setZoomLevelInReact = vi.fn();
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")], { setZoomLevelInReact }) }));

    (scene.create as unknown as () => void).call(scene);
    scene.inputHandlers.wheel({ x: 64, y: 48 }, {}, 0, 1, 0);
    scene.inputHandlers.wheel({ x: 64, y: 48 }, {}, 0, 1, 0);

    expect(scene.cameras.main.zoom).toBe(ZOOM_LEVELS[0]);
    expect(setZoomLevelInReact).toHaveBeenLastCalledWith(0);
    expect(document.querySelector(".phaser-map-stage")?.getAttribute("data-zoom-level")).toBe("0");
  });

  it("right-button drag pans the camera without selecting a tile", () => {
    const onSelectTile = vi.fn();
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")], { onSelectTile }) }));

    (scene.create as unknown as () => void).call(scene);
    scene.inputHandlers.pointerdown({ button: 2, x: 100, y: 100 });
    scene.inputHandlers.pointermove({ x: 130, y: 80 });
    scene.inputHandlers.pointerup({ button: 2 });

    expect(scene.cameras.main.scrollX).toBe(-30 / ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX]);
    expect(scene.cameras.main.scrollY).toBe(20 / ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX]);
    expect(onSelectTile).not.toHaveBeenCalled();
  });

  it("disables the browser context menu for right-button map drag", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")]) }));

    (scene.create as unknown as () => void).call(scene);

    expect(scene.input.mouse.disableContextMenu).toHaveBeenCalledOnce();
  });

  it("ignores another zoom request while a zoom tween is active", () => {
    const setZoomLevelInReact = vi.fn();
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")], { setZoomLevelInReact }) }), { holdTweens: true });

    (scene.create as unknown as () => void).call(scene);
    scene.inputHandlers.wheel({ x: 64, y: 48 }, {}, 0, -1, 0);
    scene.inputHandlers.wheel({ x: 64, y: 48 }, {}, 0, -1, 0);

    expect(scene.cameras.main.zoom).toBe(ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX]);
    expect(scene.tweens.add).toHaveBeenCalledOnce();
    expect(setZoomLevelInReact).toHaveBeenLastCalledWith(2);
    expect(document.querySelector(".phaser-map-stage")?.getAttribute("data-zoom-level")).toBe("2");
  });

  it("pans with WASD using screen-stable speed adjusted by zoom", () => {
    const keys = { D: { isDown: true }, S: { isDown: true } };
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")]) }), { keys });

    (scene.create as unknown as () => void).call(scene);
    (scene.update as unknown as (time: number, delta: number) => void).call(scene, 0, 1000);

    expect(scene.cameras.main.scrollX).toBe(400 / ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX]);
    expect(scene.cameras.main.scrollY).toBe(400 / ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX]);
  });

  it("toggles LOD layer visibility across zoom thresholds during zoom updates", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")]) }));

    (scene.create as unknown as () => void).call(scene);
    scene.inputHandlers.wheel({ x: 64, y: 48 }, {}, 0, -1, 0);

    expect(scene.createdLayers[0]?.setVisible).toHaveBeenLastCalledWith(true);
    expect(scene.createdLayers[1]?.setVisible).toHaveBeenLastCalledWith(true);
  });

  it("keeps the pointer world coordinate stable while wheel zooming", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")]) }));

    (scene.create as unknown as () => void).call(scene);
    scene.inputHandlers.wheel({ x: 70, y: 35 }, {}, 0, -1, 0);

    expect(scene.cameras.main.scrollX).toBeCloseTo(70 / ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX] - 70 / ZOOM_LEVELS[2]);
    expect(scene.cameras.main.scrollY).toBeCloseTo(35 / ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX] - 35 / ZOOM_LEVELS[2]);
  });

  it("zooms in from the keyboard up arrow", () => {
    const keys = { UP: { isDown: true } };
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")]) }), { keys });

    (scene.create as unknown as () => void).call(scene);
    (scene.update as unknown as (time: number, delta: number) => void).call(scene, 0, 16);

    expect(scene.cameras.main.zoom).toBe(ZOOM_LEVELS[2]);
    expect(document.querySelector(".phaser-map-stage")?.getAttribute("data-zoom-level")).toBe("2");
  });
});

function sceneState(tileViews: PhaserMapCanvasProps["tileViews"], overrides: Partial<PhaserMapSceneState> = {}): PhaserMapSceneState {
  return createSceneState({
    columns: 3,
    tileViews,
    crewMarkers: [],
    onSelectTile: vi.fn(),
    ...overrides,
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

function attachSceneDoubles(scene: MapScene, options: { holdTweens?: boolean; keys?: Record<string, { isDown?: boolean }> } = {}) {
  const createdRectangles: Array<{ setOrigin: ReturnType<typeof vi.fn>; setDepth: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
  const createdLayers: Array<{ setDepth: ReturnType<typeof vi.fn>; setVisible: ReturnType<typeof vi.fn> }> = [];
  const inputHandlers: Record<string, (...args: unknown[]) => void> = {};
  document.body.innerHTML = '<div class="phaser-map-stage"></div>';
  const sceneWithDoubles = scene as MapScene & {
    add: {
      rectangle: ReturnType<typeof vi.fn<(x: number, y: number, width: number, height: number, fillColor: number) => { setOrigin: ReturnType<typeof vi.fn>; setDepth: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }>>;
      container: ReturnType<typeof vi.fn<(x: number, y: number) => { setDepth: ReturnType<typeof vi.fn>; setVisible: ReturnType<typeof vi.fn> }>>;
    };
    cameras: { main: { setBounds: ReturnType<typeof vi.fn>; centerOn: ReturnType<typeof vi.fn>; setZoom: ReturnType<typeof vi.fn>; zoom: number; scrollX: number; scrollY: number } };
    input: { on: ReturnType<typeof vi.fn>; mouse: { disableContextMenu: ReturnType<typeof vi.fn> }; keyboard: { addKeys: ReturnType<typeof vi.fn> } };
    tweens: { add: ReturnType<typeof vi.fn> };
    inputHandlers: typeof inputHandlers;
    createdRectangles: typeof createdRectangles;
    createdLayers: typeof createdLayers;
  };

  sceneWithDoubles.add = {
    rectangle: vi.fn(() => {
      const rectangle = { setOrigin: vi.fn(), setDepth: vi.fn(), destroy: vi.fn() };
      createdRectangles.push(rectangle);
      return rectangle;
    }),
    container: vi.fn(() => {
      const layer = { setDepth: vi.fn(), setVisible: vi.fn() };
      createdLayers.push(layer);
      return layer;
    }),
  };
  sceneWithDoubles.cameras = {
    main: {
      setBounds: vi.fn(),
      centerOn: vi.fn(),
      setZoom: vi.fn((zoom: number) => {
        sceneWithDoubles.cameras.main.zoom = zoom;
        return sceneWithDoubles.cameras.main;
      }),
      zoom: ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX],
      scrollX: 0,
      scrollY: 0,
    },
  };
  sceneWithDoubles.input = {
    on: vi.fn((eventName: string, handler: (...args: unknown[]) => void) => {
      inputHandlers[eventName] = handler;
    }),
    mouse: { disableContextMenu: vi.fn() },
    keyboard: { addKeys: vi.fn(() => options.keys ?? {}) },
  };
  sceneWithDoubles.tweens = {
    add: vi.fn((config: { targets: { zoom: number }; zoom: number; onUpdate?: () => void; onComplete?: () => void }) => {
      if (!options.holdTweens) {
        config.targets.zoom = config.zoom;
        config.onUpdate?.();
        config.onComplete?.();
      }
      return config;
    }),
  };
  sceneWithDoubles.inputHandlers = inputHandlers;
  sceneWithDoubles.createdRectangles = createdRectangles;
  sceneWithDoubles.createdLayers = createdLayers;
  return sceneWithDoubles;
}
