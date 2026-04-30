import tilesetRegistryContent from "../../../../content/maps/tilesets/registry.json";
import type { PhaserMapSceneState } from "./PhaserMapCanvas";
import { TILE_GAP, TILE_SIZE, type PhaserMapTileView } from "./mapView";

interface SceneStateRef {
  current: PhaserMapSceneState;
}

interface TilesetRegistry {
  tilesets: Array<{
    key?: string;
    url?: string;
    imageUrl?: string;
    assetUrl?: string;
  }>;
}

const MAP_SCENE_KEY = "MapScene";
const TERRAIN_DEPTH = 1;
const DETAIL_DEPTH = 3;
const GRID_DEPTH = 4;
const TOOLTIP_BACKGROUND_DEPTH = 30;
const TOOLTIP_TEXT_DEPTH = 31;
const POPUP_BACKGROUND_DEPTH = 30;
const POPUP_TEXT_DEPTH = 31;
const HOVER_DELAY_MS = 500;
export const ZOOM_LEVELS = [0.35, 0.7, 1.5, 3.0] as const;
export const INITIAL_ZOOM_LEVEL_INDEX = 1;
export const ZOOM_TWEEN_DURATION_MS = 350;
export const LOD_DETAIL_THRESHOLD = 0.9;
export const LOD_GRID_THRESHOLD = 1.2;
const KEYBOARD_PAN_SPEED = 400;
const tilesetRegistry = tilesetRegistryContent as TilesetRegistry;

interface TerrainObject {
  setOrigin: (x: number, y: number) => TerrainObject;
  setDepth: (depth: number) => TerrainObject;
  setAlpha?: (alpha: number) => TerrainObject;
  setStrokeStyle?: (lineWidth: number, color: number) => TerrainObject;
  destroy: () => void;
}

interface TextObject {
  setOrigin: (x: number, y: number) => TextObject;
  setDepth: (depth: number) => TextObject;
  destroy: () => void;
}

interface TimerEventLike {
  remove?: (dispatchCallback?: boolean) => void;
  destroy?: () => void;
}

interface LayerHolder {
  setDepth?: (depth: number) => LayerHolder;
  setVisible: (visible: boolean) => LayerHolder;
}

interface PointerLike {
  x: number;
  y: number;
  button?: number;
  worldX?: number;
  worldY?: number;
}

interface KeyLike {
  isDown?: boolean;
}

interface PanKeys {
  W?: KeyLike;
  A?: KeyLike;
  S?: KeyLike;
  D?: KeyLike;
  UP?: KeyLike;
  DOWN?: KeyLike;
}

interface MapSceneRuntime {
  stateRef: SceneStateRef;
  terrainObjects: TerrainObject[];
  add: {
    rectangle: (x: number, y: number, width: number, height: number, fillColor: number) => TerrainObject;
    text?: (x: number, y: number, text: string, style?: Record<string, unknown>) => TextObject;
    container?: (x: number, y: number) => LayerHolder;
  };
  cameras: {
    main: {
      setBounds: (x: number, y: number, width: number, height: number) => void;
      centerOn: (x: number, y: number) => void;
      setZoom?: (zoom: number) => unknown;
      zoom: number;
      scrollX: number;
      scrollY: number;
    };
  };
  input?: {
    on: (eventName: string, handler: (...args: unknown[]) => void) => void;
    mouse?: {
      disableContextMenu?: () => void;
    };
    keyboard?: {
      addKeys?: (keys: string) => PanKeys;
    };
  };
  tweens?: {
    add: (config: {
      targets: { zoom: number };
      zoom: number;
      duration: number;
      ease: string;
      onUpdate?: () => void;
      onComplete?: () => void;
    }) => unknown;
  };
  time?: {
    delayedCall?: (delay: number, callback: () => void) => TimerEventLike;
  };
  load?: {
    image: (key: string, url: string) => void;
  };
  zoomLevelIndex?: number;
  isZooming?: boolean;
  dragStart?: { pointerX: number; pointerY: number; scrollX: number; scrollY: number } | null;
  panKeys?: PanKeys;
  detailLayer?: LayerHolder;
  gridLineLayer?: LayerHolder;
  hoverTimer?: TimerEventLike | null;
  tooltipObjects?: Array<TerrainObject | TextObject>;
  popupObjects?: Array<TerrainObject | TextObject>;
  getState: () => PhaserMapSceneState;
  updateState: (nextState: PhaserMapSceneState) => void;
}

