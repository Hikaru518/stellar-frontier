import { eventDefinitionById, eventDefinitions, itemDefinitionById, type EventChoiceDefinition, type EventDefinition, type EventEffectDefinition, type TriggerSource } from "./content/contentData";
import type { ActiveAction, CrewMember, MapTile, ResourceSummary, SystemLog, Tone } from "./data/gameData";
import { addInventoryItem, useInventoryItemByTag, type InventoryEntry } from "./inventorySystem";
import { formatGameTime } from "./timeSystem";

export type EventHistory = Record<string, number>;

export interface EventDecisionResult {
  status: string;
  summary: string;
  result: string;
  log: string;
  tone: Tone;
  location?: string;
  coord?: string;
  activeAction?: ActiveAction;
  clearAction?: boolean;
  emergencySettled?: boolean;
  advanceSeconds?: number;
  unavailable?: boolean;
  canCommunicate?: boolean;
  conditions?: string[];
  tileUpdate?: {
    id: string;
    patch: Partial<MapTile>;
  };
  inventory?: InventoryEntry[];
  baseInventory?: InventoryEntry[];
  resources?: ResourceSummary;
  logs?: SystemLog[];
}

interface TriggerEventOptions {
  member: CrewMember;
  source: TriggerSource;
  elapsedGameSeconds: number;
  tiles: MapTile[];
  resources: ResourceSummary;
  logs: SystemLog[];
  eventHistory: EventHistory;
  baseInventory: InventoryEntry[];
}

interface EffectExecutionResult {
  member: CrewMember;
  tiles: MapTile[];
  resources: ResourceSummary;
  logs: SystemLog[];
  baseInventory: InventoryEntry[];
}

export function getEmergencyEventDefinition(member: CrewMember) {
  return member.emergencyEvent ? eventDefinitionById.get(member.emergencyEvent.eventId) : undefined;
}

export function getEmergencyChoices(member: CrewMember) {
  return getEmergencyEventDefinition(member)?.choices ?? [];
}

export function triggerEvents(options: TriggerEventOptions) {
  const tile = options.tiles.find((item) => item.id === options.member.currentTile);
  if (!tile) {
    return { ...options, member: options.member, changed: false };
  }

  const candidates = eventDefinitions
    .filter((event) => event.trigger.source === options.source)
    .filter((event) => matchesTile(event, tile))
    .filter((event) => isEventAvailable(event, options.member, tile, options.eventHistory, options.elapsedGameSeconds))
    .map((event) => ({ event, chance: getFinalChance(event, options.member, tile, options.eventHistory) }))
    .filter(({ event, chance }) => chance >= getDeterministicRoll(`${event.eventId}:${options.member.id}:${tile.id}:${options.source}:${options.elapsedGameSeconds}`))
    .sort((a, b) => b.event.priority - a.event.priority);

  const selected = candidates[0]?.event;
  if (!selected) {
    return { ...options, member: options.member, changed: false };
  }

  const applied = executeEventEffects({
    event: selected,
    effects: selected.effects,
    member: options.member,
    tile,
    tiles: options.tiles,
    resources: options.resources,
    logs: options.logs,
    baseInventory: options.baseInventory,
    elapsedGameSeconds: options.elapsedGameSeconds,
  });

  return {
    ...options,
    ...applied,
    eventHistory: {
      ...options.eventHistory,
      [getHistoryKey(selected, options.member, tile)]: options.elapsedGameSeconds,
    },
    changed: true,
  };
}

