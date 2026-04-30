import tilesetRegistryContent from "../../../../content/maps/tilesets/registry.json";
import type { PhaserMapSceneState } from "./PhaserMapCanvas";
import { TILE_GAP, TILE_SIZE } from "./mapView";

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
  destroy: () => void;
}

interface LayerHolder {
  setDepth?: (depth: number) => LayerHolder;
  setVisible: (visible: boolean) => LayerHolder;
}

interface PointerLike {
  x: number;
  y: number;
  button?: number;
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
  load?: {
    image: (key: string, url: string) => void;
  };
  zoomLevelIndex?: number;
  isZooming?: boolean;
  dragStart?: { pointerX: number; pointerY: number; scrollX: number; scrollY: number } | null;
  panKeys?: PanKeys;
  detailLayer?: LayerHolder;
  gridLineLayer?: LayerHolder;
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
    if (pointerLike.button !== 2) {
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
    if (!scene.dragStart) {
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
  };
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