type MapSceneExtension = Pick<MapSceneRuntime, "stateRef" | "terrainObjects" | "getState" | "updateState">;

export class MapScene {
  readonly key = MAP_SCENE_KEY;
  readonly extend: MapSceneExtension;
  terrainObjects: TerrainObject[] = [];

  constructor(readonly stateRef: SceneStateRef) {
    this.extend = {
      stateRef: this.stateRef,
      terrainObjects: [],
      getState: this.getState,
      updateState: this.updateState,
    };
  }

  preload(this: MapSceneRuntime): void {
    for (const tileset of tilesetRegistry.tilesets) {
      const assetUrl = tileset.assetUrl ?? tileset.imageUrl ?? tileset.url;
      if (tileset.key && assetUrl) {
        this.load?.image(tileset.key, assetUrl);
      }
    }
  }

  create(this: MapSceneRuntime): void {
    initializeCameraInteractionState(this);
    this.updateState(this.stateRef.current);
    setupCameraInteractions(this);
  }

  update(this: MapSceneRuntime, _time: number, delta: number): void {
    panCameraWithKeyboard(this, delta);
  }

  getState(this: MapScene | MapSceneRuntime): PhaserMapSceneState {
    return this.stateRef.current;
  }

  updateState(this: MapScene | MapSceneRuntime, nextState: PhaserMapSceneState): void {
    const runtime = this as unknown as MapSceneRuntime;
    runtime.stateRef.current = nextState;
    initializeCameraInteractionState(runtime);
    hideTooltip(runtime);
    hideInlinePopup(runtime);
    redrawTerrain(runtime, nextState);
    configureCamera(runtime, nextState);
    syncZoomBridge(runtime);
  }
}

function initializeCameraInteractionState(scene: MapSceneRuntime): void {
  scene.zoomLevelIndex ??= INITIAL_ZOOM_LEVEL_INDEX;
  scene.isZooming ??= false;
  scene.dragStart ??= null;
  scene.cameras.main.zoom = ZOOM_LEVELS[scene.zoomLevelIndex];
  scene.cameras.main.setZoom?.(ZOOM_LEVELS[scene.zoomLevelIndex]);
  scene.detailLayer ??= createLayerHolder(scene, DETAIL_DEPTH);
  scene.gridLineLayer ??= createLayerHolder(scene, GRID_DEPTH);
  scene.tooltipObjects ??= [];
  scene.popupObjects ??= [];
  updateLodVisibility(scene);
}

function createLayerHolder(scene: MapSceneRuntime, depth: number): LayerHolder {
  const layer = scene.add.container?.(0, 0) ?? createEmptyLayerHolder();
  layer.setDepth?.(depth);
  return layer;
}

function createEmptyLayerHolder(): LayerHolder {
  return {
    setVisible: () => createEmptyLayerHolder(),
  };
}