export function resolveEmergencyChoice(
  member: CrewMember,
  choiceId: string,
  elapsedGameSeconds: number,
  resources: ResourceSummary,
  baseInventory: InventoryEntry[],
  logs: SystemLog[],
  tiles: MapTile[],
): EventDecisionResult | null {
  const event = getEmergencyEventDefinition(member);
  const choice = event?.choices.find((item) => item.choiceId === choiceId);
  if (!event || !choice || !member.emergencyEvent) {
    return null;
  }

  const succeeded = isChoiceSuccess(event, choice, member.emergencyEvent.dangerStage, elapsedGameSeconds);
  const effects = choice.effects ?? (succeeded ? choice.successEffects ?? [] : choice.failureEffects ?? []);
  const tile = tiles.find((item) => item.id === member.currentTile);
  if (!tile) {
    return null;
  }

  const applied = executeEventEffects({
    event,
    effects,
    member,
    tile,
    tiles,
    resources,
    logs,
    baseInventory,
    elapsedGameSeconds,
    appendDefaultLog: false,
  });
  const summary = getChoiceSummary(choice, effects, succeeded);
  const logEffect = effects.find((effect) => effect.type === "addLog" && effect.text);
  const crewStatusEffect = effects.find((effect) => effect.type === "updateCrewStatus");
  const conditionEffect = effects.find((effect) => effect.type === "addCrewCondition" && effect.condition);
  const tileEffect = effects.find((effect) => effect.type === "updateTile" && effect.field);
  const nextMember = applied.member;
  const nextStatus = getDisplayStatus(crewStatusEffect?.status, conditionEffect?.condition, succeeded);
  const tone = getChoiceTone(choice, crewStatusEffect?.status, conditionEffect?.condition, succeeded);

  return {
    status: nextStatus,
    summary,
    result: summary,
    log: logEffect?.text ?? `${member.name} 处理了事件：${event.title}。`,
    tone,
    emergencySettled: choice.durationSeconds ? false : true,
    advanceSeconds: choice.durationSeconds,
    unavailable: nextMember.unavailable,
    canCommunicate: nextMember.canCommunicate,
    conditions: nextMember.conditions,
    inventory: nextMember.inventory,
    baseInventory: applied.baseInventory,
    resources: applied.resources,
    logs: applied.logs === logs ? undefined : applied.logs,
    clearAction: true,
    tileUpdate: tileEffect
      ? {
          id: member.currentTile,
          patch: createTilePatch(tileEffect),
        }
      : undefined,
  };
}

export function createAutoEmergencyDecision(
  member: CrewMember,
  elapsedGameSeconds: number,
  resources: ResourceSummary,
  baseInventory: InventoryEntry[],
  logs: SystemLog[],
  tiles: MapTile[],
): EventDecisionResult | null {
  const event = getEmergencyEventDefinition(member);
  const autoChoice = event?.emergency?.autoResolveResult;
  return autoChoice ? resolveEmergencyChoice(member, autoChoice, elapsedGameSeconds, resources, baseInventory, logs, tiles) : null;
}

