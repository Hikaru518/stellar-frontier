import tilesetRegistryContent from "../../../../content/maps/tilesets/registry.json";
import type { PhaserMapSceneState } from "./PhaserMapCanvas";
import { TILE_GAP, TILE_SIZE, type PhaserCrewMarkerView, type PhaserMapTileView, type Point } from "./mapView";

interface SceneStateRef {
  current: PhaserMapSceneState;
}

interface PhaserSceneModule {
  Scene: new (config: { key: string }) => object;
}

interface TilesetRegistry {
  tilesets: Array<{
    id: string;
    publicPath: string;
    tileWidth: number;
    tileHeight: number;
    spacing?: number;
    margin?: number;
  }>;
}

const MAP_SCENE_KEY = "MapScene";
const TERRAIN_DEPTH = 1;
const DETAIL_DEPTH = 3;
const GRID_DEPTH = 4;
const PATH_DEPTH = 11;
const TRAIL_DEPTH = 12;
const TILE_OVERLAY_DEPTH = 14;
const CREW_MARKER_DEPTH = 20;
export const STEP_DURATION_MS = 250;
export const ZOOM_LEVELS = [0.35, 0.7, 1.5, 3.0] as const;
export const INITIAL_ZOOM_LEVEL_INDEX = 1;
export const ZOOM_TWEEN_DURATION_MS = 350;
export const LOD_DETAIL_THRESHOLD = 0.9;
export const LOD_GRID_THRESHOLD = 1.2;
export const CAMERA_EDGE_PADDING_RATIO = 0.35;
const KEYBOARD_PAN_SPEED = 400;
const VISUAL_TILE_STEP = TILE_SIZE;
const tilesetRegistry = tilesetRegistryContent as TilesetRegistry;
const CREW_MARKER_OFFSETS = [
  { x: 0, y: 0 },
  { x: 18, y: 0 },
  { x: -18, y: 0 },
  { x: 0, y: 18 },
] as const;

interface TerrainObject {
  setOrigin: (x: number, y: number) => TerrainObject;
  setDepth: (depth: number) => TerrainObject;
  setAlpha?: (alpha: number) => TerrainObject;
  setStrokeStyle?: (lineWidth: number, color: number) => TerrainObject;
  setDisplaySize?: (width: number, height: number) => TerrainObject;
  destroy: () => void;
}

interface LayerHolder {
  setDepth?: (depth: number) => LayerHolder;
  setVisible: (visible: boolean) => LayerHolder;
}

interface CircleObject {
  setStrokeStyle?: (lineWidth: number, color: number) => CircleObject;
  destroy?: () => void;
}

interface ContainerObject extends LayerHolder {
  x: number;
  y: number;
  add?: (children: unknown[] | unknown) => ContainerObject;
  destroy?: () => void;
}

interface GraphicsObject {
  setDepth: (depth: number) => GraphicsObject;
  clear: () => GraphicsObject;
  lineStyle: (lineWidth: number, color: number, alpha?: number) => GraphicsObject;
  beginPath?: () => GraphicsObject;
  moveTo: (x: number, y: number) => GraphicsObject;
  lineTo: (x: number, y: number) => GraphicsObject;
  strokePath: () => GraphicsObject;
  strokeCircle?: (x: number, y: number, radius: number) => GraphicsObject;
  fillStyle?: (color: number, alpha?: number) => GraphicsObject;
  fillCircle?: (x: number, y: number, radius: number) => GraphicsObject;
  destroy?: () => void;
}