function setupCameraInteractions(scene: MapSceneRuntime): void {
  scene.input?.mouse?.disableContextMenu?.();
  scene.panKeys = scene.input?.keyboard?.addKeys?.("W,A,S,D,UP,DOWN") ?? scene.panKeys ?? {};
  scene.input?.on("wheel", (pointer: unknown, _gameObjects: unknown, _deltaX: unknown, deltaY: unknown) => {
    const pointerLike = normalizePointer(pointer);
    if (typeof deltaY === "number") {
      zoomByDirection(scene, deltaY < 0 ? 1 : -1, pointerLike);
    }
  });
  scene.input?.on("pointerdown", (pointer: unknown) => {
    const pointerLike = normalizePointer(pointer);
    hideTooltip(scene);
    if (pointerLike.button !== 2) {
      if (pointerLike.button === 0 || pointerLike.button === undefined) {
        selectTileAtPointer(scene, pointerLike);
      }
      return;
    }
    scene.dragStart = {
      pointerX: pointerLike.x,
      pointerY: pointerLike.y,
      scrollX: scene.cameras.main.scrollX,
      scrollY: scene.cameras.main.scrollY,
    };
  });
  scene.input?.on("pointermove", (pointer: unknown) => {
    const pointerLike = normalizePointer(pointer);
    hideTooltip(scene);
    if (!scene.dragStart) {
      if (pointerLike.button !== 2) {
        scheduleTooltipAtPointer(scene, pointerLike);
      }
      return;
    }
    const zoom = scene.cameras.main.zoom || 1;
    scene.cameras.main.scrollX = scene.dragStart.scrollX - (pointerLike.x - scene.dragStart.pointerX) / zoom;
    scene.cameras.main.scrollY = scene.dragStart.scrollY - (pointerLike.y - scene.dragStart.pointerY) / zoom;
  });
  scene.input?.on("pointerup", (pointer: unknown) => {
    const pointerLike = normalizePointer(pointer);
    if (pointerLike.button === 2 || scene.dragStart) {
      scene.dragStart = null;
    }
  });
}

function normalizePointer(pointer: unknown): PointerLike {
  const candidate = pointer as Partial<PointerLike> | undefined;
  return {
    x: typeof candidate?.x === "number" ? candidate.x : 0,
    y: typeof candidate?.y === "number" ? candidate.y : 0,
    button: candidate?.button,
    worldX: typeof candidate?.worldX === "number" ? candidate.worldX : undefined,
    worldY: typeof candidate?.worldY === "number" ? candidate.worldY : undefined,
  };
}

function scheduleTooltipAtPointer(scene: MapSceneRuntime, pointer: PointerLike): void {
  const tile = findTileAtPointer(scene, pointer);
  if (!tile || tile.status !== "discovered") {
    return;
  }
  scene.hoverTimer = scene.time?.delayedCall?.(HOVER_DELAY_MS, () => {
    showTooltip(scene, tile, pointer);
  }) ?? null;
}

function selectTileAtPointer(scene: MapSceneRuntime, pointer: PointerLike): void {
  const tile = findTileAtPointer(scene, pointer);
  if (!tile) {
    hideInlinePopup(scene);
    return;
  }
  scene.stateRef.current.onSelectTile(tile.id);
  showInlinePopup(scene, tile, pointer);
}

function findTileAtPointer(scene: MapSceneRuntime, pointer: PointerLike): PhaserMapTileView | null {
  const world = getPointerWorldPosition(scene, pointer);
  const step = TILE_SIZE + TILE_GAP;
  const col = Math.floor(world.x / step);
  const row = Math.floor(world.y / step);
  const localX = world.x - col * step;
  const localY = world.y - row * step;
  if (col < 0 || row < 0 || localX < 0 || localY < 0 || localX >= TILE_SIZE || localY >= TILE_SIZE) {
    return null;
  }
  return scene.stateRef.current.tileViews.find((tile) => tile.row === row && tile.col === col) ?? null;
}

function getPointerWorldPosition(scene: MapSceneRuntime, pointer: PointerLike): { x: number; y: number } {
  const camera = scene.cameras.main;
  return {
    x: pointer.worldX ?? camera.scrollX + pointer.x / (camera.zoom || 1),
    y: pointer.worldY ?? camera.scrollY + pointer.y / (camera.zoom || 1),
  };
}

