import type { FeatureRuntimeState, MapConfigDefinition, MapFeatureDefinition } from "./content/contentData";
import type { RuntimeMapObjectsState } from "./content/mapObjects";
import type { CrewId, InvestigationReport } from "./data/gameData";
import { buildFeatureTileIndex, getFeaturesAtTile, getVisibleFeaturesAtTile, type TileFeatureIndex } from "./mapFeatureSystem";

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
   * Flat by-id runtime state for authored map features. Optional on the type
   * so narrow test fixtures and legacy saves can be normalized defensively.
   */
  featuresById?: Record<string, FeatureRuntimeState | undefined>;
  /**
   * Legacy by-id state for map objects. New feature-aware code should read
   * `featuresById`; this remains optional for old saves and pre-migration
   * runtime paths that are removed in later feature tasks.
   */
  mapObjects?: RuntimeMapObjectsState;
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

export function getTileAreaName(config: MapConfigDefinition, tileId: string, map?: Pick<RuntimeMapState, "discoveredTileIds" | "tilesById" | "featuresById">) {
  return getTileFeatureLabel(config, tileId, map);
}

export function getTileLocationLabel(config: MapConfigDefinition, tileId: string, map?: Pick<RuntimeMapState, "discoveredTileIds" | "tilesById" | "featuresById">) {
  const tile = getTile(config, tileId);
  const origin = getOrigin(config);
  if (!tile || !origin) {
    return tileId;
  }

  const label = getTileFeatureLabel(config, tileId, map) ?? tileId;
  return `${label} ${formatDisplayCoord(getDisplayCoord(tile, origin))}`;
}

export function canMoveToTile(config: MapConfigDefinition, _runtimeMap: RuntimeMapState, tileId: string) {
  const coord = parseTileId(tileId);
  if (!coord || !isInsideMap(config, coord.row, coord.col) || !getTile(config, tileId)) {
    return false;
  }

  return true;
}

export function getFeatureRuntimeStatus(
  map: Pick<RuntimeMapState, "featuresById"> | undefined,
  feature: MapFeatureDefinition,
): string | undefined {
  return map?.featuresById?.[feature.id]?.status ?? (feature.investigatable === true ? feature.initial_status : undefined);
}

export function getFeatureRuntimeState(
  map: Pick<RuntimeMapState, "featuresById"> | undefined,
  feature: MapFeatureDefinition,
): FeatureRuntimeState {
  const status = getFeatureRuntimeStatus(map, feature);
  return {
    ...(map?.featuresById?.[feature.id] ?? {}),
    id: feature.id,
    ...(status === undefined ? {} : { status }),
  };
}

function getTile(config: MapConfigDefinition, tileId: string) {
  return config.tiles.find((tile) => tile.id === tileId);
}

const featureIndexCache = new WeakMap<MapConfigDefinition, TileFeatureIndex>();

function getTileFeatureLabel(
  config: MapConfigDefinition,
  tileId: string,
  map?: Pick<RuntimeMapState, "discoveredTileIds" | "tilesById" | "featuresById">,
): string | undefined {
  const index = getFeatureIndex(config);
  const features = map
    ? getVisibleFeaturesAtTile(config, index, map, tileId)
    : getFeaturesAtTile(config, index, tileId).filter((feature) => feature.visibility !== "hidden");
  return features[0]?.name;
}

function getFeatureIndex(config: MapConfigDefinition): TileFeatureIndex {
  const cached = featureIndexCache.get(config);
  if (cached) {
    return cached;
  }

  const index = buildFeatureTileIndex(config);
  featureIndexCache.set(config, index);
  return index;
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