interface CrewMarkerRuntime {
  container: ContainerObject;
  target: Point;
  targetTileId: string | null;
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
    sprite?: (x: number, y: number, texture: string, frame: number) => TerrainObject;
    circle?: (x: number, y: number, radius: number, fillColor: number) => CircleObject;
    container?: (x: number, y: number) => ContainerObject;
    graphics?: () => GraphicsObject;
  };
  cameras: {
    main: {
      setBounds: (x: number, y: number, width: number, height: number) => void;
      centerOn: (x: number, y: number) => void;
      setZoom?: (zoom: number) => unknown;
      zoom: number;
      scrollX: number;
      scrollY: number;
      width?: number;
      height?: number;
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
      targets: { zoom?: number; x?: number; y?: number };
      zoom?: number;
      x?: number;
      y?: number;
      duration: number;
      ease: string;
      onUpdate?: () => void;
      onComplete?: () => void;
    }) => unknown;
    killTweensOf?: (targets: unknown) => void;
  };
  load?: {
    image: (key: string, url: string) => void;
    spritesheet?: (
      key: string,
      url: string,
      config: { frameWidth: number; frameHeight: number; spacing?: number; margin?: number },
    ) => void;
  };
  zoomLevelIndex?: number;
  isZooming?: boolean;
  dragStart?: { pointerX: number; pointerY: number; scrollX: number; scrollY: number } | null;
  panKeys?: PanKeys;
  detailLayer?: LayerHolder;
  gridLineLayer?: LayerHolder;
  pathGraphics?: GraphicsObject;
  trailGraphics?: GraphicsObject;
  tileOverlayGraphics?: GraphicsObject;
  crewMarkerObjects?: Map<string, CrewMarkerRuntime>;
  crewTrails?: Map<string, Point[]>;
  cameraBoundsKey?: string;
  worldBounds?: { width: number; height: number; centerX: number; centerY: number };
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
      this.load?.spritesheet?.(tileset.id, resolvePublicAssetPath(tileset.publicPath), {
        frameWidth: tileset.tileWidth,
        frameHeight: tileset.tileHeight,
        spacing: tileset.spacing ?? 0,
        margin: tileset.margin ?? 0,
      });
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
    redrawTileOverlays(runtime, nextState);
    redrawRoutePreview(runtime, nextState);
    syncCrewMarkers(runtime, nextState);
    configureCamera(runtime, nextState);
    syncZoomBridge(runtime);
  }
}

export function createMapSceneClass(Phaser: PhaserSceneModule, stateRef: SceneStateRef) {
  return class PhaserMapScene extends Phaser.Scene {
    constructor() {
      super({ key: MAP_SCENE_KEY });
      const runtime = this as unknown as MapSceneRuntime;
      runtime.stateRef = stateRef;
      runtime.terrainObjects = [];
    }

    init(data?: { stateRef?: SceneStateRef }): void {
      const runtime = this as unknown as MapSceneRuntime;
      runtime.stateRef = data?.stateRef ?? stateRef;
      runtime.terrainObjects ??= [];
    }

    preload(): void {
      MapScene.prototype.preload.call(this as unknown as MapSceneRuntime);
    }

    create(): void {
      MapScene.prototype.create.call(this as unknown as MapSceneRuntime);
    }

    update(time: number, delta: number): void {
      MapScene.prototype.update.call(this as unknown as MapSceneRuntime, time, delta);
    }

    getState(): PhaserMapSceneState {
      return MapScene.prototype.getState.call(this as unknown as MapSceneRuntime);
    }

    updateState(nextState: PhaserMapSceneState): void {
      MapScene.prototype.updateState.call(this as unknown as MapSceneRuntime, nextState);
    }
  };
}

function initializeCameraInteractionState(scene: MapSceneRuntime): void {
  scene.zoomLevelIndex ??= INITIAL_ZOOM_LEVEL_INDEX;
  scene.isZooming ??= false;
  scene.dragStart ??= null;
  scene.cameras.main.zoom = ZOOM_LEVELS[scene.zoomLevelIndex];
  scene.cameras.main.setZoom?.(ZOOM_LEVELS[scene.zoomLevelIndex]);
  scene.detailLayer ??= createLayerHolder(scene, DETAIL_DEPTH);
  scene.gridLineLayer ??= createLayerHolder(scene, GRID_DEPTH);
  scene.pathGraphics ??= createGraphics(scene, PATH_DEPTH);
  scene.trailGraphics ??= createGraphics(scene, TRAIL_DEPTH);
  scene.tileOverlayGraphics ??= createGraphics(scene, TILE_OVERLAY_DEPTH);
  scene.crewMarkerObjects ??= new Map<string, CrewMarkerRuntime>();
  scene.crewTrails ??= new Map<string, Point[]>();
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

function createGraphics(scene: MapSceneRuntime, depth: number): GraphicsObject {
  const graphics = scene.add.graphics?.() ?? createEmptyGraphics();
  graphics.setDepth(depth);
  return graphics;
}

function createEmptyGraphics(): GraphicsObject {
  return {
    setDepth: () => createEmptyGraphics(),
    clear: () => createEmptyGraphics(),
    lineStyle: () => createEmptyGraphics(),
    moveTo: () => createEmptyGraphics(),
    lineTo: () => createEmptyGraphics(),
    strokePath: () => createEmptyGraphics(),
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
    if (!scene.dragStart) {
      return;
    }
    const zoom = scene.cameras.main.zoom || 1;
    scene.cameras.main.scrollX = scene.dragStart.scrollX - (pointerLike.x - scene.dragStart.pointerX) / zoom;
    scene.cameras.main.scrollY = scene.dragStart.scrollY - (pointerLike.y - scene.dragStart.pointerY) / zoom;
    clampCameraScroll(scene);
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

function selectTileAtPointer(scene: MapSceneRuntime, pointer: PointerLike): void {
  const tile = findTileAtPointer(scene, pointer);
  if (!tile) {
    return;
  }
  scene.stateRef.current.onSelectTile(tile.id);
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
      clampCameraScroll(scene);
      updateLodVisibility(scene);
    },
    onComplete: () => {
      camera.zoom = ZOOM_LEVELS[nextIndex];
      clampCameraScroll(scene);
      updateLodVisibility(scene);
      scene.isZooming = false;
    },
  });
}

