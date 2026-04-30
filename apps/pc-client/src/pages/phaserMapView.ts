import type { VisibleTileStatus } from "../mapSystem";
import type { CrewActionState } from "../events/types";

export interface TerrainColorInput {
  status: VisibleTileStatus;
  terrain?: string;
  hasCrewSignal?: boolean;
}

export interface TileTooltipInput {
  displayCoord: string;
  status: VisibleTileStatus;
  terrain?: string;
  hasCrewSignal?: boolean;
}

export interface CrewMarkerIdentity {
  id: string;
  name: string;
}

export interface TileCenter {
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
  terrain?: string;
  semanticLines?: string[];
  crewLabels: string[];
  isDanger: boolean;
  isRoute: boolean;
  isSelected: boolean;
  isTarget: boolean;
}

export interface PhaserCrewMarkerView extends TileCenter {
  crewId: string;
  label: string;
}

export interface CrewMarkerPositionInput {
  currentTileId: string;
  action?: CrewActionState | null;
  tileCenters: Record<string, TileCenter>;
  elapsedGameSeconds: number;
}

const UNKNOWN_TILE_COLOR = "#6f7378";
const DEFAULT_TILE_COLOR = "#8c8174";

export function getTerrainFillColor({ status, terrain, hasCrewSignal = false }: TerrainColorInput) {
  if (status !== "discovered" && !hasCrewSignal) {
    return UNKNOWN_TILE_COLOR;
  }

  return colorForTerrain(terrain);
}

export function getTileTooltipText({ displayCoord, status, terrain, hasCrewSignal = false }: TileTooltipInput) {
  if (status !== "discovered" && !hasCrewSignal) {
    return `坐标：${displayCoord}\n未探索区域`;
  }

  return `坐标：${displayCoord}\n地形：${terrain ?? "未知地形"}`;
}

export function getCrewMarkerLabel({ id, name }: CrewMarkerIdentity) {
  const knownLabel = crewMarkerLabels[id.toLowerCase()];
  if (knownLabel) {
    return knownLabel;
  }

  return name.trim().charAt(0).toUpperCase() || "?";
}

export function getCrewMarkerPosition({ currentTileId, action, tileCenters, elapsedGameSeconds }: CrewMarkerPositionInput): TileCenter {
  const fallback = tileCenters[currentTileId] ?? { x: 0, y: 0 };
  if (!action || action.type !== "move" || action.status !== "active") {
    return fallback;
  }

  const route = action.path_tile_ids ?? [];
  const stepIndex = readNumber(action.action_params.route_step_index);
  const stepStartedAt = readNumber(action.action_params.step_started_at);
  const stepFinishTime = readNumber(action.action_params.step_finish_time);
  if (route.length === 0 || stepIndex === null || stepStartedAt === null || stepFinishTime === null || stepFinishTime <= stepStartedAt) {
    return fallback;
  }

  const toTileId = route[stepIndex];
  const fromTileId = stepIndex === 0 ? action.from_tile_id : route[stepIndex - 1];
  if (!fromTileId || !toTileId) {
    return fallback;
  }

  const from = tileCenters[fromTileId];
  const to = tileCenters[toTileId];
  if (!from || !to) {
    return fallback;
  }

  const progress = clamp((elapsedGameSeconds - stepStartedAt) / (stepFinishTime - stepStartedAt), 0, 1);
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

function colorForTerrain(terrain?: string) {
  if (!terrain) {
    return DEFAULT_TILE_COLOR;
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
  if (terrain.includes("山") || terrain.includes("岩") || terrain.includes("丘陵")) {
    return "#777b82";
  }
  if (terrain.includes("草") || terrain.includes("平原")) {
    return "#7fbf69";
  }
  if (terrain.includes("坠毁") || terrain.includes("设施") || terrain.includes("残骸")) {
    return "#8c8174";
  }

  return DEFAULT_TILE_COLOR;
}

const crewMarkerLabels: Record<string, string> = {
  mike: "M",
  amy: "A",
  garry: "G",
};

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
