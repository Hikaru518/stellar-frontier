import { useEffect, useRef, type CSSProperties, type MutableRefObject } from "react";
import { createMapSceneClass } from "./MapScene";
import { TILE_GAP, TILE_SIZE, type PhaserCrewMarkerView, type PhaserMapTileView } from "./mapView";

export const MAP_SCENE_KEY = "MapScene";
export const PHASER_MAP_VIEW_WIDTH = 980;
export const PHASER_MAP_VIEW_HEIGHT = 620;

export interface PhaserMapCanvasProps {
  columns: number;
  tileViews: PhaserMapTileView[];
  crewMarkers: PhaserCrewMarkerView[];
  onSelectTile: (tileId: string) => void;
  setZoomLevelInReact?: (zoomLevel: number) => void;
  gameFactory?: PhaserGameFactory;
}

export interface PhaserMapSceneState {
  columns: number;
  tileViews: PhaserMapTileView[];
  crewMarkers: PhaserCrewMarkerView[];
  onSelectTile: (tileId: string) => void;
  setZoomLevelInReact: (zoomLevel: number) => void;
}

export interface PhaserGameLike {
  destroy: (removeCanvas?: boolean) => void;
  scale?: {
    resize?: (width: number, height: number) => void;
  };
  scene?: {
    getScene?: (key: string) => unknown;
  };
}

export type PhaserGameFactory = (config: Record<string, unknown>) => PhaserGameLike;

interface MapSceneLike {
  updateState?: (state: PhaserMapSceneState) => void;
}

interface PhaserModuleLike {
  AUTO: unknown;
  Scene: new (config: { key: string }) => object;
}

interface MapViewportSize {
  width: number;
  height: number;
}

export function PhaserMapCanvas(props: PhaserMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<PhaserGameLike | null>(null);
  const previousSizeRef = useRef<MapViewportSize | null>(null);
  const stateRef = useRef<PhaserMapSceneState>(createSceneState(props));
  stateRef.current = createSceneState(props);

  useEffect(() => {
    if (import.meta.env.MODE === "test") {
      return undefined;
    }

    let cancelled = false;

    async function createGame() {
      const parent = stageRef.current;
      if (!parent) {
        return;
      }

      const Phaser = await import("phaser");
      if (cancelled) {
        return;
      }

      const factory =
        props.gameFactory ??
        ((config: Record<string, unknown>) => new Phaser.Game(config as ConstructorParameters<typeof Phaser.Game>[0]) as PhaserGameLike);

      gameRef.current = factory(createMapGameConfig(Phaser, parent, stateRef));
      notifyMapSceneState(gameRef.current, stateRef.current);
    }

    void createGame();

    return () => {
      cancelled = true;
      if (gameRef.current) {
        destroyPhaserGame(gameRef.current);
        gameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    notifyMapSceneState(gameRef.current, stateRef.current);
  }, [props.columns, props.tileViews, props.crewMarkers, props.onSelectTile, props.setZoomLevelInReact]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    let frameId: number | null = null;
    const resize = (width: number, height: number) => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (gameRef.current) {
          resizePhaserGame(gameRef.current, { width, height }, previousSizeRef);
        }
      });
    };
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = entry?.contentRect.width ?? stage.clientWidth;
      const height = entry?.contentRect.height ?? stage.clientHeight;
      resize(width, height);
    });

    observer.observe(stage);

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="phaser-map-canvas">
      <div ref={stageRef} className="phaser-map-stage" />
      <div className="phaser-map-fallback" style={fallbackStyle} aria-label="地图语义层">
        {props.tileViews.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className="phaser-map-fallback-tile"
            style={getFallbackTileStyle(tile)}
            aria-label={[...tile.semanticLines, tile.tooltip].filter(Boolean).join(" | ")}
            data-tile-id={tile.id}
            data-selected={tile.isSelected ? "true" : undefined}
            onClick={() => props.onSelectTile(tile.id)}
          >
            <span>{tile.semanticLines.join(" ")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function createSceneState(props: PhaserMapCanvasProps): PhaserMapSceneState {
  return {
    columns: props.columns,
    tileViews: props.tileViews,
    crewMarkers: props.crewMarkers,
    onSelectTile: props.onSelectTile,
    setZoomLevelInReact: props.setZoomLevelInReact ?? noopSetZoomLevelInReact,
  };
}

export function createMapGameConfig(
  Phaser: PhaserModuleLike,
  parent: HTMLElement,
  stateRef: MutableRefObject<PhaserMapSceneState> | { current: PhaserMapSceneState },
): Record<string, unknown> {
  return {
    type: Phaser.AUTO,
    width: PHASER_MAP_VIEW_WIDTH,
    height: PHASER_MAP_VIEW_HEIGHT,
    antialias: false,
    pixelArt: true,
    backgroundColor: "#77736b",
    parent,
    scene: createMapSceneClass(Phaser, stateRef),
  };
}

export function resizePhaserGame(
  game: PhaserGameLike,
  nextSize: MapViewportSize,
  previousSizeRef: MutableRefObject<MapViewportSize | null> | { current: MapViewportSize | null },
): boolean {
  const width = Math.round(nextSize.width);
  const height = Math.round(nextSize.height);
  if (width <= 0 || height <= 0) {
    return false;
  }

  const previousSize = previousSizeRef.current;
  if (previousSize?.width === width && previousSize.height === height) {
    return false;
  }

  previousSizeRef.current = { width, height };
  game.scale?.resize?.(width, height);
  return true;
}

export function destroyPhaserGame(game: PhaserGameLike) {
  game.destroy(true);
}

export function notifyMapSceneState(game: PhaserGameLike | null, nextState: PhaserMapSceneState, previousState?: PhaserMapSceneState) {
  if (
    previousState &&
    previousState.columns === nextState.columns &&
    previousState.tileViews === nextState.tileViews &&
    previousState.crewMarkers === nextState.crewMarkers &&
    previousState.onSelectTile === nextState.onSelectTile &&
    previousState.setZoomLevelInReact === nextState.setZoomLevelInReact
  ) {
    return;
  }

  const scene = game?.scene?.getScene?.(MAP_SCENE_KEY) as MapSceneLike | null | undefined;
  scene?.updateState?.(nextState);
}

function getFallbackTileStyle(tile: PhaserMapTileView) {
  return {
    position: "absolute",
    left: tile.col * (TILE_SIZE + TILE_GAP),
    top: tile.row * (TILE_SIZE + TILE_GAP),
    width: TILE_SIZE,
    height: TILE_SIZE,
    opacity: 0,
  } satisfies CSSProperties;
}

const fallbackStyle = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
} satisfies CSSProperties;

function noopSetZoomLevelInReact() {
  // Optional bridge for TASK-004 zoom integration.
}