function clampZoomLevelIndex(index: number): number {
  return Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  clampCameraScroll(scene);
}

function redrawTerrain(scene: MapSceneRuntime, state: PhaserMapSceneState): void {
  clearTerrainObjects(scene);

  scene.terrainObjects = state.tileViews.flatMap((tile) => {
    const terrainRectangle = createTerrainRectangle(scene, tile);
    const visualLayers = [...(tile.visualLayers ?? [])].sort((a, b) => a.order - b.order);
    if (visualLayers.length > 0) {
      const addSprite = scene.add.sprite;
      if (!addSprite) {
        return [terrainRectangle];
      }
      const sprites = visualLayers.map((layer) => {
        const sprite = addSprite.call(scene.add, tile.col * VISUAL_TILE_STEP, tile.row * VISUAL_TILE_STEP, layer.tilesetId, layer.tileIndex);
        sprite.setOrigin(0, 0);
        sprite.setDisplaySize?.(TILE_SIZE, TILE_SIZE);
        sprite.setAlpha?.(layer.opacity);
        sprite.setDepth(getVisualLayerDepth(layer.order));
        return sprite;
      });
      return [terrainRectangle, ...sprites];
    }

    return [terrainRectangle];
  });
}

function createTerrainRectangle(scene: MapSceneRuntime, tile: PhaserMapTileView): TerrainObject {
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
}

function getVisualLayerDepth(order: number): number {
  return TERRAIN_DEPTH + 1 + order / 1000;
}

function resolvePublicAssetPath(publicPath: string): string {
  if (/^(?:https?:)?\/\//u.test(publicPath) || publicPath.startsWith("/")) {
    return publicPath;
  }

  const baseUrl = import.meta.env.BASE_URL || "/";
  return `${baseUrl.replace(/\/$/u, "")}/${publicPath.replace(/^\//u, "")}`;
}

function clearTerrainObjects(scene: MapSceneRuntime): void {
  for (const object of scene.terrainObjects) {
    object.destroy();
  }
  scene.terrainObjects = [];
}

function redrawTileOverlays(scene: MapSceneRuntime, state: PhaserMapSceneState): void {
  const graphics = scene.tileOverlayGraphics;
  if (!graphics) {
    return;
  }

  graphics.clear();
  for (const tile of state.tileViews) {
    if (tile.isTarget) {
      strokeTileFrame(graphics, tile, 3, 0x24384f, 0.95);
    }
    if (tile.isSelected) {
      strokeTileFrame(graphics, tile, 4, 0xb45b13, 1);
    }
  }
}

function strokeTileFrame(graphics: GraphicsObject, tile: PhaserMapTileView, lineWidth: number, color: number, alpha: number): void {
  const inset = lineWidth / 2;
  const x = tile.col * (TILE_SIZE + TILE_GAP) + inset;
  const y = tile.row * (TILE_SIZE + TILE_GAP) + inset;
  const width = TILE_SIZE - lineWidth;
  const height = TILE_SIZE - lineWidth;
  graphics.lineStyle(lineWidth, color, alpha);
  graphics.beginPath?.();
  graphics.moveTo(x, y);
  graphics.lineTo(x + width, y);
  graphics.lineTo(x + width, y + height);
  graphics.lineTo(x, y + height);
  graphics.lineTo(x, y);
  graphics.strokePath();
}

