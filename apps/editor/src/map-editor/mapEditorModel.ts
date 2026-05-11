import type {
  CreateMapDraftInput,
  MapEditorDraft,
  MapEditorState,
  MapEnvironmentDefinition,
  MapTileDefinition,
} from "./types";

export const DEFAULT_MAP_VERSION = 3;
export const DEFAULT_TERRAIN = "平原";
export const DEFAULT_WEATHER = "晴朗";
const DEFAULT_RADAR_GLYPH = ".";
const DEFAULT_RADAR_TONE = "g";

export function createMapEditorDraft(input: CreateMapDraftInput): MapEditorDraft {
  const rows = assertPositiveInteger(input.rows, "rows");
  const cols = assertPositiveInteger(input.cols, "cols");
  const originTileId = getTileId(Math.ceil(rows / 2), Math.ceil(cols / 2));
  const radarPath = defaultRadarPath(input.id);

  return {
    id: input.id,
    name: input.name,
    version: DEFAULT_MAP_VERSION,
    size: { rows, cols },
    originTileId,
    initialDiscoveredTileIds: [originTileId],
    radarPath,
    tiles: createGameplayTiles(rows, cols),
    features: [],
    radar: createDefaultRadar(rows, cols, originTileId, radarPath),
  };
}

export function createInitialMapEditorState(draft: MapEditorDraft): MapEditorState {
  const normalizedDraft = normalizeMapEditorDraft(draft);
  return {
    draft: normalizedDraft,
    history: {
      past: [],
      future: [],
    },
  };
}

export function normalizeMapEditorDraft(draft: MapEditorDraft): MapEditorDraft {
  const rows = draft.size.rows;
  const cols = draft.size.cols;
  const radarPath = draft.radarPath ?? defaultRadarPath(draft.id);
  return {
    ...draft,
    radarPath,
    features: Array.isArray(draft.features) ? draft.features : [],
    radar: normalizeRadar(draft.radar, rows, cols, draft.originTileId, radarPath),
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

function createDefaultRadar(rows: number, cols: number, originTileId: string, radarPath: string): MapEditorDraft["radar"] {
  const origin = parseTileId(originTileId) ?? { row: Math.ceil(rows / 2), col: Math.ceil(cols / 2) };
  return {
    world: {
      width: cols,
      height: rows,
      origin: { x: origin.col - 1, y: origin.row - 1 },
    },
    glyphRows: Array.from({ length: rows }, () => DEFAULT_RADAR_GLYPH.repeat(cols)),
    toneRows: Array.from({ length: rows }, () => DEFAULT_RADAR_TONE.repeat(cols)),
    palette: {
      g: "#9bbf74",
      d: "#8f7a5d",
      c: "#74a6a6",
      a: "#f0a64d",
      w: "#e7d0a4",
      s: "#7dffb1",
      r: "#ff6b5f",
    },
    symbols: {
      crew: { glyph: "@", tone: "c" },
      focus: { glyph: "X", tone: "s" },
    },
    trace: {
      layerNotice: "雷达层来自 map JSON，可在语义编辑器中修改 glyph/tone。",
      controlMode: "语义地图编辑模式：运行时雷达读取此 JSON。",
      callMode: "从通话进入地图后只标记目标，仍需回通话确认。",
      worldLine: `[WORLD] ${cols} x ${rows} interactive coordinate grid`,
      jsonLine: `[JSON] radar glyph/tone/regions loaded from ${radarPath}`,
      emptyLine: "[MAP] WAITING FOR FIELD INPUT",
    },
    regions: [],
  };
}

function normalizeRadar(radar: MapEditorDraft["radar"] | undefined, rows: number, cols: number, originTileId: string, radarPath: string): MapEditorDraft["radar"] {
  const fallback = createDefaultRadar(rows, cols, originTileId, radarPath);
  if (!radar) {
    return fallback;
  }

  return {
    ...fallback,
    ...radar,
    world: {
      ...fallback.world,
      ...radar.world,
      width: cols,
      height: rows,
      origin: radar.world?.origin ?? fallback.world.origin,
    },
    glyphRows: normalizeRows(radar.glyphRows, rows, cols, DEFAULT_RADAR_GLYPH),
    toneRows: normalizeRows(radar.toneRows, rows, cols, DEFAULT_RADAR_TONE),
    palette: radar.palette ?? fallback.palette,
    symbols: {
      ...fallback.symbols,
      ...radar.symbols,
    },
    trace: {
      ...fallback.trace,
      ...radar.trace,
    },
    regions: Array.isArray(radar.regions) ? radar.regions : [],
  };
}

function defaultRadarPath(mapId: string): string {
  return `content/maps/radar/${mapId}-radar.json`;
}

function normalizeRows(rowsValue: string[] | undefined, rows: number, cols: number, fill: string): string[] {
  return Array.from({ length: rows }, (_, index) => {
    const row = rowsValue?.[index] ?? "";
    return (row + fill.repeat(cols)).slice(0, cols);
  });
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
