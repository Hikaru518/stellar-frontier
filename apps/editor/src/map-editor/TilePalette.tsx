import { useMemo, useState, type CSSProperties } from "react";
import { DEFAULT_HELPER_BASE_URL, type MapEditorTileset, type MapEditorTilesetRegistry } from "./apiClient";
import type { MapVisualCellDefinition } from "./types";

interface TilePaletteProps {
  registry: MapEditorTilesetRegistry;
  selectedTile: MapVisualCellDefinition | null;
  recentTiles: MapVisualCellDefinition[];
  onSelectTile: (tile: MapVisualCellDefinition) => void;
}

export default function TilePalette({ registry, selectedTile, recentTiles, onSelectTile }: TilePaletteProps) {
  const [tilesetId, setTilesetId] = useState(registry.tilesets[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [indexQuery, setIndexQuery] = useState("");
  const tileset = registry.tilesets.find((candidate) => candidate.id === tilesetId) ?? registry.tilesets[0] ?? null;
  const tileIndexes = useMemo(() => filterTileIndexes(tileset, categoryId, indexQuery), [tileset, categoryId, indexQuery]);
  const selectedTileset = selectedTile ? registry.tilesets.find((candidate) => candidate.id === selectedTile.tilesetId) : null;

  if (!tileset) {
    return (
      <section className="tile-palette" aria-label="Tileset palette">
        <h3>Palette</h3>
        <p className="muted-text">No tilesets loaded.</p>
      </section>
    );
  }

  return (
    <section className="tile-palette" aria-label="Tileset palette">
      <div className="map-panel-heading">
        <h3>Palette</h3>
        <span className="status-tag status-muted">{tileIndexes.length} tiles</span>
      </div>

      <div className="tile-palette-controls">
        <label>
          Tileset
          <select value={tileset.id} onChange={(event) => setTilesetId(event.target.value)}>
            {registry.tilesets.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">All categories</option>
            {(tileset.categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tile index
          <input
            inputMode="numeric"
            value={indexQuery}
            aria-label="Search tile index"
            onChange={(event) => setIndexQuery(event.target.value)}
            placeholder="0"
          />
        </label>
      </div>

      <div
        className={selectedTile && selectedTileset ? "tile-palette-preview" : "tile-palette-preview tile-palette-preview-empty"}
        aria-label="Selected tile preview"
      >
        {selectedTile && selectedTileset ? (
          <>
            <TileSprite tileset={selectedTileset} tileIndex={selectedTile.tileIndex} className="tile-palette-preview-sprite" />
            <div>
              <strong>{selectedTileset.name}</strong>
              <p className="muted-text">Tile index {selectedTile.tileIndex}</p>
            </div>
          </>
        ) : (
          <p className="muted-text">Select a tile index before painting.</p>
        )}
      </div>

      {recentTiles.length > 0 ? (
        <div className="tile-palette-recent" aria-label="Recent tiles">
          {recentTiles.map((tile) => {
            const recentTileset = registry.tilesets.find((candidate) => candidate.id === tile.tilesetId);
            return recentTileset ? (
              <button
                key={`${tile.tilesetId}:${tile.tileIndex}`}
                type="button"
                aria-label={`Select recent tile index ${tile.tileIndex}`}
                aria-pressed={isSameTile(selectedTile, tile)}
                onClick={() => onSelectTile(tile)}
              >
                <TileSprite tileset={recentTileset} tileIndex={tile.tileIndex} />
              </button>
            ) : null;
          })}
        </div>
      ) : null}

      <div className="tile-palette-grid" aria-label={`${tileset.name} tilesheet tile indexes`}>
        {tileIndexes.map((tileIndex) => {
          const tile = { tilesetId: tileset.id, tileIndex };
          return (
            <button
              key={tileIndex}
              type="button"
              aria-label={`Select tile index ${tileIndex}`}
              aria-pressed={isSameTile(selectedTile, tile)}
              onClick={() => onSelectTile(tile)}
            >
              <TileSprite tileset={tileset} tileIndex={tileIndex} />
              <span>{tileIndex}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function TileSprite({
  tileset,
  tileIndex,
  className,
}: {
  tileset: MapEditorTileset;
  tileIndex: number;
  className?: string;
}) {
  const column = tileIndex % tileset.columns;
  const row = Math.floor(tileIndex / tileset.columns);
  const rows = Math.ceil(tileset.tileCount / tileset.columns);
  const x = tileset.columns <= 1 ? 0 : (column / (tileset.columns - 1)) * 100;
  const y = rows <= 1 ? 0 : (row / (rows - 1)) * 100;
  return (
    <span
      className={["tile-sprite", className].filter(Boolean).join(" ")}
      style={
        {
          "--tileset-url": `url("${getAssetUrl(tileset.assetPath)}")`,
          "--tile-bg-size": `${tileset.columns * 100}% ${rows * 100}%`,
          "--tile-bg-pos": `${x}% ${y}%`,
        } as CSSProperties
      }
    />
  );
}

function filterTileIndexes(tileset: MapEditorTileset | null, categoryId: string, indexQuery: string): number[] {
  if (!tileset) {
    return [];
  }

  const category = categoryId ? tileset.categories?.find((candidate) => candidate.id === categoryId) : null;
  const indexes = category?.tileIndexes ?? Array.from({ length: tileset.tileCount }, (_, index) => index);
  const trimmedQuery = indexQuery.trim();
  if (trimmedQuery.length === 0) {
    return indexes;
  }

  return indexes.filter((index) => String(index).includes(trimmedQuery));
}

function getAssetUrl(assetPath: string): string {
  const url = new URL("/api/map-editor/assets", DEFAULT_HELPER_BASE_URL);
  url.searchParams.set("path", assetPath);
  return url.toString();
}

function isSameTile(left: MapVisualCellDefinition | null, right: MapVisualCellDefinition): boolean {
  return left?.tilesetId === right.tilesetId && left.tileIndex === right.tileIndex;
}