function redrawRoutePreview(scene: MapSceneRuntime, state: PhaserMapSceneState): void {
  const graphics = scene.pathGraphics;
  if (!graphics) {
    return;
  }

  graphics.clear();
  const routePoints = state.tileViews.filter((tile) => tile.isRoute).map(getTileCenter);
  if (routePoints.length < 2) {
    return;
  }

  graphics.lineStyle(2, 0x90b0c8, 0.55);
  graphics.beginPath?.();
  graphics.moveTo(routePoints[0].x, routePoints[0].y);
  for (const point of routePoints.slice(1)) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.strokePath();
}

function syncCrewMarkers(scene: MapSceneRuntime, state: PhaserMapSceneState): void {
  const markerObjects = scene.crewMarkerObjects ?? new Map<string, CrewMarkerRuntime>();
  scene.crewMarkerObjects = markerObjects;
  scene.crewTrails ??= new Map<string, Point[]>();

  const targetMarkers = applySameTileOffsets(state.crewMarkers, state.tileViews);
  const incomingCrewIds = new Set(targetMarkers.map((marker) => marker.crewId));

  for (const [crewId, markerRuntime] of markerObjects.entries()) {
    if (!incomingCrewIds.has(crewId)) {
      scene.tweens?.killTweensOf?.(markerRuntime.container);
      markerRuntime.container.destroy?.();
      markerObjects.delete(crewId);
      scene.crewTrails.delete(crewId);
    }
  }

  for (const marker of targetMarkers) {
    const existing = markerObjects.get(marker.crewId);
    if (!existing) {
      const container = createCrewMarkerContainer(scene, marker);
      const targetTileId = findNearestTileId(marker.rawTarget, state.tileViews);
      markerObjects.set(marker.crewId, { container, target: { x: marker.x, y: marker.y }, targetTileId });
      scene.crewTrails.set(marker.crewId, [{ x: marker.x, y: marker.y }]);
      writeCharacterTileBridge(targetTileId);
      continue;
    }

    const nextTarget = { x: marker.x, y: marker.y };
    const targetChanged = existing.target.x !== nextTarget.x || existing.target.y !== nextTarget.y;
    const nextTargetTileId = findNearestTileId(marker.rawTarget, state.tileViews);
    if (!targetChanged) {
      existing.targetTileId = nextTargetTileId;
      writeCharacterTileBridge(nextTargetTileId);
      continue;
    }

    scene.tweens?.killTweensOf?.(existing.container);
    existing.target = nextTarget;
    existing.targetTileId = nextTargetTileId;
    scene.tweens?.add({
      targets: existing.container,
      x: nextTarget.x,
      y: nextTarget.y,
      duration: STEP_DURATION_MS,
      ease: "Linear",
      onComplete: () => {
        appendTrailPoint(scene, marker.crewId, nextTarget);
        refreshTrail(scene);
        writeCharacterTileBridge(nextTargetTileId);
      },
    });
  }
}

function createCrewMarkerContainer(scene: MapSceneRuntime, marker: PhaserCrewMarkerView): ContainerObject {
  const container = scene.add.container?.(marker.x, marker.y) ?? createEmptyContainer(marker.x, marker.y);
  container.setDepth?.(CREW_MARKER_DEPTH);
  const body = scene.add.circle?.(0, 3, 8, 0x24384f);
  const head = scene.add.circle?.(0, -9, 6, 0xf4eadf);
  head?.setStrokeStyle?.(2, 0x24384f);
  container.add?.([body, head].filter(Boolean));
  return container;
}

function createEmptyContainer(x: number, y: number): ContainerObject {
  return {
    x,
    y,
    setVisible: () => createEmptyContainer(x, y),
    setDepth: () => createEmptyContainer(x, y),
  };
}

function appendTrailPoint(scene: MapSceneRuntime, crewId: string, point: Point): void {
  const trails = scene.crewTrails ?? new Map<string, Point[]>();
  scene.crewTrails = trails;
  const trail = trails.get(crewId) ?? [];
  const lastPoint = trail[trail.length - 1];
  if (!lastPoint || lastPoint.x !== point.x || lastPoint.y !== point.y) {
    trail.push(point);
  }
  trails.set(crewId, trail);
}