export function executeEventEffects({
  event,
  effects,
  member,
  tile,
  tiles,
  resources,
  logs,
  baseInventory,
  elapsedGameSeconds,
  appendDefaultLog = true,
}: {
  event: EventDefinition;
  effects: EventEffectDefinition[];
  member: CrewMember;
  tile: MapTile;
  tiles: MapTile[];
  resources: ResourceSummary;
  logs: SystemLog[];
  baseInventory: InventoryEntry[];
  elapsedGameSeconds: number;
  appendDefaultLog?: boolean;
}): EffectExecutionResult {
  let nextMember = member;
  let nextTiles = tiles;
  let nextResources = resources;
  let nextLogs = logs;
  let nextBaseInventory = baseInventory;

  for (const effect of effects) {
    if (effect.type === "addResource" && effect.resource && effect.amount) {
      nextResources = addResource(nextResources, effect.resource, effect.amount);
    }

    if (effect.type === "removeResource" && effect.resource && effect.amount) {
      nextResources = addResource(nextResources, effect.resource, -effect.amount);
    }

    if (effect.type === "addItem" && effect.itemId) {
      const amount = effect.amount ?? 1;
      if (effect.target === "baseInventory") {
        const next = addBaseInventoryItem(nextBaseInventory, nextResources, effect.itemId, amount);
        nextBaseInventory = next.baseInventory;
        nextResources = next.resources;
      } else {
        nextMember = { ...nextMember, inventory: addInventoryItem(nextMember.inventory, effect.itemId, amount) };
      }
    }

    if (effect.type === "useItemByTag" && effect.itemTag) {
      const result = useInventoryItemByTag(nextMember.inventory, effect.itemTag);
      if (result.available) {
        nextMember = { ...nextMember, inventory: result.inventory };
        nextLogs = appendLogEntry(
          nextLogs,
          `${nextMember.name} 使用了${result.item?.name ?? result.entry?.itemId ?? effect.itemTag}${result.consumed ? "，道具已消耗。" : "，道具未消耗。"}`,
          "accent",
          elapsedGameSeconds,
        );
      } else {
        nextLogs = appendLogEntry(nextLogs, `${nextMember.name} 无法使用${effect.itemTag}道具：${result.reason ?? "没有可用道具。"}`, "muted", elapsedGameSeconds);
      }
    }

    if (effect.type === "discoverResource" && effect.resource) {
      const resourceName = getResourceName(effect.resource);
      nextTiles = patchTile(nextTiles, tile.id, { resources: addUnique(tile.resources, resourceName), status: `发现${resourceName}` });
    }

    if (effect.type === "updateTile" && effect.field) {
      nextTiles = patchTile(nextTiles, tile.id, createTilePatch(effect));
    }

    if (effect.type === "updateCrewStatus" && effect.status) {
      nextMember = {
        ...nextMember,
        status: getStatusText(effect.status, event.title),
        statusTone: effect.status === "lost" || effect.status === "dead" || effect.status === "inEvent" ? "danger" : nextMember.statusTone,
        hasIncoming: effect.status === "inEvent" ? true : nextMember.hasIncoming,
        canCommunicate: effect.status === "lost" || effect.status === "dead" ? false : nextMember.canCommunicate,
        unavailable: effect.status === "lost" || effect.status === "dead" ? true : nextMember.unavailable,
      };
    }

    if (effect.type === "addCrewCondition" && effect.condition) {
      nextMember = { ...nextMember, conditions: addUnique(nextMember.conditions, effect.condition) };
    }

    if (effect.type === "startEmergency" && event.emergency) {
      nextMember = {
        ...nextMember,
        hasIncoming: true,
        emergencyEvent: {
          instanceId: `${nextMember.id}-${event.eventId}-${elapsedGameSeconds}`,
          eventId: event.eventId,
          createdAt: elapsedGameSeconds,
          callReceivedTime: elapsedGameSeconds,
          dangerStage: 0,
          nextEscalationTime: elapsedGameSeconds + event.emergency.firstWaitSeconds,
          deadlineTime: elapsedGameSeconds + event.emergency.deadlineSeconds,
          settled: false,
        },
      };
    }

    if (effect.type === "addLog" && effect.text) {
      nextLogs = appendLogEntry(nextLogs, effect.text, effect.tone ?? "neutral", elapsedGameSeconds);
    }
  }

  if (appendDefaultLog && !effects.some((effect) => effect.type === "addLog")) {
    nextLogs = appendLogEntry(nextLogs, `${nextMember.name} 触发事件：${event.title}。`, event.type === "emergency" ? "danger" : "neutral", elapsedGameSeconds);
  }

  return { member: nextMember, tiles: nextTiles, resources: nextResources, logs: nextLogs, baseInventory: nextBaseInventory };
}

function addBaseInventoryItem(baseInventory: InventoryEntry[], resources: ResourceSummary, itemId: string, amount: number) {
  const nextBaseInventory = addInventoryItem(baseInventory, itemId, amount);
  const resourceKey = getResourceKey(itemId);

  return {
    baseInventory: nextBaseInventory,
    resources: resourceKey === "iron" || resourceKey === "wood" ? addResource(resources, itemId, amount) : resources,
  };
}

function matchesTile(event: EventDefinition, tile: MapTile) {
  const tileTypes = event.trigger.tileTypes;
  if (!tileTypes || tileTypes.length === 0) {
    return true;
  }

  const tags = getTileTags(tile);
  return tileTypes.some((type) => tags.has(type));
}

function isEventAvailable(event: EventDefinition, member: CrewMember, tile: MapTile, history: EventHistory, elapsedGameSeconds: number) {
  const key = getHistoryKey(event, member, tile);
  const lastTriggered = history[key];
  if (!event.repeatable && lastTriggered !== undefined) {
    return false;
  }
  if (event.repeatable && lastTriggered !== undefined && elapsedGameSeconds - lastTriggered < event.cooldownSeconds) {
    return false;
  }

  return event.conditions.every((condition) => evaluateCondition(condition, event, member, tile, history));
}

