import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from "react";
import { getFeaturesForTile, parseTileId } from "./mapEditorModel";
import type { MapEditorDraft, MapFeatureDefinition, MapTileDefinition } from "./types";

const BASE_VIEW_ROWS = 25;
const BASE_VIEW_COLS = 25;
const MIN_VIEW_ROWS = 6;
const MIN_VIEW_COLS = 6;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.14;

export type MapGridInteractionMode = "pan" | "paint";
export type MapBaseLayerMode = "none" | "radar" | "gameplay";
export interface MapGameplayLayerVisibility {
  terrain: boolean;
  weather: boolean;
}

export const DEFAULT_MAP_GAMEPLAY_LAYER_VISIBILITY: MapGameplayLayerVisibility = {
  terrain: true,
  weather: true,
};

interface TileCenter {
  row: number;
  col: number;
}

interface VisibleRange {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  rowCount: number;
  colCount: number;
}

interface MapGridProps {
  draft: MapEditorDraft;
  selectedTileId: string | null;
  selectedFeatureId: string | null;
  baseLayerMode: MapBaseLayerMode;
  gameplayLayerVisibility?: MapGameplayLayerVisibility;
  featureOverlay?: boolean;
  interactionMode?: MapGridInteractionMode;
  onSelectTile: (tileId: string) => void;
  onTileClick: (tileId: string) => void;
  onTilePointerDown: (tileId: string) => void;
  onTilePointerEnter: (tileId: string) => void;
  onTilePointerUp: (tileId: string) => void;
}