function refreshTrail(scene: MapSceneRuntime): void {
  const graphics = scene.trailGraphics;
  if (!graphics) {
    return;
  }

  graphics.clear();
  for (const trail of scene.crewTrails?.values() ?? []) {
    if (trail.length < 2) {
      continue;
    }
    graphics.lineStyle(4, 0xb45b13, 0.9);
    graphics.beginPath?.();
    graphics.moveTo(trail[0].x, trail[0].y);
    for (const point of trail.slice(1)) {
      graphics.lineTo(point.x, point.y);
    }
    graphics.strokePath();
    for (const point of trail) {
      graphics.strokeCircle?.(point.x, point.y, 3);
    }
  }
}

function applySameTileOffsets(
  markers: PhaserCrewMarkerView[],
  tileViews: PhaserMapTileView[],
): Array<PhaserCrewMarkerView & { rawTarget: Point }> {
  const groups = new Map<string, PhaserCrewMarkerView[]>();
  for (const marker of markers) {
    const tileId = findNearestTileId(marker, tileViews) ?? `${marker.x},${marker.y}`;
    groups.set(tileId, [...(groups.get(tileId) ?? []), marker]);
  }

  const adjustedMarkers: Array<PhaserCrewMarkerView & { rawTarget: Point }> = [];
  for (const group of groups.values()) {
    const positionCounts = new Map<string, number>();
    for (const marker of group) {
      const positionKey = `${Math.round(marker.x)},${Math.round(marker.y)}`;
      const offsetIndex = positionCounts.get(positionKey) ?? 0;
      positionCounts.set(positionKey, offsetIndex + 1);
      const offset = CREW_MARKER_OFFSETS[offsetIndex % CREW_MARKER_OFFSETS.length];
      adjustedMarkers.push({ ...marker, rawTarget: { x: marker.x, y: marker.y }, x: marker.x + offset.x, y: marker.y + offset.y });
    }
  }
  return adjustedMarkers;
}

function getTileCenter(tile: PhaserMapTileView): Point {
  return {
    x: tile.col * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
    y: tile.row * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
  };
}

function findNearestTileId(point: Point, tileViews: PhaserMapTileView[]): string | null {
  let nearest: { id: string; distance: number } | null = null;
  for (const tile of tileViews) {
    const center = getTileCenter(tile);
    const distance = (center.x - point.x) ** 2 + (center.y - point.y) ** 2;
    if (!nearest || distance < nearest.distance) {
      nearest = { id: tile.id, distance };
    }
  }
  return nearest?.id ?? null;
}

function writeCharacterTileBridge(tileId: string | null): void {
  if (tileId) {
    document.querySelector(".phaser-map-stage")?.setAttribute("data-char-tile", tileId);
  }
}

function configureCamera(scene: MapSceneRuntime, state: PhaserMapSceneState): void {
  const bounds = getWorldBounds(state.tileViews);
  scene.worldBounds = bounds;
  const boundsKey = `${bounds.width}x${bounds.height}`;
  if (scene.cameraBoundsKey === boundsKey) {
    clampCameraScroll(scene);
    return;
  }
  scene.cameraBoundsKey = boundsKey;
  scene.cameras.main.setBounds(0, 0, bounds.width, bounds.height);
  scene.cameras.main.centerOn(bounds.centerX, bounds.centerY);
}

function clampCameraScroll(scene: MapSceneRuntime): void {
  const bounds = scene.worldBounds;
  if (!bounds) {
    return;
  }

  const camera = scene.cameras.main;
  const zoom = camera.zoom || 1;
  const viewWidth = typeof camera.width === "number" && camera.width > 0 ? camera.width / zoom : 0;
  const viewHeight = typeof camera.height === "number" && camera.height > 0 ? camera.height / zoom : 0;
  const xLimits = getScrollLimits(bounds.width, viewWidth);
  const yLimits = getScrollLimits(bounds.height, viewHeight);
  camera.scrollX = clamp(camera.scrollX, xLimits.min, xLimits.max);
  camera.scrollY = clamp(camera.scrollY, yLimits.min, yLimits.max);
}

function getScrollLimits(worldSize: number, viewSize: number): { min: number; max: number } {
  if (viewSize <= 0) {
    return { min: 0, max: worldSize };
  }

  if (worldSize <= viewSize) {
    const centered = (worldSize - viewSize) / 2;
    return { min: centered, max: centered };
  }

  const edgePadding = Math.min(TILE_SIZE, viewSize * CAMERA_EDGE_PADDING_RATIO);
  return { min: -edgePadding, max: worldSize - viewSize + edgePadding };
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
