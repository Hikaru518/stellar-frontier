import type { MapConfigDefinition, MapTileDefinition } from "./content/contentData";
import { mapObjectDefinitionById, type MapObjectDefinition, type MapObjectRuntime, type RuntimeMapObjectsState } from "./content/mapObjects";
import type { CrewId, InvestigationReport } from "./data/gameData";

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

export interface VisibleTileObject {
  definition: MapObjectDefinition;
  runtime?: MapObjectRuntime;
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

export function isMapObjectVisibleOnTile(tileId: string, definition: MapObjectDefinition, map: RuntimeMapState | undefined) {
  if (!map) {
    return true;
  }

  const runtimeTile = map.tilesById[tileId];
  return (
    definition.visibility === "onDiscovered" ||
    runtimeTile?.revealedObjectIds?.includes(definition.id) ||
    (definition.visibility === "onInvestigated" && runtimeTile?.investigated)
  );
}

export function resolveVisibleTileObjects(tile: MapTileDefinition, map: RuntimeMapState | undefined): VisibleTileObject[] {
  return resolveTileObjects(tile)
    .filter((definition) => isMapObjectVisibleOnTile(tile.id, definition, map))
    .map((definition) => ({
      definition,
      runtime: map?.mapObjects?.[definition.id],
    }));
}

export function formatMapObjectStatus(status: string | undefined): string {
  switch (status) {
    case "damaged":
      return "已损坏";
    case "repaired":
      return "正常";
    case "unsearched":
      return "未搜寻";
    default:
      return status ?? "";
  }
}

function getTile(config: MapConfigDefinition, tileId: string) {
  return config.tiles.find((tile) => tile.id === tileId);
}

function getOrigin(config: MapConfigDefinition) {
  return getTile(config, config.originTileId) ?? parseTileId(config.originTileId);
}

function isInsideMap(config: MapConfigDefinition, row: number, col: number) {
  return row >= 1 && row <= config.size.rows && col >= 1 && col <= config.size.cols;
}

function formatDisplayCoord(coord: DisplayCoord) {
  return `(${coord.displayX},${coord.displayY})`;
}