function getFinalChance(event: EventDefinition, member: CrewMember, tile: MapTile, history: EventHistory) {
  const modifier = event.modifiers.reduce(
    (total, item) => total + (evaluateCondition(item.condition, event, member, tile, history) ? item.chance : 0),
    0,
  );
  return clamp(event.baseChance + modifier, 0, 1);
}

function evaluateCondition(condition: string, event: EventDefinition, member: CrewMember, tile: MapTile, history: EventHistory) {
  if (condition === "") {
    return true;
  }

  const skillMatch = condition.match(/^crew\.skills\.has\(([a-z][a-z0-9_]*)\)$/);
  if (skillMatch) {
    return member.skills.includes(skillMatch[1]);
  }

  const inventoryMatch = condition.match(/^inventory\.has\(([a-z][a-z0-9_]*)\)$/);
  if (inventoryMatch) {
    return member.inventory.some((entry) => entry.itemId === inventoryMatch[1] && entry.quantity > 0);
  }

  const conditionMatch = condition.match(/^crew\.conditions\.has\(([a-z][a-z0-9_]*)\)$/);
  if (conditionMatch) {
    return member.conditions.includes(conditionMatch[1]);
  }

  const notTriggeredMatch = condition.match(/^notTriggered\(([a-z][a-z0-9_]*)\)$/);
  if (notTriggeredMatch) {
    return !Object.keys(history).some((key) => key.startsWith(`${notTriggeredMatch[1]}:`));
  }

  const comparisonMatch = condition.match(/^([a-zA-Z0-9_.]+)\s*(==|!=|>=|<=|>|<)\s*([a-zA-Z0-9_.]+)$/);
  if (comparisonMatch) {
    const [, leftPath, operator, rawRight] = comparisonMatch;
    const left = resolveValue(leftPath, event, member, tile);
    const right = parseValue(rawRight, event, member, tile);
    return compareValues(left, operator, right);
  }

  return false;
}

function resolveValue(path: string, event: EventDefinition, member: CrewMember, tile: MapTile): unknown {
  if (path === "crew.status") {
    return getCrewRuleStatus(member);
  }
  if (path.startsWith("crew.attributes.")) {
    return member.attributes[path.slice("crew.attributes.".length) as keyof CrewMember["attributes"]];
  }
  if (path === "tile.dangerLevel") {
    return tile.danger === "未发现即时危险" || tile.danger === "未知详情" ? 0 : 2;
  }
  if (path === "tile.resourceRemaining.wood") {
    return tile.resources.includes("木材") ? 1 : 0;
  }
  if (path === "tile.discoveredResources.water") {
    return tile.resources.includes("水") || tile.resources.includes("水域");
  }
  if (path === "event.eventId") {
    return event.eventId;
  }
  return undefined;
}

function parseValue(raw: string, event: EventDefinition, member: CrewMember, tile: MapTile) {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  const number = Number(raw);
  if (Number.isFinite(number)) {
    return number;
  }
  return resolveValue(raw, event, member, tile) ?? raw;
}

function compareValues(left: unknown, operator: string, right: unknown) {
  switch (operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">=":
      return Number(left) >= Number(right);
    case "<=":
      return Number(left) <= Number(right);
    case ">":
      return Number(left) > Number(right);
    case "<":
      return Number(left) < Number(right);
    default:
      return false;
  }
}

function isChoiceSuccess(event: EventDefinition, choice: EventChoiceDefinition, dangerStage: number, elapsedGameSeconds: number) {
  if (choice.baseSuccessChance === undefined) {
    return true;
  }

  const chance = clamp(choice.baseSuccessChance + (choice.dangerStageModifier ?? 0) * dangerStage, 0, 1);
  return getDeterministicRoll(`${event.eventId}:${choice.choiceId}:${dangerStage}:${elapsedGameSeconds}`) <= chance;
}

function getChoiceSummary(choice: EventChoiceDefinition, effects: EventEffectDefinition[], succeeded: boolean) {
  const logEffect = effects.find((effect) => effect.type === "addLog" && effect.text);
  if (logEffect?.text) {
    return logEffect.text;
  }
  return `${choice.text}${choice.baseSuccessChance === undefined ? "已执行。" : succeeded ? "成功。" : "失败。"}`;
}