function showTooltip(scene: MapSceneRuntime, tile: PhaserMapTileView, pointer: PointerLike): void {
  hideTooltip(scene);
  const position = getPointerWorldPosition(scene, pointer);
  scene.tooltipObjects = createFloatingTextBox(scene, position.x + 14, position.y + 14, [tile.tooltip], TOOLTIP_BACKGROUND_DEPTH, TOOLTIP_TEXT_DEPTH);
}

function showInlinePopup(scene: MapSceneRuntime, tile: PhaserMapTileView, pointer: PointerLike): void {
  hideInlinePopup(scene);
  const position = getPointerWorldPosition(scene, pointer);
  const lines = [tile.terrain, tile.label || tile.tooltip, "前往此位置"].filter(Boolean) as string[];
  scene.popupObjects = createFloatingTextBox(scene, position.x + 16, position.y + 16, lines, POPUP_BACKGROUND_DEPTH, POPUP_TEXT_DEPTH);
}

function createFloatingTextBox(scene: MapSceneRuntime, x: number, y: number, lines: string[], backgroundDepth: number, textDepth: number): Array<TerrainObject | TextObject> {
  const textObjects: TextObject[] = [];
  const longestLineLength = Math.max(1, ...lines.map((line) => Array.from(line).length));
  const backgroundWidth = Math.max(140, longestLineLength * 12 + 24);
  const backgroundHeight = lines.length * 24 + 20;
  const background = scene.add.rectangle(x, y, backgroundWidth, backgroundHeight, 0xf4eadf);
  background.setOrigin(0, 0);
  background.setDepth(backgroundDepth);
  background.setAlpha?.(0.96);
  background.setStrokeStyle?.(1, 0x24384f);

  for (const [index, line] of lines.entries()) {
    const text = scene.add.text?.(x + 12, y + 10 + index * 24, line, {
      color: "#24384f",
      fontFamily: "monospace",
      fontSize: "14px",
    });
    if (text) {
      text.setOrigin(0, 0);
      text.setDepth(textDepth);
      textObjects.push(text);
    }
  }

  return [background, ...textObjects];
}

function hideTooltip(scene: MapSceneRuntime): void {
  cancelHoverTimer(scene);
  destroyObjects(scene.tooltipObjects);
  scene.tooltipObjects = [];
}

function hideInlinePopup(scene: MapSceneRuntime): void {
  destroyObjects(scene.popupObjects);
  scene.popupObjects = [];
}

function cancelHoverTimer(scene: MapSceneRuntime): void {
  if (!scene.hoverTimer) {
    return;
  }
  if (scene.hoverTimer.remove) {
    scene.hoverTimer.remove(false);
  } else {
    scene.hoverTimer.destroy?.();
  }
  scene.hoverTimer = null;
}

function destroyObjects(objects: Array<TerrainObject | TextObject> | undefined): void {
  for (const object of objects ?? []) {
    object.destroy();
  }
}

function zoomByDirection(scene: MapSceneRuntime, direction: 1 | -1, pointer?: PointerLike): void {
  if (scene.isZooming) {
    return;
  }
  const currentIndex = scene.zoomLevelIndex ?? INITIAL_ZOOM_LEVEL_INDEX;
  const nextIndex = clampZoomLevelIndex(currentIndex + direction);
  if (nextIndex === currentIndex) {
    syncZoomBridge(scene);
    return;
  }

  scene.zoomLevelIndex = nextIndex;
  scene.isZooming = true;
  syncZoomBridge(scene);

  const camera = scene.cameras.main;
  const anchor = pointer
    ? {
        pointerX: pointer.x,
        pointerY: pointer.y,
        worldX: camera.scrollX + pointer.x / camera.zoom,
        worldY: camera.scrollY + pointer.y / camera.zoom,
      }
    : null;

  scene.tweens?.add({
    targets: camera,
    zoom: ZOOM_LEVELS[nextIndex],
    duration: ZOOM_TWEEN_DURATION_MS,
    ease: "Cubic.easeInOut",
    onUpdate: () => {
      if (anchor) {
        camera.scrollX = anchor.worldX - anchor.pointerX / camera.zoom;
        camera.scrollY = anchor.worldY - anchor.pointerY / camera.zoom;
      }
      updateLodVisibility(scene);
    },
    onComplete: () => {
      camera.zoom = ZOOM_LEVELS[nextIndex];
      updateLodVisibility(scene);
      scene.isZooming = false;
    },
  });
}

