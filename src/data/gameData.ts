export type PageId = "control" | "station" | "call" | "map";

export type CrewId = "mike" | "amy" | "garry";

export type Tone = "neutral" | "muted" | "accent" | "danger" | "success";

export type CallType = "normal" | "emergency";

export type MapReturnTarget = "control" | "call";

export type ActionType = "move" | "gather" | "build" | "survey" | "standby";

export type ActionStatus = "inProgress" | "completed" | "interrupted" | "failed";

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
  resource?: "iron" | "wood" | "food" | "water";
  perRoundYield?: number;
}

export interface EmergencyEvent {
  eventStartTime: number;
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
  baseIntegrity: 71,
  sol: 37,
  power: 62,
  commWindow: "不稳定",
};

export const initialCrew: CrewMember[] = [
  {
    id: "mike",
    name: "Mike",
    role: "特战干员",
    currentTile: "1-1",
    location: "平原前哨",
    coord: "(1,1)",
    status: "正在前往湖泊，行进中。",
    statusTone: "muted",
    summary: "上次回报：水面比地图记录近了 19 米。",
    bag: ["折叠步枪", "信号弹 x2", "旧式指南针", "压缩饼干"],
    hasIncoming: false,
    canCommunicate: true,
    lastContactTime: 0,
    activeAction: {
      id: "mike-move-lake",
      actionType: "move",
      status: "inProgress",
      startTime: 0,
      durationSeconds: 60,
      finishTime: 60,
      fromTile: "1-1",
      targetTile: "2-1",
      route: ["2-1"],
      routeStepIndex: 0,
      stepStartedAt: 0,
      stepFinishTime: 60,
      totalDurationSeconds: 60,
    },
  },
  {
    id: "amy",
    name: "Amy",
    role: "千金大小姐",
    currentTile: "2-3",
    location: "森林",
    coord: "(2,3)",
    status: "森林，正在和熊搏斗。",
    statusTone: "danger",
    summary: "最近一次通讯：非常不礼貌的求救。",
    bag: ["香水", "急救针", "半块巧克力", "总部信用凭证"],
    hasIncoming: true,
    canCommunicate: true,
    lastContactTime: 0,
    emergencyEvent: {
      eventStartTime: 0,
      callReceivedTime: 0,
      dangerStage: 0,
      nextEscalationTime: 30,
      deadlineTime: 120,
      settled: false,
    },
  },
  {
    id: "garry",
    name: "Garry",
    role: "退休老大爷",
    currentTile: "3-3",
    location: "矿床",
    coord: "(3,3)",
    status: "在矿床，采矿中。",
    statusTone: "muted",
    summary: "上次回报：铁矿产出稳定，抱怨也稳定。",
    bag: ["矿镐", "水银温度计", "旧烟斗", "铁矿样本 x4"],
    hasIncoming: false,
    canCommunicate: true,
    lastContactTime: 0,
    activeAction: {
      id: "garry-mine-iron",
      actionType: "gather",
      status: "inProgress",
      startTime: 0,
      durationSeconds: 300,
      finishTime: 300,
      fromTile: "3-3",
      targetTile: "3-3",
      resource: "iron",
      perRoundYield: 5,
    },
  },
];

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
  tile("4-1", "(4,1)", 4, 1, "空地", [], [], [], [], "未知详情", "未调查", false),
  tile("4-2", "(4,2)", 4, 2, "空地", [], [], [], [], "未知详情", "未调查", false),
  tile("4-3", "(4,3)", 4, 3, "沙漠"),
  tile("4-4", "(4,4)", 4, 4, "沙漠"),
];

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

export const amyActions: ActionOption[] = [
  { id: "run", label: "快跑（资源中断）", tone: "accent" },
  { id: "fight", label: "跟他爆了（可能会死）", tone: "danger" },
  { id: "wait", label: "先稳住！我考虑一下", hint: "风险：等待会推进倒计时。", tone: "danger" },
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
