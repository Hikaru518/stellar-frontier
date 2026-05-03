import type { MapVisualDefinition, MapVisualLayerDefinition } from "../content/contentData";
import type { CrewMember, MapTile } from "../data/gameData";
import type { CrewActionState } from "../events/types";
import type { VisibleTileStatus, VisibleTileWindow } from "../mapSystem";

export const TILE_SIZE = 128;
export const TILE_GAP = 0;

const CREW_MARKER_OFFSETS = [
  { x: 0, y: 0 },
  { x: 18, y: 0 },
  { x: -18, y: 0 },
  { x: 0, y: 18 },
] as const;

export interface Point {
  x: number;
  y: number;
}

export interface PhaserMapTileView {
  id: string;
  row: number;
  col: number;
  displayCoord: string;
  status: VisibleTileStatus;
  fillColor: string;
  tooltip: string;
  label: string;
  areaName?: string;
  terrain?: string;
  semanticLines: string[];
  crewLabels: string[];
  isDanger: boolean;
  isRoute: boolean;
  isSelected: boolean;
  isTarget: boolean;
  visualLayers?: PhaserMapTileVisualLayerView[];
}

export interface PhaserMapTileVisualLayerView {
  layerId: string;
  layerName: string;
  order: number;
  opacity: number;
  tilesetId: string;
  tileIndex: number;
}

export interface PhaserCrewMarkerView {
  crewId: string;
  label: string;
  x: number;
  y: number;
}

interface BuildPhaserTileViewsContext {
  selectedId?: string | null;
  selectedMoveTargetId?: string | null;
  movePreviewRoute?: string[];
  crewPositions?: Record<string, string[]>;
  visual?: MapVisualDefinition;
}

type PathTile = Pick<MapTile, "id" | "row" | "col"> & { walkable?: boolean };
type PositionAction = Partial<CrewActionState> & {
  fromTile?: string;
  targetTile?: string;
  stepStartedAt?: number;
  stepFinishTime?: number;
};

export function getTerrainFillColor(terrain?: string, status: VisibleTileStatus = "discovered"): string {
  if (status === "frontier" || status === "unknownHole") {
    return "#6f7378";
  }

  if (!terrain) {
    return "#8c8174";
  }

  if (terrain.includes("水")) {
    return "#2f80ed";
  }
  if (terrain.includes("森林")) {
    return "#2f8f46";
  }
  if (terrain.includes("沙漠")) {
    return "#d8b45f";
  }
  if (["山", "岩", "丘陵"].some((keyword) => terrain.includes(keyword))) {
    return "#777b82";
  }
  if (["草", "平原"].some((keyword) => terrain.includes(keyword))) {
    return "#7fbf69";
  }
  if (["坠毁", "设施", "残骸"].some((keyword) => terrain.includes(keyword))) {
    return "#8c8174";
  }

  return "#8c8174";
}

export function getTileTooltipText(displayCoord: string, status: VisibleTileStatus, terrain?: string, areaName?: string): string {
  if (status === "unknownHole") {
    return `未探索区域 | ${displayCoord}`;
  }

  const parts = [areaName || (status === "frontier" ? "边境信号" : "未知区域"), terrain, displayCoord].filter(Boolean);
  if (status === "frontier") {
    parts.push("边境未调查");
  }

  return parts.join(" | ");
}

export function getCrewMarkerLabel(crew: Pick<CrewMember, "id" | "name">): string {
  const source = crew.name.trim() || crew.id.trim();
  return (Array.from(source)[0] ?? "?").toUpperCase();
}

export function getCrewMarkerPosition(input: {
  currentTileId: string;
  action?: PositionAction | null;
  tileCenters: Record<string, Point>;
  elapsedGameSeconds: number;
}): Point {
  const fallback = input.tileCenters[input.currentTileId] ?? { x: 0, y: 0 };
  const action = input.action;
  if (!action) {
    return fallback;
  }

  const fromTileId = action.from_tile_id ?? action.fromTile ?? input.currentTileId;
  const toTileId = action.to_tile_id ?? action.target_tile_id ?? action.targetTile;
  const startedAt = action.stepStartedAt ?? action.started_at;
  const finishTime = action.stepFinishTime ?? action.ends_at;

  if (!fromTileId || !toTileId || typeof startedAt !== "number" || typeof finishTime !== "number" || finishTime <= startedAt) {
    return fallback;
  }

  const from = input.tileCenters[fromTileId];
  const to = input.tileCenters[toTileId];
  if (!from || !to) {
    return fallback;
  }

  const progress = clamp((input.elapsedGameSeconds - startedAt) / (finishTime - startedAt), 0, 1);
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

export function getGridNeighborIds(tile: { row: number; col: number }): string[] {
  return [`${tile.row - 1}-${tile.col}`, `${tile.row + 1}-${tile.col}`, `${tile.row}-${tile.col - 1}`, `${tile.row}-${tile.col + 1}`];
}

export function findTilePath(tiles: PathTile[], fromId: string, toId: string): string[] {
  const tileById = new Map(tiles.map((tile) => [tile.id, tile]));
  const fromTile = tileById.get(fromId);
  const toTile = tileById.get(toId);

  if (!isWalkable(fromTile) || !isWalkable(toTile)) {
    return [];
  }
  if (fromId === toId) {
    return [fromId];
  }

  const queue = [fromId];
  const visited = new Set([fromId]);
  const previous = new Map<string, string>();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    const current = tileById.get(currentId);
    if (!current) {
      continue;
    }

    for (const neighborId of getGridNeighborIds(current)) {
      if (visited.has(neighborId)) {
        continue;
      }
      const neighbor = tileById.get(neighborId);
      if (!isWalkable(neighbor)) {
        continue;
      }

      visited.add(neighborId);
      previous.set(neighborId, currentId);

      if (neighborId === toId) {
        return reconstructPath(previous, fromId, toId);
      }
      queue.push(neighborId);
    }
  }

  return [];
}