function getChoiceTone(choice: EventChoiceDefinition, status: string | undefined, condition: string | undefined, succeeded: boolean): Tone {
  if (status === "lost" || status === "dead" || condition?.includes("wound")) {
    return "danger";
  }
  if (choice.tone) {
    return choice.tone;
  }
  return succeeded ? "success" : "danger";
}

function getDisplayStatus(status: string | undefined, condition: string | undefined, succeeded: boolean) {
  if (status === "lost") {
    return "受重伤并失联。";
  }
  if (status === "dead") {
    return "死亡或不可用。";
  }
  if (condition === "light_wound") {
    return "受轻伤，暂时安全。";
  }
  if (condition === "heavy_wound") {
    return "受重伤。";
  }
  return succeeded ? "事件已处理，待命中。" : "事件处理失败，待命中。";
}

function getStatusText(status: string, eventTitle: string) {
  switch (status) {
    case "inEvent":
      return `${eventTitle}，等待指令。`;
    case "idle":
      return "待命中。";
    case "lost":
      return "失联。";
    case "dead":
      return "死亡或不可用。";
    default:
      return "状态已更新。";
  }
}

function getCrewRuleStatus(member: CrewMember) {
  if (member.unavailable) {
    return "lost";
  }
  if (member.emergencyEvent && !member.emergencyEvent.settled) {
    return "inEvent";
  }
  if (member.activeAction?.actionType === "move") {
    return "moving";
  }
  if (member.activeAction) {
    return "working";
  }
  return "idle";
}

function createTilePatch(effect: EventEffectDefinition): Partial<MapTile> {
  if (effect.field === "danger_hint") {
    return { danger: String(effect.value ?? "发现危险迹象") };
  }
  if (effect.field === "survey_note" || effect.field === "lore_note") {
    return { status: String(effect.value ?? "已记录") };
  }
  if (effect.field === "status") {
    return { status: String(effect.value ?? "已更新") };
  }
  if (effect.field === "danger") {
    return { danger: String(effect.value ?? "已更新") };
  }
  return { status: String(effect.value ?? "已更新") };
}

function addResource(resources: ResourceSummary, resourceId: string, amount: number): ResourceSummary {
  const key = getResourceKey(resourceId);
  if (!key) {
    return resources;
  }
  return { ...resources, [key]: Math.max(0, resources[key] + amount) };
}

function getResourceKey(resourceId: string): "iron" | "wood" | "food" | "water" | null {
  if (resourceId === "iron_ore") {
    return "iron";
  }
  if (resourceId === "wood" || resourceId === "food" || resourceId === "water") {
    return resourceId;
  }
  return null;
}

function getResourceName(resourceId: string) {
  return itemDefinitionById.get(resourceId)?.name ?? resourceId;
}

function patchTile(tiles: MapTile[], id: string, patch: Partial<MapTile>) {
  return tiles.map((tile) => (tile.id === id ? { ...tile, ...patch } : tile));
}

function appendLogEntry(logs: SystemLog[], text: string, tone: Tone, elapsedGameSeconds: number) {
  const id = logs.reduce((highest, log) => Math.max(highest, log.id), 0) + 1;
  return [...logs, { id, time: formatGameTime(elapsedGameSeconds), text, tone }];
}

function getHistoryKey(event: EventDefinition, member: CrewMember, tile: MapTile) {
  return `${event.eventId}:${member.id}:${tile.id}`;
}

function getTileTags(tile: MapTile) {
  const tags = new Set<string>();
  if (tile.terrain.includes("森林")) tags.add("forest");
  if (tile.terrain.includes("丘陵")) tags.add("hill");
  if (tile.terrain.includes("山")) tags.add("mountain");
  if (tile.terrain.includes("沙漠")) tags.add("desert");
  if (tile.terrain.includes("平原") || tile.terrain.includes("空地")) tags.add("plain");
  if (tile.terrain.includes("水")) tags.add("water");
  return tags;
}

function addUnique<T>(items: T[], value: T) {
  return items.includes(value) ? items : [...items, value];
}

function getDeterministicRoll(seed: string) {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
