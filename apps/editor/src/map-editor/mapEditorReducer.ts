import {
  createFeatureFootprintFromTileIds,
  getFeatureFootprintTileIds,
  isTileInsideDraft,
  parseTileId,
} from "./mapEditorModel";
import type {
  FeatureFootprint,
  MapFeatureFootprintBrushMode,
  MapEditorCommand,
  MapEditorDraft,
  MapEditorState,
  MapFeatureDefinition,
  MapFeaturePatch,
  MapFeatureVisibility,
  MapTileDefinition,
  SemanticBrush,
} from "./types";

export const MAP_EDITOR_HISTORY_LIMIT = 100;
const FEATURE_VISIBILITIES: MapFeatureVisibility[] = ["always", "onDiscovered", "onInvestigated", "hidden"];

export function mapEditorReducer(state: MapEditorState, command: MapEditorCommand): MapEditorState {
  switch (command.type) {
    case "gameplay/updateTile":
      return updateGameplayTile(state, command.tileId, command.patch);
    case "gameplay/setOrigin":
      return setOriginTile(state, command.tileId);
    case "gameplay/setDiscovered":
      return setDiscoveredTile(state, command.tileId, command.discovered);
    case "gameplay/applySemanticBrush":
      return applySemanticBrush(state, command.tileId, command.brush);
    case "radar/updateCell":
      return updateRadarCell(state, command.tileId, { glyph: command.glyph, tone: command.tone });
    case "feature/create":
      return createFeature(state, command.feature);
    case "feature/update":
      return updateFeature(state, command.featureId, command.patch);
    case "feature/applyFootprintBrush":
      return applyFeatureFootprintBrush(state, command.featureId, command.tileIds, command.mode);
    case "feature/delete":
      return deleteFeature(state, command.featureId);
    case "history/undo":
      return undo(state);
    case "history/redo":
      return redo(state);
    default:
      return state;
  }
}

function updateGameplayTile(
  state: MapEditorState,
  tileId: string,
  patch: Partial<Pick<MapTileDefinition, "terrain" | "weather" | "environment" | "specialStates">>,
): MapEditorState {
  const tileIndex = state.draft.tiles.findIndex((tile) => tile.id === tileId);
  if (tileIndex < 0) {
    return state;
  }

  const currentTile = state.draft.tiles[tileIndex];
  if (!currentTile) {
    return state;
  }

  const nextTile: MapTileDefinition = {
    ...currentTile,
    ...patch,
    environment: patch.environment ? { ...currentTile.environment, ...patch.environment } : currentTile.environment,
    specialStates: patch.specialStates ? patch.specialStates.map((stateDefinition) => ({ ...stateDefinition })) : currentTile.specialStates,
  };

  if (areTilesEqual(currentTile, nextTile)) {
    return state;
  }

  return commitDraftChange(state, {
    ...state.draft,
    tiles: state.draft.tiles.map((tile, index) => (index === tileIndex ? nextTile : tile)),
  });
}

function setOriginTile(state: MapEditorState, tileId: string): MapEditorState {
  const point = parseTileId(tileId);
  if (!point || !state.draft.tiles.some((tile) => tile.id === tileId)) {
    return state;
  }

  const initialDiscoveredTileIds = state.draft.initialDiscoveredTileIds.includes(tileId)
    ? state.draft.initialDiscoveredTileIds
    : [...state.draft.initialDiscoveredTileIds, tileId];

  if (state.draft.originTileId === tileId && initialDiscoveredTileIds === state.draft.initialDiscoveredTileIds) {
    return state;
  }

  return commitDraftChange(state, {
    ...state.draft,
    originTileId: tileId,
    initialDiscoveredTileIds,
    radar: {
      ...state.draft.radar,
      world: {
        ...state.draft.radar.world,
        origin: { x: point.col - 1, y: point.row - 1 },
      },
    },
  });
}

function setDiscoveredTile(state: MapEditorState, tileId: string, discovered: boolean): MapEditorState {
  if (!state.draft.tiles.some((tile) => tile.id === tileId)) {
    return state;
  }

  const isDiscovered = state.draft.initialDiscoveredTileIds.includes(tileId);
  if (isDiscovered === discovered) {
    return state;
  }

  return commitDraftChange(state, {
    ...state.draft,
    initialDiscoveredTileIds: discovered
      ? [...state.draft.initialDiscoveredTileIds, tileId]
      : state.draft.initialDiscoveredTileIds.filter((candidate) => candidate !== tileId || candidate === state.draft.originTileId),
  });
}

function applySemanticBrush(state: MapEditorState, tileId: string, brush: SemanticBrush): MapEditorState {
  if (brush.kind === "origin") {
    return setOriginTile(state, tileId);
  }

  if (brush.kind === "discovered") {
    return setDiscoveredTile(state, tileId, brush.discovered);
  }

  if (brush.kind === "terrain") {
    return updateGameplayTile(state, tileId, { terrain: brush.value });
  }

  if (brush.kind === "weather") {
    return updateGameplayTile(state, tileId, { weather: brush.value });
  }

  if (brush.kind === "radarGlyph") {
    return updateRadarCell(state, tileId, { glyph: brush.glyph });
  }

  return updateRadarCell(state, tileId, { tone: brush.tone });
}

