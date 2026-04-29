import {
  crewDefinitions,
  defaultMapConfig,
  type CrewDefinition,
  type CrewProfile,
  type DiaryEntryDefinition,
  type ExpertiseDefinition,
} from "../content/contentData";
import { mapObjectDefinitionById, type RuntimeMapObjectsState } from "../content/mapObjects";
import type { EventMark, EventRuntimeState } from "../events/types";
import type { InventoryEntry } from "../inventorySystem";
import { getDisplayCoord, getTileLocationLabel, parseTileId, type RuntimeMapState } from "../mapSystem";

export type PageId = "control" | "station" | "call" | "map" | "ending";

export type CrewId = CrewDefinition["crewId"];

export type Tone = "neutral" | "muted" | "accent" | "danger" | "success";

export type CallType = "normal" | "emergency";

export type MapReturnTarget = "control" | "call";

export type ActionType = "move" | "gather" | "build" | "survey" | "standby" | "event";

export type ActionStatus = "pending" | "inProgress" | "completed" | "interrupted" | "failed";

export interface GameState extends EventRuntimeState {
  schema_version: string;
  created_at_real_time: string;
  updated_at_real_time: string;
  elapsedGameSeconds: number;
  crew: CrewMember[];
  baseInventory: InventoryEntry[];
  map: GameMapState;
  tiles: MapTile[];
  logs: SystemLog[];
  resources: ResourceSummary;
  eventHistory: Record<string, number>;
}

export interface ActiveAction {
  id: string;
  actionType: ActionType;
  status: ActionStatus;
  startTime: number;
  durationSeconds: number;
  finishTime: number;
  fromTile?: string;
  targetTile?: string;
  route?: string[];
  routeStepIndex?: number;
  stepStartedAt?: number;
  stepFinishTime?: number;
  totalDurationSeconds?: number;
  resource?: string;
  perRoundYield?: number;
  params?: Record<string, unknown>;
}

export interface CrewMember {
  id: CrewId;
  name: string;
  role: string;
  currentTile: string;
  location: string;
  coord: string;
  status: string;
  statusTone: Tone;
  attributes: CrewDefinition["attributes"];
  skills: string[];
  inventory: InventoryEntry[];
  profile: CrewProfile;
  voiceTone: string;
  personalityTags: string[];
  expertise: ExpertiseDefinition[];
  diaryEntries: DiaryEntryDefinition[];
  conditions: string[];
  hasIncoming: boolean;
  canCommunicate: boolean;
  lastContactTime: number;
  activeAction?: ActiveAction;
  unavailable?: boolean;
}

export interface ResourceSummary {
  energy: number;
  iron: number;
  wood: number;
  food: number;
  water: number;
  baseIntegrity: number;
  sol: number;
  power: number;
  commWindow: string;
}

export interface MapTile {
  id: string;
  coord: string;
  row: number;
  col: number;
  terrain: string;
  crew: CrewId[];
  status: string;
  investigated: boolean;
  eventMarks?: EventMark[];
  dangerTags?: string[];
}

export interface SystemLog {
  id: number;
  time: string;
  text: string;
  tone: Tone;
  reportId?: string;
}

export interface InvestigationReport {
  id: string;
  tileId: string;
  crewId: CrewId;
  createdAtGameSeconds: number;
  areaName: string;
  playerCoord: string;
  terrain: string;
  weather: string;
  environment: {
    temperatureCelsius: number;
    humidityPercent: number;
    magneticFieldMicroTesla: number;
    radiationLevel: string;
    toxicityLevel?: string;
    atmosphericPressureKpa?: number;
  };
  revealedObjects: Array<{ id: string; name: string; kind: string }>;
  revealedSpecialStates: Array<{ id: string; name: string; severity: string }>;
}

export type GameMapState = RuntimeMapState;

export interface CallContext {
  crewId: CrewId;
  type: CallType;
  settled: boolean;
  result?: string;
  runtimeCallId?: string;
  selectingMoveTarget?: boolean;
  selectedTargetTileId?: string;
}

export interface ActionOption {
  id: string;
  label: string;
  hint?: string;
  tone?: Tone;
}

export interface Facility {
  id: string;
  label: string;
  subLabel: string;
  variant?: "large" | "tall" | "locked";
}

export const resources: ResourceSummary = {
  energy: 620,
  iron: 1240,
  wood: 0,
  food: 0,
  water: 0,
  baseIntegrity: 71,
  sol: 37,
  power: 62,
  commWindow: "不稳定",
};

export function createBaseInventoryFromResources(resourceSummary: Pick<ResourceSummary, "iron" | "wood">): InventoryEntry[] {
  const inventory: InventoryEntry[] = [];

  if (resourceSummary.iron > 0) {
    inventory.push({ itemId: "iron_ore", quantity: resourceSummary.iron });
  }

  if (resourceSummary.wood > 0) {
    inventory.push({ itemId: "wood", quantity: resourceSummary.wood });
  }

  return inventory;
}