function clampZoomLevelIndex(index: number): number {
  return Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index));
}

function syncZoomBridge(scene: MapSceneRuntime): void {
  const zoomLevelIndex = scene.zoomLevelIndex ?? INITIAL_ZOOM_LEVEL_INDEX;
  scene.stateRef.current.setZoomLevelInReact(zoomLevelIndex);
  document.querySelector(".phaser-map-stage")?.setAttribute("data-zoom-level", String(zoomLevelIndex));
}

function updateLodVisibility(scene: MapSceneRuntime): void {
  const zoom = scene.cameras.main.zoom;
  scene.detailLayer?.setVisible(zoom >= LOD_DETAIL_THRESHOLD);
  scene.gridLineLayer?.setVisible(zoom >= LOD_GRID_THRESHOLD);
}

function panCameraWithKeyboard(scene: MapSceneRuntime, delta: number): void {
  const keys = scene.panKeys;
  if (!keys) {
    return;
  }
  const zoom = scene.cameras.main.zoom || 1;
  const worldSpeed = (KEYBOARD_PAN_SPEED * delta) / (1000 * zoom);
  if (keys.A?.isDown) {
    scene.cameras.main.scrollX -= worldSpeed;
  }
  if (keys.D?.isDown) {
    scene.cameras.main.scrollX += worldSpeed;
  }
  if (keys.W?.isDown) {
    scene.cameras.main.scrollY -= worldSpeed;
  }
  if (keys.S?.isDown) {
    scene.cameras.main.scrollY += worldSpeed;
  }
  if (keys.UP?.isDown) {
    zoomByDirection(scene, 1);
  }
  if (keys.DOWN?.isDown) {
    zoomByDirection(scene, -1);
  }
}

function redrawTerrain(scene: MapSceneRuntime, state: PhaserMapSceneState): void {
  clearTerrainObjects(scene);

  scene.terrainObjects = state.tileViews.map((tile) => {
    const rectangle = scene.add.rectangle(
      tile.col * (TILE_SIZE + TILE_GAP),
      tile.row * (TILE_SIZE + TILE_GAP),
      TILE_SIZE,
      TILE_SIZE,
      hexColorToNumber(tile.fillColor),
    );
    rectangle.setOrigin(0, 0);
    rectangle.setDepth(TERRAIN_DEPTH);
    return rectangle;
  });
}

function clearTerrainObjects(scene: MapSceneRuntime): void {
  for (const object of scene.terrainObjects) {
    object.destroy();
  }
  scene.terrainObjects = [];
}

function configureCamera(scene: MapSceneRuntime, state: PhaserMapSceneState): void {
  const bounds = getWorldBounds(state.tileViews);
  scene.cameras.main.setBounds(0, 0, bounds.width, bounds.height);
  scene.cameras.main.centerOn(bounds.centerX, bounds.centerY);
}

function getWorldBounds(tileViews: PhaserMapSceneState["tileViews"]): { width: number; height: number; centerX: number; centerY: number } {
  const maxCol = Math.max(0, ...tileViews.map((tile) => tile.col));
  const maxRow = Math.max(0, ...tileViews.map((tile) => tile.row));
  const width = Math.max(1, (maxCol + 1) * (TILE_SIZE + TILE_GAP));
  const height = Math.max(1, (maxRow + 1) * (TILE_SIZE + TILE_GAP));

  return {
    width,
    height,
    centerX: width / 2,
    centerY: height / 2,
  };
}

function hexColorToNumber(color: string): number {
  return Number.parseInt(color.replace(/^#/, ""), 16);
}
