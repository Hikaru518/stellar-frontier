import type {
  CreateMapDraftInput,
  MapEditorDraft,
  MapEditorState,
  MapEnvironmentDefinition,
  MapTileDefinition,
  MapVisualLayerDefinition,
} from "./types";

export const DEFAULT_MAP_VERSION = 1;
export const DEFAULT_TERRAIN = "平原";
export const DEFAULT_WEATHER = "晴朗";

export function createMapEditorDraft(input: CreateMapDraftInput): MapEditorDraft {
  const rows = assertPositiveInteger(input.rows, "rows");
  const cols = assertPositiveInteger(input.cols, "cols");
  const originTileId = getTileId(Math.ceil(rows / 2), Math.ceil(cols / 2));

  return {
    id: input.id,
    name: input.name,
    version: DEFAULT_MAP_VERSION,
    size: { rows, cols },
    originTileId,
    initialDiscoveredTileIds: [originTileId],
    tiles: createGameplayTiles(rows, cols),
    visual: { layers: [] },
  };
}

export function createInitialMapEditorState(draft: MapEditorDraft): MapEditorState {
  const normalizedDraft = normalizeMapEditorDraft(draft);
  return {
    draft: normalizedDraft,
    activeLayerId: normalizedDraft.visual.layers[0]?.id ?? null,
    history: {
      past: [],
      future: [],
    },
  };
}

export function normalizeMapEditorDraft(draft: MapEditorDraft): MapEditorDraft {
  return {
    ...draft,
    visual: {
      layers: draft.visual?.layers ?? [],
    },
  };
}

export function createVisualLayer(
  id: string,
  name: string,
  overrides: Partial<Omit<MapVisualLayerDefinition, "id" | "name" | "cells">> & {
    cells?: Record<string, MapVisualLayerDefinition["cells"][string]>;
  } = {},
): MapVisualLayerDefinition {
  return {
    id,
    name,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    opacity: overrides.opacity ?? 1,
    cells: overrides.cells ?? {},
  };
}

export function getTileId(row: number, col: number): string {
  return `${row}-${col}`;
}

export function parseTileId(tileId: string): { row: number; col: number } | null {
  const match = /^([0-9]+)-([0-9]+)$/.exec(tileId);
  if (!match) {
    return null;
  }

  const row = Number(match[1]);
  const col = Number(match[2]);
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 1 || col < 1) {
    return null;
  }

  return { row, col };
}

export function isTileInsideDraft(draft: MapEditorDraft, tileId: string): boolean {
  const point = parseTileId(tileId);
  if (!point) {
    return false;
  }

  return point.row >= 1 && point.row <= draft.size.rows && point.col >= 1 && point.col <= draft.size.cols;
}

function createGameplayTiles(rows: number, cols: number): MapTileDefinition[] {
  const tiles: MapTileDefinition[] = [];
  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      tiles.push({
        id: getTileId(row, col),
        row,
        col,
        areaName: `区域 ${row}-${col}`,
        terrain: DEFAULT_TERRAIN,
        weather: DEFAULT_WEATHER,
        environment: createDefaultEnvironment(),
        objectIds: [],
        specialStates: [],
      });
    }
  }
  return tiles;
}

function createDefaultEnvironment(): MapEnvironmentDefinition {
  return {
    temperatureCelsius: 20,
    humidityPercent: 40,
    magneticFieldMicroTesla: 50,
    radiationLevel: "none",
    toxicityLevel: "none",
    atmosphericPressureKpa: 101,
  };
}

function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