export default function MapGrid({
  draft,
  selectedTileId,
  selectedFeatureId,
  baseLayerMode,
  gameplayLayerVisibility = DEFAULT_MAP_GAMEPLAY_LAYER_VISIBILITY,
  featureOverlay = true,
  interactionMode = "paint",
  onSelectTile,
  onTileClick,
  onTilePointerDown,
  onTilePointerEnter,
  onTilePointerUp,
}: MapGridProps) {
  const isPointerDownRef = useRef(false);
  const lastPointerTileIdRef = useRef<string | null>(null);
  const suppressNextClickRef = useRef(false);
  const previousSelectedTileIdRef = useRef(selectedTileId);
  const panDragRef = useRef<{
    x: number;
    y: number;
    center: TileCenter;
    range: VisibleRange;
    moved: boolean;
  } | null>(null);
  const [center, setCenter] = useState(() => getInitialCenter(draft, selectedTileId));
  const [zoom, setZoom] = useState(1);
  const tileById = useMemo(() => new Map(draft.tiles.map((tile) => [tile.id, tile])), [draft.tiles]);
  const visibleRange = useMemo(() => getVisibleRange(draft, center, zoom), [center, draft, zoom]);

  useEffect(() => {
    setCenter(getInitialCenter(draft, selectedTileId));
    setZoom(1);
  }, [draft.id, draft.originTileId]);

  useEffect(() => {
    if (previousSelectedTileIdRef.current === selectedTileId) {
      return;
    }
    previousSelectedTileIdRef.current = selectedTileId;
    const selectedPoint = selectedTileId ? parseTileId(selectedTileId) : null;
    if (!selectedPoint || isPointInsideRange(selectedPoint, visibleRange)) {
      return;
    }

    setCenter(clampTileCenter(draft, selectedPoint));
  }, [draft, selectedTileId, visibleRange]);

  const visibleTiles = useMemo(() => {
    const tiles: MapTileDefinition[] = [];
    for (let row = visibleRange.rowStart; row <= visibleRange.rowEnd; row += 1) {
      for (let col = visibleRange.colStart; col <= visibleRange.colEnd; col += 1) {
        const tile = tileById.get(`${row}-${col}`);
        if (tile) {
          tiles.push(tile);
        }
      }
    }
    return tiles;
  }, [tileById, visibleRange]);

  return (
    <div className="map-grid-shell">
      <div className="map-grid-window-controls" aria-label="Map grid viewport controls">
        <button type="button" onClick={() => moveWindow(-visibleRange.rowCount, 0)}>
          North
        </button>
        <button type="button" onClick={() => moveWindow(visibleRange.rowCount, 0)}>
          South
        </button>
        <button type="button" onClick={() => moveWindow(0, -visibleRange.colCount)}>
          West
        </button>
        <button type="button" onClick={() => moveWindow(0, visibleRange.colCount)}>
          East
        </button>
        <button type="button" onClick={() => setCenter(getInitialCenter(draft, draft.originTileId))}>
          Origin
        </button>
        <span className="status-tag status-muted">
          rows {visibleRange.rowStart}-{visibleRange.rowEnd} / cols {visibleRange.colStart}-{visibleRange.colEnd}
        </span>
        <span className="status-tag status-muted">{zoom.toFixed(2)}x</span>
        <span className="status-tag status-muted">{interactionMode === "pan" ? "Drag to pan" : "Brush mode"}</span>
        <span className={featureOverlay ? "status-tag status-success" : "status-tag status-muted"}>Features {featureOverlay ? "ON" : "OFF"}</span>
      </div>

      <div
        className={`map-grid-viewport map-grid-viewport-${interactionMode}`}
        aria-label={`${draft.name} grid preview`}
        style={{ "--map-cols": visibleRange.colCount, "--map-rows": visibleRange.rowCount, "--map-zoom": zoom } as CSSProperties}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerUp}
        onPointerLeave={() => finishTileStroke()}
        onWheel={handleWheel}
      >
        {visibleTiles.map((tile) => {
          const tileFeatures = getFeaturesForTile(draft, tile.id);
          const overlayFeatures = getOverlayFeatures(tileFeatures, selectedFeatureId, featureOverlay);
          return (
            <button
              key={tile.id}
              type="button"
              className={getTileClassName(draft, tile, selectedTileId, selectedFeatureId, tileFeatures, overlayFeatures, featureOverlay, baseLayerMode)}
              data-tile-id={tile.id}
              title={formatTileTitle(tile, tileFeatures)}
              aria-label={`Select tile ${tile.id}`}
              aria-pressed={selectedTileId === tile.id}
              onClick={() => {
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false;
                  return;
                }
                onTileClick(tile.id);
              }}
              onPointerDown={(event) => {
                if (interactionMode !== "paint" || (event.button !== 0 && event.pointerType === "mouse")) {
                  return;
                }
                isPointerDownRef.current = true;
                lastPointerTileIdRef.current = tile.id;
                suppressNextClickRef.current = true;
                onTilePointerDown(tile.id);
              }}
              onPointerEnter={() => {
                if (interactionMode === "paint" && isPointerDownRef.current) {
                  lastPointerTileIdRef.current = tile.id;
                  onTilePointerEnter(tile.id);
                }
              }}
              onPointerUp={() => {
                if (interactionMode === "paint") {
                  finishTileStroke(tile.id);
                }
              }}
            >
              {baseLayerMode === "radar" ? <RadarCell draft={draft} tile={tile} /> : null}
              {baseLayerMode === "gameplay" ? <GameplayOverlay draft={draft} tile={tile} visibility={gameplayLayerVisibility} /> : null}
              {featureOverlay && overlayFeatures.length > 0 ? (
                <span className="map-grid-feature-count" aria-hidden="true">
                  F{overlayFeatures.length}
                </span>
              ) : null}
              {baseLayerMode !== "none" ? <span className="map-grid-cell-label">{formatTileLabel(tile)}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  function moveWindow(rowDelta: number, colDelta: number) {
    setCenter((current) => clampTileCenter(draft, { row: current.row + rowDelta, col: current.col + colDelta }));
  }

  function handleViewportPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (interactionMode !== "pan" || (event.button !== 0 && event.pointerType === "mouse")) {
      return;
    }

    panDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      center,
      range: visibleRange,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleViewportPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = panDragRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!drag || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      drag.moved = true;
    }

    setCenter(
      clampTileCenter(draft, {
        row: Math.round(drag.center.row + (dy / rect.height) * drag.range.rowCount),
        col: Math.round(drag.center.col - (dx / rect.width) * drag.range.colCount),
      }),
    );
  }

  function handleViewportPointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = panDragRef.current;
    panDragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (drag?.moved) {
      suppressNextClickRef.current = true;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 0);
      return;
    }

    if (drag) {
      const clickedTileId = getTileIdAtPoint(event.clientX, event.clientY);
      if (clickedTileId) {
        suppressNextClickRef.current = true;
        onTileClick(clickedTileId);
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 0);
      }
    }
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setZoom((current) => clamp(current * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), MIN_ZOOM, MAX_ZOOM));
  }

  function finishTileStroke(tileId?: string) {
    if (!isPointerDownRef.current) {
      return;
    }

    const finalTileId = tileId ?? lastPointerTileIdRef.current;
    isPointerDownRef.current = false;
    lastPointerTileIdRef.current = null;
    window.setTimeout(() => {
      suppressNextClickRef.current = false;
    }, 0);
    if (finalTileId) {
      onTilePointerUp(finalTileId);
    }
  }

  function getTileIdAtPoint(clientX: number, clientY: number): string | null {
    const element = document.elementFromPoint?.(clientX, clientY);
    return element?.closest<HTMLElement>("[data-tile-id]")?.dataset.tileId ?? null;
  }
}

function RadarCell({ draft, tile }: { draft: MapEditorDraft; tile: MapTileDefinition }) {
  const rowIndex = tile.row - 1;
  const colIndex = tile.col - 1;
  const glyph = draft.radar.glyphRows[rowIndex]?.[colIndex] ?? ".";
  const tone = draft.radar.toneRows[rowIndex]?.[colIndex] ?? "g";
  const color = draft.radar.palette[tone] ?? "#9bbf74";
  return (
    <span className="map-grid-radar-cell" style={{ color }} aria-hidden="true">
      {glyph}
    </span>
  );
}

