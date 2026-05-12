import type { FeatureRuntimeState, MapFeatureDefinition } from "./content/contentData";

export interface MapFeatureQueryTile {
  id: string;
  row: number;
  col: number;
}

export interface MapFeatureQueryConfig {
  size: {
    rows: number;
    cols: number;
  };
  tiles: readonly MapFeatureQueryTile[];
  features: readonly MapFeatureDefinition[];
}

export type TileFeatureIndex = Record<string, string[]>;

export interface MapFeatureRuntimeTileState {
  discovered?: boolean;
  investigated?: boolean;
}

export interface MapFeatureRuntimeMapState {
  discoveredTileIds?: readonly string[];
  tilesById?: Record<string, MapFeatureRuntimeTileState | undefined>;
  featuresById?: Record<string, FeatureRuntimeState | undefined>;
}

export function expandFeatureFootprint(feature: MapFeatureDefinition, config: MapFeatureQueryConfig): string[] {
  const footprint = feature.footprint;
  if (!footprint || footprint.type !== "row_spans" || !Array.isArray(footprint.spans) || footprint.spans.length === 0) {
    return [];
  }

  const tileIds: string[] = [];
  for (const span of footprint.spans) {
    if (!isValidRowSpan(config, span.row, span.colStart, span.colEnd)) {
      continue;
    }

    for (let col = span.colStart; col <= span.colEnd; col += 1) {
      tileIds.push(formatTileId(span.row, col));
    }
  }

  return tileIds;
}

export function buildFeatureTileIndex(config: MapFeatureQueryConfig): TileFeatureIndex {
  const index: TileFeatureIndex = {};
  const knownTileIds = new Set(config.tiles.map((tile) => tile.id));

  for (const feature of config.features) {
    for (const tileId of expandFeatureFootprint(feature, config)) {
      if (!knownTileIds.has(tileId)) {
        continue;
      }

      const featureIds = (index[tileId] ??= []);
      if (!featureIds.includes(feature.id)) {
        featureIds.push(feature.id);
      }
    }
  }

  return index;
}

export function getFeaturesAtTile(
  config: MapFeatureQueryConfig,
  index: TileFeatureIndex,
  tileId: string,
): MapFeatureDefinition[] {
  if (!isKnownTile(config, tileId)) {
    return [];
  }

  const featureIds = index[tileId] ?? [];
  if (featureIds.length === 0) {
    return [];
  }

  const featureById = new Map(config.features.map((feature) => [feature.id, feature]));
  const features = featureIds
    .map((featureId) => featureById.get(featureId))
    .filter((feature): feature is MapFeatureDefinition => Boolean(feature));

  return sortFeaturesForQuery(features);
}

export function getVisibleFeaturesAtTile(
  config: MapFeatureQueryConfig,
  index: TileFeatureIndex,
  map: MapFeatureRuntimeMapState,
  tileId: string,
): MapFeatureDefinition[] {
  return getFeaturesAtTile(config, index, tileId).filter((feature) => isFeatureVisibleAtTile(feature, map, tileId));
}

export function getInvestigatableFeaturesAtTile(
  config: MapFeatureQueryConfig,
  index: TileFeatureIndex,
  map: MapFeatureRuntimeMapState,
  tileId: string,
): MapFeatureDefinition[] {
  return getVisibleFeaturesAtTile(config, index, map, tileId).filter(isInvestigatableFeature);
}

export function selectTopInvestigatableFeatures(features: readonly MapFeatureDefinition[]): MapFeatureDefinition[] {
  const investigatableFeatures = sortFeaturesForQuery(features.filter(isInvestigatableFeature));
  const topPriority = investigatableFeatures[0]?.priority;
  if (topPriority === undefined) {
    return [];
  }

  return investigatableFeatures.filter((feature) => feature.priority === topPriority);
}

function sortFeaturesForQuery(features: readonly MapFeatureDefinition[]): MapFeatureDefinition[] {
  return [...features].sort(compareFeaturesForQuery);
}

function compareFeaturesForQuery(left: MapFeatureDefinition, right: MapFeatureDefinition): number {
  const priorityDelta = right.priority - left.priority;
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

function isInvestigatableFeature(feature: MapFeatureDefinition): boolean {
  return feature.investigatable === true;
}

function isFeatureVisibleAtTile(
  feature: MapFeatureDefinition,
  map: MapFeatureRuntimeMapState | undefined,
  tileId: string,
): boolean {
  switch (feature.visibility) {
    case "always":
      return true;
    case "onDiscovered":
      return isTileDiscovered(map, tileId);
    case "onInvestigated":
      return isTileInvestigated(map, tileId);
    case "hidden":
      return Boolean(map?.featuresById?.[feature.id]?.revealed);
    default:
      return false;
  }
}

function isTileDiscovered(map: MapFeatureRuntimeMapState | undefined, tileId: string): boolean {
  return Boolean(map?.discoveredTileIds?.includes(tileId) || map?.tilesById?.[tileId]?.discovered);
}

function isTileInvestigated(map: MapFeatureRuntimeMapState | undefined, tileId: string): boolean {
  return Boolean(map?.tilesById?.[tileId]?.investigated);
}

function isKnownTile(config: MapFeatureQueryConfig, tileId: string): boolean {
  const coord = parseTileId(tileId);
  if (!coord || !isInsideMap(config, coord.row, coord.col)) {
    return false;
  }

  return config.tiles.some((tile) => tile.id === tileId);
}

function isValidRowSpan(config: MapFeatureQueryConfig, row: number, colStart: number, colEnd: number): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(colStart) &&
    Number.isInteger(colEnd) &&
    colStart <= colEnd &&
    isInsideMap(config, row, colStart) &&
    isInsideMap(config, row, colEnd)
  );
}

function parseTileId(tileId: string): { row: number; col: number } | null {
  const match = /^(\d+)-(\d+)$/.exec(tileId);
  if (!match) {
    return null;
  }

  return { row: Number(match[1]), col: Number(match[2]) };
}

function isInsideMap(config: MapFeatureQueryConfig, row: number, col: number): boolean {
  return row >= 1 && row <= config.size.rows && col >= 1 && col <= config.size.cols;
}

function formatTileId(row: number, col: number): string {
  return `${row}-${col}`;
}
