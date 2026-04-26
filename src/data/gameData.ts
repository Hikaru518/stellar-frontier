import {
  crewDefinitions,
  eventDefinitionById,
  formatInventory,
  type CrewDefinition,
  type CrewProfile,
  type DiaryEntryDefinition,
  type ExpertiseDefinition,
} from "../content/contentData";

export type PageId = "control" | "station" | "call" | "map";

export type CrewId = "mike" | "amy" | "garry" | "lin_xia" | "kael";

export type Tone = "neutral" | "muted" | "accent" | "danger" | "success";

export type CallType = "normal" | "emergency";

export type MapReturnTarget = "control" | "call";

export type ActionType = "move" | "gather" | "build" | "survey" | "standby" | "event";

export type ActionStatus = "pending" | "inProgress" | "completed" | "interrupted" | "failed";

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
}

export interface EmergencyEvent {
  instanceId: string;
  eventId: string;
  createdAt: number;
  callReceivedTime: number;
  dangerStage: number;
  nextEscalationTime: number;
  deadlineTime: number;
  settled: boolean;
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
  summary: string;
  attributes: CrewDefinition["attributes"];
  skills: string[];
  inventory: Array<{ itemId: string; quantity: number }>;
  profile: CrewProfile;
  voiceTone: string;
  personalityTags: string[];
  expertise: ExpertiseDefinition[];
  diaryEntries: DiaryEntryDefinition[];
  conditions: string[];
  bag: string[];
  hasIncoming: boolean;
  canCommunicate: boolean;
  lastContactTime: number;
  activeAction?: ActiveAction;
  emergencyEvent?: EmergencyEvent;
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
  resources: string[];
  buildings: string[];
  instruments: string[];
  crew: CrewId[];
  danger: string;
  status: string;
  investigated: boolean;
}

export interface SystemLog {
  id: number;
  time: string;
  text: string;
  tone: Tone;
}

