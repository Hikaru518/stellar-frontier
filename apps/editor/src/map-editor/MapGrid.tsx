import { useState, type CSSProperties } from "react";
import type { MapEditorTileset } from "./apiClient";
import type { MapEditorDraft, MapTileDefinition } from "./types";
import { TileSprite } from "./TilePalette";

interface MapGridProps {
  draft: MapEditorDraft;
  tilesets: MapEditorTileset[];
  selectedTileId: string | null;
  soloLayerId: string | null;
  onSelectTile: (tileId: string) => void;
  onTilePointerDown: (tileId: string) => void;
  onTilePointerEnter: (tileId: string) => void;
  onTilePointerUp: (tileId: string) => void;
}

export default function MapGrid({
  draft,
  tilesets,
  selectedTileId,
  soloLayerId,
  onSelectTile,
  onTilePointerDown,
  onTilePointerEnter,
  onTilePointerUp,
}: MapGridProps) {
  const [isPointerDown, setIsPointerDown] = useState(false);
  const tileById = new Map(draft.tiles.map((tile) => [tile.id, tile]));
  const tilesetById = new Map(tilesets.map((tileset) => [tileset.id, tileset]));

  return (
    <div
      className="map-grid-viewport"
      aria-label={`${draft.name} grid preview`}
      style={{ "--map-cols": draft.size.cols } as CSSProperties}
      onPointerLeave={() => setIsPointerDown(false)}
    >
      {draft.tiles.map((tile) => (
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
          <span className="map-grid-cell-layers" aria-hidden="true">
            {draft.visual.layers.map((layer, index) => {
              if (!shouldRenderLayer(layer.id, layer.visible, soloLayerId)) {
                return null;
              }

              const cell = layer.cells[tile.id];
              if (!cell) {
                return null;
              }

              const tileset = tilesetById.get(cell.tilesetId);
              return (
                <span
                  key={layer.id}
                  className="map-grid-visual-layer"
                  style={
                    {
                      "--layer-order": index,
                      "--tile-hue": (cell.tileIndex * 47) % 360,
                      opacity: layer.opacity,
                    } as CSSProperties
                  }
                >
                  {tileset ? <TileSprite tileset={tileset} tileIndex={cell.tileIndex} /> : null}
                </span>
              );
            })}
          </span>
          <span className="map-grid-cell-label">{formatTileLabel(tileById.get(tile.id) ?? tile)}</span>
        </button>
      ))}
    </div>
  );
}

function shouldRenderLayer(layerId: string, visible: boolean, soloLayerId: string | null): boolean {
  if (soloLayerId) {
    return layerId === soloLayerId;
  }

  return visible;
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
