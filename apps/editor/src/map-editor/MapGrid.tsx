import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { parseTileId } from "./mapEditorModel";
import type { MapEditorDraft, MapTileDefinition } from "./types";

const VIEW_ROWS = 25;
const VIEW_COLS = 25;

interface MapGridProps {
  draft: MapEditorDraft;
  selectedTileId: string | null;
  gameplayOverlay: boolean;
  onSelectTile: (tileId: string) => void;
  onTilePointerDown: (tileId: string) => void;
  onTilePointerEnter: (tileId: string) => void;
  onTilePointerUp: (tileId: string) => void;
}

export default function MapGrid({
  draft,
  selectedTileId,
  gameplayOverlay,
  onSelectTile,
  onTilePointerDown,
  onTilePointerEnter,
  onTilePointerUp,
}: MapGridProps) {
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [anchor, setAnchor] = useState(() => getInitialAnchor(draft, selectedTileId));
  const tileById = useMemo(() => new Map(draft.tiles.map((tile) => [tile.id, tile])), [draft.tiles]);

  useEffect(() => {
    setAnchor(getInitialAnchor(draft, selectedTileId));
  }, [draft, selectedTileId]);

  const visibleTiles = useMemo(() => {
    const tiles: MapTileDefinition[] = [];
    const endRow = Math.min(draft.size.rows, anchor.row + VIEW_ROWS - 1);
    const endCol = Math.min(draft.size.cols, anchor.col + VIEW_COLS - 1);
    for (let row = anchor.row; row <= endRow; row += 1) {
      for (let col = anchor.col; col <= endCol; col += 1) {
        const tile = tileById.get(`${row}-${col}`);
        if (tile) {
          tiles.push(tile);
        }
      }
    }
    return tiles;
  }, [anchor, draft.size.cols, draft.size.rows, tileById]);

  return (
    <div className="map-grid-shell">
      <div className="map-grid-window-controls" aria-label="Map grid viewport controls">
        <button type="button" onClick={() => moveWindow(-VIEW_ROWS, 0)}>
          North
        </button>
        <button type="button" onClick={() => moveWindow(VIEW_ROWS, 0)}>
          South
        </button>
        <button type="button" onClick={() => moveWindow(0, -VIEW_COLS)}>
          West
        </button>
        <button type="button" onClick={() => moveWindow(0, VIEW_COLS)}>
          East
        </button>
        <button type="button" onClick={() => setAnchor(getInitialAnchor(draft, draft.originTileId))}>
          Origin
        </button>
        <span className="status-tag status-muted">
          rows {anchor.row}-{Math.min(draft.size.rows, anchor.row + VIEW_ROWS - 1)} / cols {anchor.col}-{Math.min(draft.size.cols, anchor.col + VIEW_COLS - 1)}
        </span>
      </div>
      <div
        className="map-grid-viewport"
        aria-label={`${draft.name} grid preview`}
        style={{ "--map-cols": Math.min(VIEW_COLS, draft.size.cols - anchor.col + 1) } as CSSProperties}
        onPointerLeave={() => setIsPointerDown(false)}
      >
        {visibleTiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className={getTileClassName(draft, tile, selectedTileId)}
            title={`${tile.id} · ${tile.areaName}`}
            aria-label={`Select tile ${tile.id}`}
            aria-pressed={selectedTileId === tile.id}
            onClick={() => onSelectTile(tile.id)}
            onPointerDown={(event) => {
              if (event.button !== 0 && event.pointerType === "mouse") {
                return;
              }
              setIsPointerDown(true);
              event.currentTarget.setPointerCapture?.(event.pointerId);
              onTilePointerDown(tile.id);
            }}
            onPointerEnter={() => {
              if (isPointerDown) {
                onTilePointerEnter(tile.id);
              }
            }}
            onPointerUp={(event) => {
              setIsPointerDown(false);
              event.currentTarget.releasePointerCapture?.(event.pointerId);
              onTilePointerUp(tile.id);
            }}
          >
            {gameplayOverlay ? <GameplayOverlay draft={draft} tile={tile} /> : <RadarCell draft={draft} tile={tile} />}
            <span className="map-grid-cell-label">{formatTileLabel(tile)}</span>
          </button>
        ))}
      </div>
    </div>
  );

  function moveWindow(rowDelta: number, colDelta: number) {
    setAnchor((current) => ({
      row: clamp(current.row + rowDelta, 1, Math.max(1, draft.size.rows - VIEW_ROWS + 1)),
      col: clamp(current.col + colDelta, 1, Math.max(1, draft.size.cols - VIEW_COLS + 1)),
    }));
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

function GameplayOverlay({ draft, tile }: { draft: MapEditorDraft; tile: MapTileDefinition }) {
  const flags = [
    tile.objectIds.length > 0 ? "OBJ" : null,
    tile.specialStates.length > 0 ? "SP" : null,
    tile.id === draft.originTileId ? "ORIGIN" : null,
    draft.initialDiscoveredTileIds.includes(tile.id) ? "DISC" : null,
  ].filter(Boolean);

  return (
    <span className="map-grid-gameplay-overlay" aria-hidden="true">
      <span>{tile.terrain}</span>
      <span>{tile.weather}</span>
      {flags.length > 0 ? <span>{flags.join(" ")}</span> : null}
    </span>
  );
}

function getTileClassName(draft: MapEditorDraft, tile: MapTileDefinition, selectedTileId: string | null): string {
  const classNames = ["map-grid-tile"];
  if (tile.id === draft.originTileId) {
    classNames.push("map-grid-tile-origin");
  }
  if (draft.initialDiscoveredTileIds.includes(tile.id)) {
    classNames.push("map-grid-tile-discovered");
  }
  if (selectedTileId === tile.id) {
    classNames.push("map-grid-tile-selected");
  }
  return classNames.join(" ");
}

function formatTileLabel(tile: MapTileDefinition): string {
  return `${tile.row},${tile.col}`;
}

function getInitialAnchor(draft: MapEditorDraft, tileId: string | null) {
  const point = parseTileId(tileId ?? draft.originTileId) ?? { row: 1, col: 1 };
  return {
    row: clamp(point.row - Math.floor(VIEW_ROWS / 2), 1, Math.max(1, draft.size.rows - VIEW_ROWS + 1)),
    col: clamp(point.col - Math.floor(VIEW_COLS / 2), 1, Math.max(1, draft.size.cols - VIEW_COLS + 1)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