export function createInitialMapState(): GameMapState {
  const discoveredTileIds = [...defaultMapConfig.initialDiscoveredTileIds];
  const tilesById: GameMapState["tilesById"] = Object.fromEntries(
    defaultMapConfig.tiles.map((mapTile) => [
      mapTile.id,
      {
        discovered: discoveredTileIds.includes(mapTile.id),
        investigated: discoveredTileIds.includes(mapTile.id),
        activeSpecialStateIds: mapTile.specialStates.filter((state) => state.startsActive).map((state) => state.id),
        revealedObjectIds: mapTile.objectIds
          .map((objectId) => mapObjectDefinitionById.get(objectId))
          .filter((object): object is NonNullable<typeof object> =>
            Boolean(object && object.visibility === "onDiscovered" && discoveredTileIds.includes(mapTile.id)),
          )
          .map((object) => object.id),
        revealedSpecialStateIds: mapTile.specialStates
          .filter((state) => state.visibility === "onDiscovered" && state.startsActive && discoveredTileIds.includes(mapTile.id))
          .map((state) => state.id),
      },
    ]),
  );

  return {
    configId: defaultMapConfig.id,
    configVersion: defaultMapConfig.version,
    rows: defaultMapConfig.size.rows,
    cols: defaultMapConfig.size.cols,
    originTileId: defaultMapConfig.originTileId,
    tilesById,
    discoveredTileIds,
    investigationReportsById: {},
    mapObjects: createInitialMapObjectsState(),
  };
}

export function createInitialMapObjectsState(): RuntimeMapObjectsState {
  const state: RuntimeMapObjectsState = {};
  for (const definition of mapObjectDefinitionById.values()) {
    state[definition.id] = {
      id: definition.id,
      status_enum: definition.initial_status,
    };
  }
  return state;
}

export function createMapTilesFromConfig(map: GameMapState, previousTiles: Array<Partial<MapTile> & { id?: string }> = []): MapTile[] {
  const previousTileById = new Map(previousTiles.filter((tile): tile is Partial<MapTile> & { id: string } => typeof tile.id === "string").map((tile) => [tile.id, tile]));

  return defaultMapConfig.tiles.map((mapTile) => {
    const state = map.tilesById[mapTile.id];
    const previousTile = previousTileById.get(mapTile.id);
    const discovered = map.discoveredTileIds.includes(mapTile.id) || Boolean(state?.discovered);
    const tile: MapTile = {
      id: mapTile.id,
      coord: getMapTileDisplayCoord(mapTile.id),
      row: mapTile.row,
      col: mapTile.col,
      terrain: mapTile.terrain,
      crew: state?.crew ?? [],
      status: state?.status ?? previousTile?.status ?? (discovered ? "已发现" : "未探索"),
      investigated: Boolean(state?.investigated),
    };

    if (previousTile?.eventMarks?.length) {
      tile.eventMarks = previousTile.eventMarks;
    }
    if (previousTile?.dangerTags?.length) {
      tile.dangerTags = previousTile.dangerTags;
    }

    return tile;
  });
}

export const initialTiles: MapTile[] = createMapTilesFromConfig(createInitialMapState());

export const initialCrew: CrewMember[] = crewDefinitions.map((member) => createInitialCrewMember(member));

export const initialLogs: SystemLog[] = [
  { id: 1, time: "19:42", text: "游戏状态初始化完成。", tone: "neutral" },
  { id: 2, time: "19:45", text: "队员初始状态已载入。", tone: "neutral" },
  { id: 3, time: "19:47", text: "地图配置已载入。", tone: "muted" },
];

export const facilities: Facility[] = [
  { id: "window", label: "外部观察", subLabel: "占位入口", variant: "large" },
  { id: "station", label: "通讯台", subLabel: "查看通讯录" },
  { id: "radar", label: "卫星雷达", subLabel: "打开地图" },
  { id: "console", label: "中控台", subLabel: "资源 / 状态 / 统计" },
  { id: "research", label: "研究台", subLabel: "未供电", variant: "locked" },
  { id: "trade", label: "星际贸易", subLabel: "资源交换", variant: "locked" },
  { id: "coffee", label: "休息终端", subLabel: "未接入玩法" },
  { id: "record", label: "音频终端", subLabel: "未接入玩法" },
  { id: "fridge", label: "物资柜", subLabel: "未接入玩法" },
  { id: "gate", label: "星际之门", subLabel: "等待授权", variant: "large" },
];

export const garryActions: ActionOption[] = [
  { id: "move", label: "请求前往", hint: "先查看地图，再回到通话确认目标。" },
  { id: "build", label: "安装 / 建设", hint: "消耗本地材料，增加设施维护压力。" },
  { id: "standby", label: "停止工作原地待命", hint: "矿物产出会暂停。" },
  { id: "survey", label: "开展调查", hint: "可能发现异常，也可能发现更多问题。" },
];

function createInitialCrewMember(member: CrewDefinition): CrewMember {
  return {
    id: member.crewId,
    name: member.name,
    role: member.role,
    currentTile: member.currentTile,
    location: getTileLocationLabel(defaultMapConfig, member.currentTile),
    coord: getMapTileDisplayCoord(member.currentTile),
    status: getInitialStatus(member),
    statusTone: member.statusTone,
    attributes: member.attributes,
    skills: member.skills,
    inventory: member.inventory,
    profile: member.profile,
    voiceTone: member.voiceTone,
    personalityTags: member.personalityTags,
    expertise: member.expertise,
    diaryEntries: member.diaryEntries,
    conditions: [],
    hasIncoming: false,
    canCommunicate: member.canCommunicate,
    lastContactTime: member.lastContactTime,
    unavailable: member.unavailable,
  };
}

function getMapTileDisplayCoord(tileId: string) {
  const tile = defaultMapConfig.tiles.find((item) => item.id === tileId);
  const origin = parseTileId(defaultMapConfig.originTileId);
  if (!tile || !origin) {
    return tileId;
  }

  const coord = getDisplayCoord(tile, origin);
  return `(${coord.displayX},${coord.displayY})`;
}

function getInitialStatus(member: CrewDefinition) {
  switch (member.status) {
    case "moving":
      return "正在前往目标地点，行进中。";
    case "working":
      return "工作中。";
    case "lost":
      return "失联。";
    case "dead":
      return "不可用。";
    case "idle":
    default:
      return "待命中。";
  }
}