export function buildPhaserTileViews(visibleWindow: VisibleTileWindow, context: BuildPhaserTileViewsContext = {}): PhaserMapTileView[] {
  const routeIds = new Set(context.movePreviewRoute ?? []);
  const visualLayers = context.visual?.layers ?? [];
  return visibleWindow.cells.map((cell) => {
    const displayCoord = `(${cell.displayX},${cell.displayY})`;
    const terrain = cell.tile?.terrain;
    const areaName = cell.tile?.areaName;
    const crewIds = context.crewPositions?.[cell.id] ?? [];
    const isDiscovered = cell.status === "discovered";

    return {
      id: cell.id,
      row: cell.row - visibleWindow.minRow,
      col: cell.col - visibleWindow.minCol,
      displayCoord,
      status: cell.status,
      fillColor: getTerrainFillColor(terrain, cell.status),
      tooltip: getTileTooltipText(displayCoord, cell.status, terrain, areaName),
      label: isDiscovered ? areaName ?? cell.id : "?",
      areaName: isDiscovered ? areaName : undefined,
      terrain,
      semanticLines:
        !isDiscovered && crewIds.length > 0 && cell.tile
          ? ["队员回传", terrain ? `地形：${terrain}` : undefined, cell.tile.weather ? `天气：${cell.tile.weather}` : undefined, displayCoord].filter(
              (line): line is string => Boolean(line),
            )
          : buildTileSemanticLines(cell.status, displayCoord, terrain, areaName),
      crewLabels: crewIds.map((crewId) => getCrewMarkerLabel({ id: crewId, name: crewId } as CrewMember)),
      isDanger: isDiscovered && Boolean(cell.tile?.specialStates.some((state) => state.severity === "high" && state.startsActive)),
      isRoute: routeIds.has(cell.id),
      isSelected: context.selectedId === cell.id,
      isTarget: context.selectedMoveTargetId === cell.id,
      visualLayers: cell.status !== "unknownHole" ? buildTileVisualLayers(cell.id, visualLayers) : [],
    };
  });
}

function buildTileVisualLayers(tileId: string, layers: MapVisualLayerDefinition[]): PhaserMapTileVisualLayerView[] {
  return layers.flatMap((layer, order) => {
    if (!layer.visible) {
      return [];
    }

    const cell = layer.cells[tileId];
    if (!cell) {
      return [];
    }

    return [
      {
        layerId: layer.id,
        layerName: layer.name,
        order,
        opacity: layer.opacity,
        tilesetId: cell.tilesetId,
        tileIndex: cell.tileIndex,
      },
    ];
  });
}

export function buildTileCenters(tileViews: PhaserMapTileView[]): Record<string, Point> {
  return Object.fromEntries(
    tileViews.map((tile) => [
      tile.id,
      {
        x: tile.col * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
        y: tile.row * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
      },
    ]),
  );
}

export function buildPhaserCrewMarkers(
  crew: CrewMember[],
  crewActions: Record<string, CrewActionState | null | undefined>,
  tileCenters: Record<string, Point>,
  elapsedGameSeconds: number,
): PhaserCrewMarkerView[] {
  const sameTileCounts = new Map<string, number>();

  return crew.map((member) => {
    const position = getCrewMarkerPosition({
      currentTileId: member.currentTile,
      action: crewActions[member.id],
      tileCenters,
      elapsedGameSeconds,
    });
    const tileKey = member.currentTile;
    const offsetIndex = sameTileCounts.get(tileKey) ?? 0;
    sameTileCounts.set(tileKey, offsetIndex + 1);
    const offset = CREW_MARKER_OFFSETS[offsetIndex % CREW_MARKER_OFFSETS.length];

    return {
      crewId: member.id,
      label: getCrewMarkerLabel(member),
      x: position.x + offset.x,
      y: position.y + offset.y,
    };
  });
}

function isWalkable(tile: PathTile | undefined): tile is PathTile {
  return Boolean(tile && tile.walkable !== false);
}

function reconstructPath(previous: Map<string, string>, fromId: string, toId: string): string[] {
  const path = [toId];
  let current = toId;
  while (current !== fromId) {
    const parent = previous.get(current);
    if (!parent) {
      return [];
    }
    path.unshift(parent);
    current = parent;
  }
  return path;
}

function buildTileSemanticLines(status: VisibleTileStatus, displayCoord: string, terrain?: string, areaName?: string): string[] {
  if (status === "unknownHole") {
    return ["未探索区域", displayCoord];
  }

  if (status === "frontier") {
    return ["未探索区域", terrain ? `地形：${terrain}` : undefined, displayCoord, "边境未调查"].filter((line): line is string => Boolean(line));
  }

  return [areaName, terrain ? `地形：${terrain}` : undefined, displayCoord].filter((line): line is string => Boolean(line));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