function createFeature(state: MapEditorState, feature: MapFeatureDefinition): MapEditorState {
  const nextFeature = normalizeFeatureForDraft(state.draft, feature);
  if (!nextFeature || state.draft.features.some((candidate) => candidate.id === nextFeature.id)) {
    return state;
  }

  return commitDraftChange(state, {
    ...state.draft,
    features: [...state.draft.features, nextFeature],
  });
}

function updateFeature(state: MapEditorState, featureId: string, patch: MapFeaturePatch): MapEditorState {
  const featureIndex = state.draft.features.findIndex((feature) => feature.id === featureId);
  if (featureIndex < 0) {
    return state;
  }

  const currentFeature = state.draft.features[featureIndex];
  if (!currentFeature) {
    return state;
  }

  const nextFeature = normalizeFeatureForDraft(state.draft, { ...currentFeature, ...patch });
  if (!nextFeature || areFeaturesEqual(currentFeature, nextFeature)) {
    return state;
  }

  return commitDraftChange(state, {
    ...state.draft,
    features: state.draft.features.map((feature, index) => (index === featureIndex ? nextFeature : feature)),
  });
}

function applyFeatureFootprintBrush(
  state: MapEditorState,
  featureId: string,
  tileIds: string[],
  mode: MapFeatureFootprintBrushMode,
): MapEditorState {
  const featureIndex = state.draft.features.findIndex((feature) => feature.id === featureId);
  const currentFeature = state.draft.features[featureIndex];
  if (featureIndex < 0 || !currentFeature) {
    return state;
  }

  const strokeTileIds = Array.from(new Set(tileIds.filter((tileId) => isTileInsideDraft(state.draft, tileId))));
  if (strokeTileIds.length === 0) {
    return state;
  }

  const nextTileIds = new Set(getFeatureFootprintTileIds(state.draft, currentFeature));
  for (const tileId of strokeTileIds) {
    if (mode === "erase") {
      nextTileIds.delete(tileId);
    } else {
      nextTileIds.add(tileId);
    }
  }

  if (nextTileIds.size === 0) {
    return state;
  }

  const nextFootprint = createFeatureFootprintFromTileIds(state.draft, Array.from(nextTileIds));
  if (areFootprintsEqual(currentFeature.footprint, nextFootprint)) {
    return state;
  }

  const nextFeature = normalizeFeatureForDraft(state.draft, { ...currentFeature, footprint: nextFootprint });
  if (!nextFeature) {
    return state;
  }

  return commitDraftChange(state, {
    ...state.draft,
    features: state.draft.features.map((feature, index) => (index === featureIndex ? nextFeature : feature)),
  });
}

function deleteFeature(state: MapEditorState, featureId: string): MapEditorState {
  if (!state.draft.features.some((feature) => feature.id === featureId)) {
    return state;
  }

  return commitDraftChange(state, {
    ...state.draft,
    features: state.draft.features.filter((feature) => feature.id !== featureId),
  });
}

function updateRadarCell(state: MapEditorState, tileId: string, patch: { glyph?: string; tone?: string }): MapEditorState {
  const point = parseTileId(tileId);
  if (!point || point.row > state.draft.size.rows || point.col > state.draft.size.cols) {
    return state;
  }

  const rowIndex = point.row - 1;
  const colIndex = point.col - 1;
  const glyph = normalizeSingleChar(patch.glyph);
  const tone = normalizeSingleChar(patch.tone);
  const nextGlyphRows = glyph ? replaceCharAt(state.draft.radar.glyphRows, rowIndex, colIndex, glyph) : state.draft.radar.glyphRows;
  const nextToneRows = tone ? replaceCharAt(state.draft.radar.toneRows, rowIndex, colIndex, tone) : state.draft.radar.toneRows;

  if (nextGlyphRows === state.draft.radar.glyphRows && nextToneRows === state.draft.radar.toneRows) {
    return state;
  }

  return commitDraftChange(state, {
    ...state.draft,
    radar: {
      ...state.draft.radar,
      glyphRows: nextGlyphRows,
      toneRows: nextToneRows,
    },
  });
}

function replaceCharAt(rows: string[], rowIndex: number, colIndex: number, char: string): string[] {
  const currentRow = rows[rowIndex];
  if (!currentRow || currentRow[colIndex] === char) {
    return rows;
  }

  return rows.map((row, index) => {
    if (index !== rowIndex) {
      return row;
    }
    return `${row.slice(0, colIndex)}${char}${row.slice(colIndex + 1)}`;
  });
}

function normalizeSingleChar(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value.trim().slice(0, 1) || null;
}

