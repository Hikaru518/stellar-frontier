import { parseTileId } from "./mapEditorModel";
import type { MapEditorCommand, MapEditorDraft, MapEditorState, MapTileDefinition, SemanticBrush } from "./types";

export const MAP_EDITOR_HISTORY_LIMIT = 100;

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
  patch: Partial<Pick<MapTileDefinition, "areaName" | "terrain" | "weather" | "environment" | "objectIds" | "specialStates">>,
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
    areaName: patch.areaName === undefined ? currentTile.areaName : patch.areaName.trim(),
    environment: patch.environment ? { ...currentTile.environment, ...patch.environment } : currentTile.environment,
    objectIds: patch.objectIds ? Array.from(new Set(patch.objectIds)) : currentTile.objectIds,
    specialStates: patch.specialStates ? patch.specialStates.map((stateDefinition) => ({ ...stateDefinition })) : currentTile.specialStates,
  };

  if (nextTile.areaName.length === 0) {
    nextTile.areaName = currentTile.areaName;
  }

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
