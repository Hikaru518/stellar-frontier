import { describe, expect, it, vi } from "vitest";
import { createSceneState, type PhaserMapCanvasProps, type PhaserMapSceneState } from "./PhaserMapCanvas";
import { CAMERA_EDGE_PADDING_RATIO, INITIAL_ZOOM_LEVEL_INDEX, MapScene, ZOOM_LEVELS, createMapSceneClass } from "./MapScene";
import { TILE_GAP, TILE_SIZE } from "./mapView";

describe("MapScene", () => {
  it("creates a Phaser-compatible Scene subclass that can receive state through init", () => {
    const state = sceneState([tileView("0-0")]);
    class FakeScene {
      constructor(readonly config: { key: string }) {}
    }
    const SceneClass = createMapSceneClass({ Scene: FakeScene }, { current: state });
    const scene = attachSceneDoubles(new SceneClass() as unknown as MapScene);

    scene.init({ stateRef: { current: state } });

    expect(scene).toBeInstanceOf(FakeScene);
    expect((scene as unknown as FakeScene).config).toEqual({ key: "MapScene" });
    expect(scene.getState()).toBe(state);
  });

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

  it("preloads registry tilesets as packed spritesheets from public paths", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([]) }));

    (scene.preload as unknown as () => void).call(scene);

    expect(scene.load.spritesheet).toHaveBeenCalledWith("kenney-tiny-battle", "/maps/tilesets/kenney-tiny-battle/tilemap_packed.png", {
      frameWidth: 16,
      frameHeight: 16,
      spacing: 0,
      margin: 0,
    });
  });

  it("draws discovered tile visual sprites above terrain fallback", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([]) }));

    scene.updateState(
      sceneState([
        tileView("0-0", {
          visualLayers: [{ layerId: "base", layerName: "Base", order: 0, opacity: 1, tilesetId: "kenney-tiny-battle", tileIndex: 4 }],
        }),
      ]),
    );

    expect(scene.add.rectangle).toHaveBeenCalledWith(0, 0, TILE_SIZE, TILE_SIZE, 0x2f8f46);
    expect(scene.add.sprite).toHaveBeenCalledWith(0, 0, "kenney-tiny-battle", 4);
    expect(scene.createdRectangles[0]?.setDepth).toHaveBeenCalledWith(1);
    expect(scene.createdSprites[0]?.setOrigin).toHaveBeenCalledWith(0, 0);
    expect(scene.createdSprites[0]?.setDisplaySize).toHaveBeenCalledWith(TILE_SIZE, TILE_SIZE);
    expect(scene.createdSprites[0]?.setAlpha).toHaveBeenCalledWith(1);
    expect(scene.createdSprites[0]?.setDepth).toHaveBeenCalledWith(2);
  });

  it("draws multiple visual sprite layers by order and opacity", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([]) }));

    scene.updateState(
      sceneState([
        tileView("1-2", {
          row: 1,
          col: 2,
          visualLayers: [
            { layerId: "detail", layerName: "Detail", order: 2, opacity: 0.6, tilesetId: "kenney-tiny-battle", tileIndex: 8 },
            { layerId: "base", layerName: "Base", order: 0, opacity: 1, tilesetId: "kenney-tiny-battle", tileIndex: 4 },
          ],
        }),
      ]),
    );

    expect(scene.add.sprite).toHaveBeenNthCalledWith(1, 2 * TILE_SIZE, TILE_SIZE, "kenney-tiny-battle", 4);
    expect(scene.add.sprite).toHaveBeenNthCalledWith(2, 2 * TILE_SIZE, TILE_SIZE, "kenney-tiny-battle", 8);
    expect(scene.createdSprites.map((sprite) => sprite.setAlpha.mock.calls[0]?.[0])).toEqual([1, 0.6]);
    expect(scene.createdSprites.map((sprite) => sprite.setDepth.mock.calls[0]?.[0])).toEqual([2, 2.002]);
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

  it("keeps a dragged camera position across same-size state refreshes", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([]) }));
    const tiles = [tileView("0-0"), tileView("5-5", { row: 5, col: 5 })];

    scene.updateState(sceneState(tiles));
    scene.cameras.main.scrollX = 42;
    scene.cameras.main.scrollY = 24;
    scene.updateState(sceneState(tiles, { crewMarkers: [crewMarker("mike", { x: 64, y: 64 })] }));

    expect(scene.cameras.main.setBounds).toHaveBeenCalledOnce();
    expect(scene.cameras.main.centerOn).toHaveBeenCalledOnce();
    expect(scene.cameras.main.scrollX).toBe(42);
    expect(scene.cameras.main.scrollY).toBe(24);
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
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0"), tileView("5-5", { row: 5, col: 5 })], { onSelectTile }) }));

    (scene.create as unknown as () => void).call(scene);
    scene.inputHandlers.pointerdown({ button: 2, x: 100, y: 100 });
    scene.inputHandlers.pointermove({ x: 70, y: 80 });
    scene.inputHandlers.pointerup({ button: 2 });

    expect(scene.cameras.main.scrollX).toBe(30 / ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX]);
    expect(scene.cameras.main.scrollY).toBe(20 / ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX]);
    expect(onSelectTile).not.toHaveBeenCalled();
  });

  it("does not reveal tile text on hover", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("1-2", { row: 1, col: 2, tooltip: "森林 | 北部营地 | (2,1)" })]) }));

    (scene.create as unknown as () => void).call(scene);
    scene.inputHandlers.pointermove({ x: 10, y: 10, worldX: 2 * (TILE_SIZE + TILE_GAP) + 10, worldY: TILE_SIZE + TILE_GAP + 10 });

    expect(scene.time.delayedCall).not.toHaveBeenCalled();
    expect(scene.createdTexts).toEqual([]);
  });

  it("leaves hover movement textless when moving across tiles", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0"), tileView("0-1", { col: 1, tooltip: "平原 | 东侧 | (1,0)" })]) }));

    (scene.create as unknown as () => void).call(scene);
    scene.inputHandlers.pointermove({ x: 10, y: 10 });
    scene.inputHandlers.pointermove({ x: 20, y: 10, worldX: TILE_SIZE + TILE_GAP + 10, worldY: 10 });

    expect(scene.time.delayedCall).not.toHaveBeenCalled();
    expect(scene.createdTexts).toEqual([]);
  });

  it("left-clicking a tile selects it through the latest state ref without opening inline text", () => {
    const oldSelectTile = vi.fn();
    const latestSelectTile = vi.fn();
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")], { onSelectTile: oldSelectTile }) }));

    (scene.create as unknown as () => void).call(scene);
    scene.stateRef.current = sceneState([tileView("0-0", { terrain: "森林", label: "营地", tooltip: "营地 | 森林 | (0,0)" })], { onSelectTile: latestSelectTile });
    scene.inputHandlers.pointerdown({ button: 0, x: 10, y: 10 });

    expect(oldSelectTile).not.toHaveBeenCalled();
    expect(latestSelectTile).toHaveBeenCalledWith("0-0");
    expect(scene.createdTexts).toEqual([]);
  });

  it("draws a tile selection frame as an overlay", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([]) }));

    scene.updateState(sceneState([tileView("0-1", { col: 1, isSelected: true })]));

    const overlayGraphics = scene.createdGraphics[2];
    expect(overlayGraphics?.setDepth).toHaveBeenCalledWith(14);
    expect(overlayGraphics?.lineStyle).toHaveBeenCalledWith(4, 0xb45b13, 1);
    expect(overlayGraphics?.moveTo).toHaveBeenCalledWith(TILE_SIZE + 2, 2);
  });

  it("right-clicking or dragging does not select tiles or show text", () => {
    const onSelectTile = vi.fn();
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")], { onSelectTile }) }));

    (scene.create as unknown as () => void).call(scene);
    scene.inputHandlers.pointerdown({ button: 2, x: 10, y: 10 });
    scene.inputHandlers.pointermove({ button: 2, x: 30, y: 10 });
    scene.pendingDelayedCalls.forEach((call) => call.callback());
    scene.inputHandlers.pointerup({ button: 2 });

    expect(onSelectTile).not.toHaveBeenCalled();
    expect(scene.time.delayedCall).not.toHaveBeenCalled();
    expect(scene.createdTexts).toEqual([]);
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
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0"), tileView("5-5", { row: 5, col: 5 })]) }), { keys });

    (scene.create as unknown as () => void).call(scene);
    (scene.update as unknown as (time: number, delta: number) => void).call(scene, 0, 1000);

    expect(scene.cameras.main.scrollX).toBe(400 / ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX]);
    expect(scene.cameras.main.scrollY).toBe(400 / ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX]);
  });

  it("clamps keyboard pan to the current world bounds", () => {
    const keys = { D: { isDown: true }, S: { isDown: true } };
    const tiles = [tileView("0-0"), tileView("5-5", { row: 5, col: 5 })];
    const scene = attachSceneDoubles(new MapScene({ current: sceneState(tiles) }), { keys });
    const worldSize = 6 * (TILE_SIZE + TILE_GAP);
    const viewportSize = 100 / ZOOM_LEVELS[INITIAL_ZOOM_LEVEL_INDEX];
    const edgePadding = Math.min(TILE_SIZE, viewportSize * CAMERA_EDGE_PADDING_RATIO);
    const maxScroll = worldSize - viewportSize + edgePadding;

    (scene.create as unknown as () => void).call(scene);
    scene.cameras.main.scrollX = maxScroll - 5;
    scene.cameras.main.scrollY = maxScroll - 5;
    (scene.update as unknown as (time: number, delta: number) => void).call(scene, 0, 1000);

    expect(scene.cameras.main.scrollX).toBe(maxScroll);
    expect(scene.cameras.main.scrollY).toBe(maxScroll);
  });

  it("allows panning slightly past the top-left edge at high zoom for corner inspection", () => {
    const keys = { A: { isDown: true }, W: { isDown: true } };
    const tiles = [tileView("0-0"), tileView("7-7", { row: 7, col: 7 })];
    const scene = attachSceneDoubles(new MapScene({ current: sceneState(tiles) }), { keys });
    const viewportSize = 100 / ZOOM_LEVELS[3];
    const edgePadding = Math.min(TILE_SIZE, viewportSize * CAMERA_EDGE_PADDING_RATIO);

    (scene.create as unknown as () => void).call(scene);
    scene.cameras.main.zoom = ZOOM_LEVELS[3];
    (scene.update as unknown as (time: number, delta: number) => void).call(scene, 0, 1000);

    expect(scene.cameras.main.scrollX).toBeCloseTo(-edgePadding);
    expect(scene.cameras.main.scrollY).toBeCloseTo(-edgePadding);
  });

  it("toggles LOD layer visibility across zoom thresholds during zoom updates", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")]) }));

    (scene.create as unknown as () => void).call(scene);
    scene.inputHandlers.wheel({ x: 64, y: 48 }, {}, 0, -1, 0);

    expect(scene.createdLayers[0]?.setVisible).toHaveBeenLastCalledWith(true);
    expect(scene.createdLayers[1]?.setVisible).toHaveBeenLastCalledWith(true);
  });

  it("does not draw area labels before the player selects a tile", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([]) }));
    const tiles = [
      tileView("1-2", { row: 1, col: 2, areaName: "北部玄武高地" }),
      tileView("0-2", { row: 0, col: 2, areaName: "北部玄武高地" }),
      tileView("0-1", { row: 0, col: 1, areaName: "北部玄武高地" }),
      tileView("2-0", { row: 2, col: 0, areaName: "南部裂谷" }),
      tileView("0-0", { row: 0, col: 0, status: "unknownHole", label: "?" }),
    ];

    scene.updateState(sceneState(tiles));

    expect(scene.createdTexts).toEqual([]);
  });

  it("keeps the pointer world coordinate stable while wheel zooming", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0"), tileView("5-5", { row: 5, col: 5 })]) }));

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

  it("draws crew marker containers with head and body circles at depth 20", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")]) }));

    scene.updateState(sceneState([tileView("0-0")], { crewMarkers: [crewMarker("mike", { x: 64, y: 64 })] }));

    const markerContainer = scene.createdContainers.find((container) => container.x === 64 && container.y === 64);
    expect(markerContainer?.setDepth).toHaveBeenCalledWith(20);
    expect(scene.add.circle).toHaveBeenCalledWith(0, 3, 8, 0x24384f);
    expect(scene.add.circle).toHaveBeenCalledWith(0, -9, 6, 0xf4eadf);
    expect(scene.createdCircles.find((circle) => circle.radius === 6)?.setStrokeStyle).toHaveBeenCalledWith(2, 0x24384f);
    expect(markerContainer?.add).toHaveBeenCalledWith(expect.arrayContaining(scene.createdCircles));
  });

  it("tweens crew markers to changed targets over 250ms and writes data-char-tile", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0"), tileView("0-1", { col: 1 })]) }));
    const eastCenterX = TILE_SIZE + TILE_SIZE / 2;

    scene.updateState(sceneState([tileView("0-0"), tileView("0-1", { col: 1 })], { crewMarkers: [crewMarker("mike", { x: 64, y: 64 })] }));
    const markerContainer = scene.createdContainers.find((container) => container.x === 64 && container.y === 64);
    scene.updateState(sceneState([tileView("0-0"), tileView("0-1", { col: 1 })], { crewMarkers: [crewMarker("mike", { x: eastCenterX, y: 64 })] }));

    expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(markerContainer);
    expect(scene.tweens.add).toHaveBeenLastCalledWith(expect.objectContaining({ targets: markerContainer, x: eastCenterX, y: 64, duration: 250 }));
    expect(markerContainer?.x).toBe(eastCenterX);
    expect(markerContainer?.y).toBe(64);
    expect(document.querySelector(".phaser-map-stage")?.getAttribute("data-char-tile")).toBe("0-1");
  });

  it("draws and clears the route preview from route tile views", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([]) }));
    const tiles = [tileView("0-0"), tileView("0-1", { col: 1, isRoute: true }), tileView("0-2", { col: 2, isRoute: true })];

    scene.updateState(sceneState(tiles));
    const pathGraphics = scene.createdGraphics[0];
    scene.updateState(sceneState(tiles.map((tile) => ({ ...tile, isRoute: false }))));

    expect(pathGraphics?.setDepth).toHaveBeenCalledWith(11);
    expect(pathGraphics?.lineStyle).toHaveBeenCalledWith(2, 0x90b0c8, 0.55);
    expect(pathGraphics?.lineTo).toHaveBeenCalledWith(2 * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2, TILE_SIZE / 2);
    expect(pathGraphics?.clear).toHaveBeenCalledTimes(2);
  });

  it("draws orange trail segments after crew movement completes", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0"), tileView("0-1", { col: 1 })]) }));
    const eastCenterX = TILE_SIZE + TILE_SIZE / 2;

    scene.updateState(sceneState([tileView("0-0"), tileView("0-1", { col: 1 })], { crewMarkers: [crewMarker("mike", { x: 64, y: 64 })] }));
    scene.updateState(sceneState([tileView("0-0"), tileView("0-1", { col: 1 })], { crewMarkers: [crewMarker("mike", { x: eastCenterX, y: 64 })] }));
    const trailGraphics = scene.createdGraphics[1];

    expect(trailGraphics?.setDepth).toHaveBeenCalledWith(12);
    expect(trailGraphics?.lineStyle).toHaveBeenCalledWith(4, 0xb45b13, 0.9);
    expect(trailGraphics?.lineTo).toHaveBeenCalledWith(eastCenterX, 64);
    expect(trailGraphics?.strokeCircle).toHaveBeenCalledWith(64, 64, 3);
    expect(trailGraphics?.strokeCircle).toHaveBeenCalledWith(eastCenterX, 64, 3);
  });

  it("offsets multiple crew markers in the same tile to avoid overlap", () => {
    const scene = attachSceneDoubles(new MapScene({ current: sceneState([tileView("0-0")]) }));

    scene.updateState(sceneState([tileView("0-0")], { crewMarkers: [crewMarker("mike", { x: 64, y: 64 }), crewMarker("amy", { x: 64, y: 64 })] }));
    const markerContainers = scene.createdContainers.filter((container) => container.children.length > 0);

    expect(markerContainers.map((container) => [container.x, container.y])).toEqual([
      [64, 64],
      [82, 64],
    ]);
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
    areaName: "营地",
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

function crewMarker(crewId: string, overrides: Partial<PhaserMapCanvasProps["crewMarkers"][number]> = {}): PhaserMapCanvasProps["crewMarkers"][number] {
  return {
    crewId,
    label: crewId[0]?.toUpperCase() ?? "?",
    x: 0,
    y: 0,
    ...overrides,
  };
}

function attachSceneDoubles(scene: MapScene, options: { holdTweens?: boolean; keys?: Record<string, { isDown?: boolean }> } = {}) {
  const createdRectangles: Array<{
    fillColor: number;
    setOrigin: ReturnType<typeof vi.fn>;
    setDepth: ReturnType<typeof vi.fn>;
    setAlpha: ReturnType<typeof vi.fn>;
    setStrokeStyle: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }> = [];
  const createdSprites: Array<{
    x: number;
    y: number;
    texture: string;
    frame: number;
    setOrigin: ReturnType<typeof vi.fn>;
    setDepth: ReturnType<typeof vi.fn>;
    setAlpha: ReturnType<typeof vi.fn>;
    setDisplaySize: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }> = [];
  const createdTexts: Array<{
    x: number;
    y: number;
    content: string;
    setOrigin: ReturnType<typeof vi.fn>;
    setDepth: ReturnType<typeof vi.fn>;
    setVisible: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }> = [];
  const createdCircles: Array<{
    x: number;
    y: number;
    radius: number;
    fillColor: number;
    setStrokeStyle: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }> = [];
  const createdContainers: Array<{
    x: number;
    y: number;
    children: unknown[];
    setDepth: ReturnType<typeof vi.fn>;
    setVisible: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }> = [];
  const createdGraphics: Array<{
    setDepth: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    lineStyle: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    strokePath: ReturnType<typeof vi.fn>;
    strokeCircle: ReturnType<typeof vi.fn>;
    fillStyle: ReturnType<typeof vi.fn>;
    fillCircle: ReturnType<typeof vi.fn>;
  }> = [];
  const createdLayers: Array<{ setDepth: ReturnType<typeof vi.fn>; setVisible: ReturnType<typeof vi.fn> }> = [];
  const pendingDelayedCalls: Array<{ callback: () => void; remove: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
  const inputHandlers: Record<string, (...args: unknown[]) => void> = {};
  document.body.innerHTML = '<div class="phaser-map-stage"></div>';
  const sceneWithDoubles = scene as MapScene & {
    add: {
      rectangle: ReturnType<typeof vi.fn<(x: number, y: number, width: number, height: number, fillColor: number) => { setOrigin: ReturnType<typeof vi.fn>; setDepth: ReturnType<typeof vi.fn>; setAlpha: ReturnType<typeof vi.fn>; setStrokeStyle: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }>>;
      sprite: ReturnType<typeof vi.fn>;
      text: ReturnType<typeof vi.fn<(x: number, y: number, content: string, style?: Record<string, unknown>) => { x: number; y: number; setOrigin: ReturnType<typeof vi.fn>; setDepth: ReturnType<typeof vi.fn>; setVisible: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }>>;
      circle: ReturnType<typeof vi.fn>;
      graphics: ReturnType<typeof vi.fn>;
      container: ReturnType<typeof vi.fn>;
    };
    load: { image: ReturnType<typeof vi.fn>; spritesheet: ReturnType<typeof vi.fn> };
    init: (data: { stateRef: { current: PhaserMapSceneState } }) => void;
    cameras: { main: { setBounds: ReturnType<typeof vi.fn>; centerOn: ReturnType<typeof vi.fn>; setZoom: ReturnType<typeof vi.fn>; zoom: number; scrollX: number; scrollY: number; width: number; height: number } };
    input: { on: ReturnType<typeof vi.fn>; mouse: { disableContextMenu: ReturnType<typeof vi.fn> }; keyboard: { addKeys: ReturnType<typeof vi.fn> } };
    tweens: { add: ReturnType<typeof vi.fn>; killTweensOf: ReturnType<typeof vi.fn> };
    time: { delayedCall: ReturnType<typeof vi.fn> };
    inputHandlers: typeof inputHandlers;
    createdRectangles: typeof createdRectangles;
    createdSprites: typeof createdSprites;
    createdTexts: typeof createdTexts;
    createdCircles: typeof createdCircles;
    createdContainers: typeof createdContainers;
    createdGraphics: typeof createdGraphics;
    createdLayers: typeof createdLayers;
    pendingDelayedCalls: typeof pendingDelayedCalls;
  };

  sceneWithDoubles.add = {
    rectangle: vi.fn((_x: number, _y: number, _width: number, _height: number, fillColor: number) => {
      const rectangle = { fillColor, setOrigin: vi.fn(), setDepth: vi.fn(), setAlpha: vi.fn(), setStrokeStyle: vi.fn(), destroy: vi.fn() };
      createdRectangles.push(rectangle);
      return rectangle;
    }),
    sprite: vi.fn((x: number, y: number, texture: string, frame: number) => {
      const sprite = { x, y, texture, frame, setOrigin: vi.fn(), setDepth: vi.fn(), setAlpha: vi.fn(), setDisplaySize: vi.fn(), destroy: vi.fn() };
      createdSprites.push(sprite);
      return sprite;
    }),
    text: vi.fn((x: number, y: number, content: string) => {
      const text = { x, y, content, setOrigin: vi.fn(), setDepth: vi.fn(), setVisible: vi.fn(), destroy: vi.fn() };
      createdTexts.push(text);
      return text;
    }),
    circle: vi.fn((x: number, y: number, radius: number, fillColor: number) => {
      const circle = { x, y, radius, fillColor, setStrokeStyle: vi.fn(), destroy: vi.fn() };
      createdCircles.push(circle);
      return circle;
    }),
    graphics: vi.fn(() => {
      const graphics = {
        setDepth: vi.fn(),
        clear: vi.fn(),
        lineStyle: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        strokePath: vi.fn(),
        strokeCircle: vi.fn(),
        fillStyle: vi.fn(),
        fillCircle: vi.fn(),
      };
      createdGraphics.push(graphics);
      return graphics;
    }),
    container: vi.fn((x: number, y: number) => {
      const container = {
        x,
        y,
        children: [] as unknown[],
        setDepth: vi.fn(),
        setVisible: vi.fn(),
        add: vi.fn((children: unknown[] | unknown) => {
          container.children.push(...(Array.isArray(children) ? children : [children]));
          return container;
        }),
        destroy: vi.fn(),
      };
      createdContainers.push(container);
      createdLayers.push(container);
      return container;
    }),
  };
  sceneWithDoubles.load = {
    image: vi.fn(),
    spritesheet: vi.fn(),
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
      width: 100,
      height: 100,
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
    add: vi.fn((config: { targets: { zoom?: number; x?: number; y?: number }; zoom?: number; x?: number; y?: number; onUpdate?: () => void; onComplete?: () => void }) => {
      if (!options.holdTweens) {
        if (typeof config.zoom === "number") {
          config.targets.zoom = config.zoom;
        }
        if (typeof config.x === "number") {
          config.targets.x = config.x;
        }
        if (typeof config.y === "number") {
          config.targets.y = config.y;
        }
        config.onUpdate?.();
        config.onComplete?.();
      }
      return config;
    }),
    killTweensOf: vi.fn(),
  };
  sceneWithDoubles.time = {
    delayedCall: vi.fn((_delay: number, callback: () => void) => {
      const delayedCall = { callback, remove: vi.fn(), destroy: vi.fn() };
      pendingDelayedCalls.push(delayedCall);
      return delayedCall;
    }),
  };
  sceneWithDoubles.inputHandlers = inputHandlers;
  sceneWithDoubles.createdRectangles = createdRectangles;
  sceneWithDoubles.createdSprites = createdSprites;
  sceneWithDoubles.createdTexts = createdTexts;
  sceneWithDoubles.createdCircles = createdCircles;
  sceneWithDoubles.createdContainers = createdContainers;
  sceneWithDoubles.createdGraphics = createdGraphics;
  sceneWithDoubles.createdLayers = createdLayers;
  sceneWithDoubles.pendingDelayedCalls = pendingDelayedCalls;
  return sceneWithDoubles;
}
