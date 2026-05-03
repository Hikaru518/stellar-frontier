import type { MapConfigDefinition, MapTileDefinition } from "./content/contentData";
import { mapObjectDefinitionById, type MapObjectDefinition, type RuntimeMapObjectsState } from "./content/mapObjects";
import type { CrewId, InvestigationReport } from "./data/gameData";

export type VisibleTileStatus = "discovered" | "frontier" | "unknownHole";

export interface TileCoord {
  row: number;
  col: number;
}

export interface DisplayCoord {
  displayX: number;
  displayY: number;
}

export interface RuntimeMapTileState {
  discovered?: boolean;
  investigated?: boolean;
  revealedObjectIds?: string[];
  revealedSpecialStateIds?: string[];
  activeSpecialStateIds?: string[];
  crew?: CrewId[];
  status?: string;
  lastInvestigationReportId?: string;
}

export interface RuntimeMapState {
  configId: string;
  configVersion: number;
  rows: number;
  cols: number;
  originTileId: string;
  discoveredTileIds: string[];
  investigationReportsById: Record<string, InvestigationReport>;
  tilesById: Record<string, RuntimeMapTileState | undefined>;
  /**
   * Flat by-id state for every map object, populated at game-start from
   * `mapObjectDefinitionById`. Optional on the type so narrow test fixtures
   * still compile; runtime always treats `undefined` as `{}`.
   */
  mapObjects?: RuntimeMapObjectsState;
}

export interface VisibleTileCell {
  id: string;
  row: number;
  col: number;
  displayX: number;
  displayY: number;
  status: VisibleTileStatus;
  tile?: MapTileDefinition;
}

export interface VisibleTileWindow {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
  cells: VisibleTileCell[];
}

export function getTileId(row: number, col: number) {
  return `${row}-${col}`;
}

export function parseTileId(tileId: string): TileCoord | null {
  const match = /^(\d+)-(\d+)$/.exec(tileId);
  if (!match) {
    return null;
  }

  return { row: Number(match[1]), col: Number(match[2]) };
}

export function getDisplayCoord(tile: TileCoord, origin: TileCoord): DisplayCoord {
  return {
    displayX: tile.col - origin.col,
    displayY: origin.row - tile.row,
  };
}

export function getTileAreaName(config: MapConfigDefinition, tileId: string) {
  return getTile(config, tileId)?.areaName;
}

export function getTileLocationLabel(config: MapConfigDefinition, tileId: string) {
  const tile = getTile(config, tileId);
  const origin = getOrigin(config);
  if (!tile || !origin) {
    return tileId;
  }

  return `${tile.areaName} ${formatDisplayCoord(getDisplayCoord(tile, origin))}`;
}

export function getVisibleTileWindow(config: MapConfigDefinition, runtimeMap: RuntimeMapState): VisibleTileWindow {
  const discoveredIds = getDiscoveredIds(runtimeMap);
  const frontierIds = new Set<string>();

  for (const tileId of discoveredIds) {
    const coord = parseTileId(tileId);
    if (!coord) {
      continue;
    }

    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        if (rowOffset === 0 && colOffset === 0) {
          continue;
        }

        const row = coord.row + rowOffset;
        const col = coord.col + colOffset;
        const neighborId = getTileId(row, col);
        if (isInsideMap(config, row, col) && !discoveredIds.has(neighborId)) {
          frontierIds.add(neighborId);
        }
      }
    }
  }

  const visibleIds = [...discoveredIds, ...frontierIds];
  const visibleCoords = visibleIds.map((id) => parseTileId(id)).filter((coord): coord is TileCoord => Boolean(coord));
  if (visibleCoords.length === 0) {
    return { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0, cells: [] };
  }

  const minRow = Math.min(...visibleCoords.map((coord) => coord.row));
  const maxRow = Math.max(...visibleCoords.map((coord) => coord.row));
  const minCol = Math.min(...visibleCoords.map((coord) => coord.col));
  const maxCol = Math.max(...visibleCoords.map((coord) => coord.col));
  const origin = getOrigin(config);
  const cells: VisibleTileCell[] = [];

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const id = getTileId(row, col);
      const displayCoord = origin ? getDisplayCoord({ row, col }, origin) : { displayX: col, displayY: row };
      cells.push({
        id,
        row,
        col,
        ...displayCoord,
        status: discoveredIds.has(id) ? "discovered" : frontierIds.has(id) ? "frontier" : "unknownHole",
        tile: getTile(config, id),
      });
    }
  }

  return { minRow, maxRow, minCol, maxCol, cells };
}

export function getFullTileWindow(config: MapConfigDefinition): VisibleTileWindow {
  const origin = getOrigin(config);
  const cells: VisibleTileCell[] = [];

  for (let row = 1; row <= config.size.rows; row += 1) {
    for (let col = 1; col <= config.size.cols; col += 1) {
      const id = getTileId(row, col);
      const displayCoord = origin ? getDisplayCoord({ row, col }, origin) : { displayX: col, displayY: row };
      cells.push({
        id,
        row,
        col,
        ...displayCoord,
        status: "discovered",
        tile: getTile(config, id),
      });
    }
  }

  return {
    minRow: 1,
    maxRow: config.size.rows,
    minCol: 1,
    maxCol: config.size.cols,
    cells,
  };
}

export function canMoveToTile(config: MapConfigDefinition, _runtimeMap: RuntimeMapState, tileId: string) {
  const coord = parseTileId(tileId);
  if (!coord || !isInsideMap(config, coord.row, coord.col) || !getTile(config, tileId)) {
    return false;
  }

  return true;
}

/**
 * Look up the {@link MapObjectDefinition}s referenced by a tile's `objectIds`.
 *
 * The tile config carries only `string[]` ids — definitions live in
 * `content/map-objects/*.json` and are indexed by `mapObjectDefinitionById`.
 * Unknown ids are skipped silently (with a `console.warn`) so a stale tile
 * reference cannot crash the map view; the migration script + JSON Schema
 * enforce referential integrity at content build time.
 */
export function resolveTileObjects(tile: MapTileDefinition): MapObjectDefinition[] {
  const result: MapObjectDefinition[] = [];
  for (const objectId of tile.objectIds) {
    const definition = mapObjectDefinitionById.get(objectId);
    if (!definition) {
      console.warn(`[mapSystem] tile ${tile.id} references unknown objectId ${objectId}`);
      continue;
    }
    result.push(definition);
  }
  return result;
}

function getTile(config: MapConfigDefinition, tileId: string) {
  return config.tiles.find((tile) => tile.id === tileId);
}

function getOrigin(config: MapConfigDefinition) {
  return getTile(config, config.originTileId) ?? parseTileId(config.originTileId);
}

function getDiscoveredIds(runtimeMap: RuntimeMapState) {
  const discoveredIds = new Set(runtimeMap.discoveredTileIds);
  for (const [tileId, tileState] of Object.entries(runtimeMap.tilesById)) {
    if (tileState?.discovered) {
      discoveredIds.add(tileId);
    }
  }
  return discoveredIds;
}

function isDiscovered(runtimeMap: RuntimeMapState, tileId: string) {
  return getDiscoveredIds(runtimeMap).has(tileId);
}

function isInsideMap(config: MapConfigDefinition, row: number, col: number) {
  return row >= 1 && row <= config.size.rows && col >= 1 && col <= config.size.cols;
}

function formatDisplayCoord(coord: DisplayCoord) {
  return `(${coord.displayX},${coord.displayY})`;
}