export interface CallContext {
  crewId: CrewId;
  type: CallType;
  settled: boolean;
  result?: string;
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

export const initialTiles: MapTile[] = [
  tile("1-1", "(1,1)", 1, 1, "平原"),
  tile("1-2", "(1,2)", 1, 2, "平原"),
  tile("1-3", "(1,3)", 1, 3, "平原"),
  tile("1-4", "(1,4)", 1, 4, "平原"),
  tile("2-1", "(2,1)", 2, 1, "水", ["水域"], [], [], ["mike"], "未发现即时危险", "行进路径"),
  tile("2-2", "(2,2)", 2, 2, "水", ["水域"]),
  tile("2-3", "(2,3)", 2, 3, "森林 / 山", ["木材", "野生动物踪迹"], [], [], ["amy"], "大型野兽接近", "危险"),
  tile("2-4", "(2,4)", 2, 4, "森林 / 山", ["木材"]),
  tile("3-1", "(3,1)", 3, 1, "平原"),
  tile("3-2", "(3,2)", 3, 2, "平原"),
  tile("3-3", "(3,3)", 3, 3, "丘陵", ["铁矿床"], ["采矿厂：铁 #2"], ["水银温度计"], ["garry"], "未发现即时危险", "工作中"),
  tile("3-4", "(3,4)", 3, 4, "丘陵", ["铁矿床"]),
  tile("4-1", "(4,1)", 4, 1, "旧医疗前哨", ["废弃医疗舱"], [], ["扫描器残留信号"], ["lin_xia"], "未发现即时危险", "待命"),
  tile("4-2", "(4,2)", 4, 2, "坠落广播塔", ["断续信号"], [], ["损坏中继器"], ["kael"], "未知回声", "待命"),
  tile("4-3", "(4,3)", 4, 3, "沙漠"),
  tile("4-4", "(4,4)", 4, 4, "沙漠"),
];

export const initialCrew: CrewMember[] = crewDefinitions.map((member) => createInitialCrewMember(member));

export const initialLogs: SystemLog[] = [
  { id: 1, time: "19:42", text: "卫星雷达返回 3 个低置信度信号。", tone: "neutral" },
  { id: 2, time: "19:45", text: "Amy 正在森林中请求接入。", tone: "danger" },
  { id: 3, time: "19:47", text: "咖啡机拒绝说明上次维护日期。", tone: "muted" },
];

export const facilities: Facility[] = [
  { id: "window", label: "窗户", subLabel: "外部能见度：低", variant: "large" },
  { id: "station", label: "通讯台", subLabel: "1 条来电 · Amy" },
  { id: "radar", label: "卫星雷达", subLabel: "地图信号：16 格 / 2 异常" },
  { id: "console", label: "中控台", subLabel: "资源 / 状态 / 统计" },
  { id: "research", label: "研究台", subLabel: "未供电", variant: "locked" },
  { id: "trade", label: "星际贸易", subLabel: "资源交换", variant: "locked" },
  { id: "coffee", label: "咖啡机", subLabel: "自检完成" },
  { id: "record", label: "唱片机", subLabel: "低噪播放" },
  { id: "fridge", label: "冰箱", subLabel: "无限量啤酒" },
  { id: "gate", label: "星际之门", subLabel: "请求总部空投", variant: "large" },
];

export const garryActions: ActionOption[] = [
  { id: "move", label: "请求前往", hint: "先查看地图，再回到通话确认目标。" },
  { id: "build", label: "安装 / 建设", hint: "消耗本地材料，增加设施维护压力。" },
  { id: "standby", label: "停止工作原地待命", hint: "矿物产出会暂停。" },
  { id: "survey", label: "开展调查", hint: "可能发现异常，也可能发现更多问题。" },
];

function tile(
  id: string,
  coord: string,
  row: number,
  col: number,
  terrain: string,
  resources: string[] = [],
  buildings: string[] = [],
  instruments: string[] = [],
  crew: CrewId[] = [],
  danger = "未发现即时危险",
  status = "已发现",
  investigated = true,
): MapTile {
  return {
    id,
    coord,
    row,
    col,
    terrain,
    resources,
    buildings,
    instruments,
    crew,
    danger,
    status,
    investigated,
  };
}

function createInitialCrewMember(member: CrewDefinition): CrewMember {
  const tile = initialTiles.find((item) => item.id === member.currentTile);
  const emergencyDefinition = member.emergencyEvent ? eventDefinitionById.get(member.emergencyEvent.eventId) : undefined;
  const emergency = member.emergencyEvent && emergencyDefinition?.emergency;
  const activeAction = member.activeAction ? createInitialAction(member, member.activeAction) : undefined;

  return {
    id: member.crewId as CrewId,
    name: member.name,
    role: member.role,
    currentTile: member.currentTile,
    location: tile ? getTileLocation(tile) : member.currentTile,
    coord: tile?.coord ?? member.currentTile,
    status: getInitialStatus(member),
    statusTone: member.statusTone,
    summary: member.summary,
    attributes: member.attributes,
    skills: member.skills,
    inventory: member.inventory,
    profile: member.profile,
    voiceTone: member.voiceTone,
    personalityTags: member.personalityTags,
    expertise: member.expertise,
    diaryEntries: member.diaryEntries,
    conditions: [],
    bag: formatInventory(member.inventory),
    hasIncoming: Boolean(member.emergencyEvent),
    canCommunicate: member.canCommunicate,
    lastContactTime: member.lastContactTime,
    activeAction,
    emergencyEvent:
      member.emergencyEvent && emergency
        ? {
            instanceId: `${member.crewId}-${member.emergencyEvent.eventId}-0`,
            eventId: member.emergencyEvent.eventId,
            createdAt: 0,
            callReceivedTime: 0,
            dangerStage: member.emergencyEvent.dangerStage,
            nextEscalationTime: emergency.firstWaitSeconds,
            deadlineTime: member.emergencyEvent.deadlineSeconds,
            settled: false,
          }
        : undefined,
    unavailable: member.unavailable,
  };
}

function createInitialAction(member: CrewDefinition, action: NonNullable<CrewDefinition["activeAction"]>): ActiveAction {
  return {
    id: `${member.crewId}-${action.actionType}-${action.targetTile}`,
    actionType: action.actionType,
    status: action.status,
    startTime: 0,
    durationSeconds: action.durationSeconds,
    finishTime: action.durationSeconds,
    fromTile: member.currentTile,
    targetTile: action.targetTile,
    route: action.actionType === "move" ? [action.targetTile] : undefined,
    routeStepIndex: action.actionType === "move" ? 0 : undefined,
    stepStartedAt: action.actionType === "move" ? 0 : undefined,
    stepFinishTime: action.actionType === "move" ? action.durationSeconds : undefined,
    totalDurationSeconds: action.actionType === "move" ? action.durationSeconds : undefined,
    resource: action.resourceId,
    perRoundYield: action.resourceId === "iron_ore" ? 5 : undefined,
  };
}

function getInitialStatus(member: CrewDefinition) {
  switch (member.status) {
    case "moving":
      return "正在前往目标地点，行进中。";
    case "working":
      return member.activeAction?.actionType === "gather" ? "在矿床，采矿中。" : "工作中。";
    case "inEvent":
      return "遭遇紧急事件，等待指令。";
    case "lost":
      return "失联。";
    case "dead":
      return "不可用。";
    case "idle":
    default:
      return "待命中。";
  }
}

function getTileLocation(tile: MapTile) {
  return tile.resources[0] ?? tile.terrain;
}