function GameplayOverlay({ draft, tile, visibility }: { draft: MapEditorDraft; tile: MapTileDefinition; visibility: MapGameplayLayerVisibility }) {
  const flags = [
    tile.specialStates.length > 0 ? "SP" : null,
    tile.id === draft.originTileId ? "ORIGIN" : null,
    draft.initialDiscoveredTileIds.includes(tile.id) ? "DISC" : null,
  ].filter(Boolean);

  return (
    <span className="map-grid-gameplay-overlay" aria-hidden="true">
      {visibility.terrain ? <span>{tile.terrain}</span> : null}
      {visibility.weather ? <span>{tile.weather}</span> : null}
      {flags.length > 0 ? <span>{flags.join(" ")}</span> : null}
    </span>
  );
}

function getTileClassName(
  draft: MapEditorDraft,
  tile: MapTileDefinition,
  selectedTileId: string | null,
  selectedFeatureId: string | null,
  tileFeatures: MapFeatureDefinition[],
  overlayFeatures: MapFeatureDefinition[],
  featureOverlay: boolean,
  baseLayerMode: MapBaseLayerMode,
): string {
  const classNames = ["map-grid-tile"];
  if (baseLayerMode === "none") {
    classNames.push("map-grid-tile-base-none");
  }
  if (baseLayerMode === "gameplay" && isTileBlocked(tile)) {
    classNames.push("map-grid-tile-gameplay-blocked");
  }
  if (tile.id === draft.originTileId) {
    classNames.push("map-grid-tile-origin");
  }
  if (draft.initialDiscoveredTileIds.includes(tile.id)) {
    classNames.push("map-grid-tile-discovered");
  }
  if (selectedTileId === tile.id) {
    classNames.push("map-grid-tile-selected");
  }
  if (!featureOverlay) {
    return classNames.join(" ");
  }
  if (selectedFeatureId && tileFeatures.length > 0 && overlayFeatures.length === 0) {
    classNames.push("map-grid-tile-feature-muted");
  }
  if (selectedFeatureId && overlayFeatures.some((feature) => feature.id === selectedFeatureId)) {
    classNames.push("map-grid-tile-feature-footprint");
    return classNames.join(" ");
  }
  if (overlayFeatures.length > 1) {
    classNames.push("map-grid-tile-feature-overlap");
  } else if (overlayFeatures.length === 1) {
    classNames.push("map-grid-tile-feature");
  }
  return classNames.join(" ");
}

function isTileBlocked(tile: MapTileDefinition): boolean {
  return tile.terrain.includes("不可通行") || tile.terrain.includes("山");
}

function formatTileTitle(tile: MapTileDefinition, tileFeatures: MapFeatureDefinition[]): string {
  const featureSummary = tileFeatures.length > 0 ? ` · Features: ${tileFeatures.map((feature) => feature.name).join(", ")}` : "";
  return `${tile.id}${featureSummary}`;
}

function formatTileLabel(tile: MapTileDefinition): string {
  return `${tile.row},${tile.col}`;
}

function getOverlayFeatures(tileFeatures: MapFeatureDefinition[], selectedFeatureId: string | null, featureOverlay: boolean): MapFeatureDefinition[] {
  if (!featureOverlay) {
    return [];
  }
  if (!selectedFeatureId) {
    return tileFeatures;
  }
  return tileFeatures.filter((feature) => feature.id === selectedFeatureId);
}

function getInitialCenter(draft: MapEditorDraft, tileId: string | null): TileCenter {
  const point = parseTileId(tileId ?? draft.originTileId) ?? { row: 1, col: 1 };
  return clampTileCenter(draft, point);
}

function getVisibleRange(draft: MapEditorDraft, center: TileCenter, zoom: number): VisibleRange {
  const rowCount = clamp(Math.round(BASE_VIEW_ROWS / zoom), MIN_VIEW_ROWS, draft.size.rows);
  const colCount = clamp(Math.round(BASE_VIEW_COLS / zoom), MIN_VIEW_COLS, draft.size.cols);
  const rowStart = clamp(center.row - Math.floor(rowCount / 2), 1, Math.max(1, draft.size.rows - rowCount + 1));
  const colStart = clamp(center.col - Math.floor(colCount / 2), 1, Math.max(1, draft.size.cols - colCount + 1));
  return {
    rowStart,
    rowEnd: Math.min(draft.size.rows, rowStart + rowCount - 1),
    colStart,
    colEnd: Math.min(draft.size.cols, colStart + colCount - 1),
    rowCount,
    colCount,
  };
}

function isPointInsideRange(point: TileCenter, range: VisibleRange): boolean {
  return point.row >= range.rowStart && point.row <= range.rowEnd && point.col >= range.colStart && point.col <= range.colEnd;
}

function clampTileCenter(draft: MapEditorDraft, center: TileCenter): TileCenter {
  return {
    row: clamp(center.row, 1, draft.size.rows),
    col: clamp(center.col, 1, draft.size.cols),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