function normalizeFeatureForDraft(draft: MapEditorDraft, feature: MapFeatureDefinition): MapFeatureDefinition | null {
  const id = normalizeOptionalString(feature.id);
  if (!id) {
    return null;
  }

  const name = normalizeOptionalString(feature.name) ?? id;
  const kind = normalizeOptionalString(feature.kind) ?? "feature";
  const description = normalizeOptionalString(feature.description);
  const tags = normalizeStringList(feature.tags);
  const visibility = FEATURE_VISIBILITIES.includes(feature.visibility) ? feature.visibility : "onDiscovered";
  const nextFeature: MapFeatureDefinition = {
    id,
    name,
    kind,
    priority: normalizePriority(feature.priority),
    visibility,
    footprint: normalizeFeatureFootprint(draft, feature.footprint),
  };

  if (description) {
    nextFeature.description = description;
  }
  if (tags.length > 0) {
    nextFeature.tags = tags;
  }
  if (feature.investigatable === true) {
    const statusOptions = Array.isArray(feature.status_options) ? normalizeStringList(feature.status_options) : ["default"];
    nextFeature.investigatable = true;
    nextFeature.status_options = statusOptions;
    nextFeature.initial_status = typeof feature.initial_status === "string" ? feature.initial_status.trim() : statusOptions[0] ?? "";
    nextFeature.actions = Array.isArray(feature.actions) ? [...feature.actions] : [];
  }

  return nextFeature;
}

function normalizeFeatureFootprint(draft: MapEditorDraft, footprint: FeatureFootprint): FeatureFootprint {
  if (!footprint || footprint.type !== "row_spans" || !Array.isArray(footprint.spans) || footprint.spans.length === 0) {
    return createDefaultFeatureFootprint(draft);
  }

  const rows = Math.max(1, draft.size.rows);
  const cols = Math.max(1, draft.size.cols);
  const spans = footprint.spans.map((span) => {
    const row = normalizeCoordinate(span.row, 1, rows, 1);
    const colStart = normalizeCoordinate(span.colStart, 1, cols, 1);
    const colEnd = normalizeCoordinate(span.colEnd, 1, cols, colStart);
    return {
      row,
      colStart: Math.min(colStart, colEnd),
      colEnd: Math.max(colStart, colEnd),
    };
  });

  return spans.length > 0 ? createFeatureFootprintFromTileIds(draft, spans.flatMap((span) => spanToTileIds(span))) : createDefaultFeatureFootprint(draft);
}

function createDefaultFeatureFootprint(draft: MapEditorDraft): FeatureFootprint {
  const rows = Math.max(1, draft.size.rows);
  const cols = Math.max(1, draft.size.cols);
  const origin = parseTileId(draft.originTileId);
  const fallbackTile = draft.tiles[0];
  const row = normalizeCoordinate(origin?.row ?? fallbackTile?.row, 1, rows, 1);
  const col = normalizeCoordinate(origin?.col ?? fallbackTile?.col, 1, cols, 1);
  return {
    type: "row_spans",
    spans: [{ row, colStart: col, colEnd: col }],
  };
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => normalizeOptionalString(item)).filter((item): item is string => Boolean(item))));
}

function normalizePriority(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return 10;
  }

  return normalizeCoordinate(Math.round(numericValue), 1, 100, 10);
}

function normalizeCoordinate(value: unknown, min: number, max: number, fallback: number): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function commitDraftChange(state: MapEditorState, nextDraft: MapEditorDraft): MapEditorState {
  if (nextDraft === state.draft) {
    return state;
  }

  const nextPast = [...state.history.past, state.draft].slice(-MAP_EDITOR_HISTORY_LIMIT);
  return {
    ...state,
    draft: nextDraft,
    history: {
      past: nextPast,
      future: [],
    },
  };
}

function undo(state: MapEditorState): MapEditorState {
  const previousDraft = state.history.past[state.history.past.length - 1];
  if (!previousDraft) {
    return state;
  }

  return {
    ...state,
    draft: previousDraft,
    history: {
      past: state.history.past.slice(0, -1),
      future: [state.draft, ...state.history.future].slice(0, MAP_EDITOR_HISTORY_LIMIT),
    },
  };
}

function redo(state: MapEditorState): MapEditorState {
  const nextDraft = state.history.future[0];
  if (!nextDraft) {
    return state;
  }

  return {
    ...state,
    draft: nextDraft,
    history: {
      past: [...state.history.past, state.draft].slice(-MAP_EDITOR_HISTORY_LIMIT),
      future: state.history.future.slice(1),
    },
  };
}

function areTilesEqual(left: MapTileDefinition, right: MapTileDefinition): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function areFeaturesEqual(left: MapFeatureDefinition, right: MapFeatureDefinition): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function areFootprintsEqual(left: FeatureFootprint, right: FeatureFootprint): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function spanToTileIds(span: FeatureFootprint["spans"][number]): string[] {
  const tileIds: string[] = [];
  for (let col = span.colStart; col <= span.colEnd; col += 1) {
    tileIds.push(`${span.row}-${col}`);
  }
  return tileIds;
}
