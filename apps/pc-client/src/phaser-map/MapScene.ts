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
const tilesetRegistry = tilesetRegistryContent as TilesetRegistry;

interface TerrainObject {
  setOrigin: (x: number, y: number) => TerrainObject;
  setDepth: (depth: number) => TerrainObject;
  destroy: () => void;
}

interface MapSceneRuntime {
  stateRef: SceneStateRef;
  terrainObjects: TerrainObject[];
  add: {
    rectangle: (x: number, y: number, width: number, height: number, fillColor: number) => TerrainObject;
  };
  cameras: {
    main: {
      setBounds: (x: number, y: number, width: number, height: number) => void;
      centerOn: (x: number, y: number) => void;
    };
  };
  load?: {
    image: (key: string, url: string) => void;
  };
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
    this.updateState(this.stateRef.current);
  }

  getState(this: MapScene | MapSceneRuntime): PhaserMapSceneState {
    return this.stateRef.current;
  }

  updateState(this: MapScene | MapSceneRuntime, nextState: PhaserMapSceneState): void {
    const runtime = this as unknown as MapSceneRuntime;
    runtime.stateRef.current = nextState;
    redrawTerrain(runtime, nextState);
    configureCamera(runtime, nextState);
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
