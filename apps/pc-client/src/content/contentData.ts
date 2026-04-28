import eventsContent from "../../../../content/events/events.json";
import handlerRegistryContent from "../../../../content/events/handler_registry.json";
import crewContent from "../../../../content/crew/crew.json";
import itemsContent from "../../../../content/items/items.json";
import defaultMapJson from "../../../../content/maps/default-map.json";
import basicCallActionsContent from "../../../../content/call-actions/basic-actions.json";
import objectCallActionsContent from "../../../../content/call-actions/object-actions.json";
import { mapObjectDefinitionById as newMapObjectDefinitionById } from "./mapObjects";
import type { EventContentLibrary } from "../events/contentIndex";
import type {
  CallTemplate,
  EventDefinition as ProgramEventDefinition,
  HandlerDefinition,
  PresetDefinition,
} from "../events/types";

type JsonModule<T> = T | { default: T };

const eventDefinitionModules = import.meta.glob("../../../../content/events/definitions/*.json", { eager: true }) as Record<
  string,
  JsonModule<{ event_definitions: unknown[] }>
>;
const callTemplateModules = import.meta.glob("../../../../content/events/call_templates/*.json", { eager: true }) as Record<
  string,
  JsonModule<{ call_templates: unknown[] }>
>;
const presetModules = import.meta.glob("../../../../content/events/presets/*.json", { eager: true }) as Record<
  string,
  JsonModule<{ presets: unknown[] }>
>;

export type Tone = "neutral" | "muted" | "accent" | "danger" | "success";
export type CrewStatus = "idle" | "moving" | "working" | "inEvent" | "lost" | "dead";
export type EventType = "arrival" | "survey" | "idle" | "gather" | "build" | "emergency" | "story" | "reminder";
export type EventScope = "crew" | "tile" | "global";
export type TriggerSource = "arrival" | "surveyComplete" | "gatherComplete" | "buildComplete" | "idleTime" | "callChoice";
export type ActionType = "move" | "gather" | "build" | "survey" | "standby" | "event";
export type ActionStatus = "pending" | "inProgress" | "completed" | "interrupted" | "failed";
export type DiaryAvailability = "delivered" | "pending" | "lostBlocked" | "recovered";
export type MapVisibility = "onDiscovered" | "onInvestigated" | "hidden";
export type MapRadiationLevel = "none" | "low" | "medium" | "high" | "critical";
export type MapObjectKind = "resourceNode" | "structure" | "signal" | "hazard" | "facility" | "ruin" | "landmark";
export type MapCandidateAction = "move" | "survey" | "gather" | "build" | "standby" | "extract" | "scan";
export type MapSpecialStateSeverity = "low" | "medium" | "high" | "critical";
export type CallActionCategory = "universal" | "object_action";
export type CallActionId = MapCandidateAction | "stop";

export interface CrewAttributeMap {
  physical: number;
  agility: number;
  intellect: number;
  perception: number;
  luck: number;
}

export interface CrewProfile {
  originWorld: string;
  originProfession: string;
  experience: string;
  selfIntro: string;
}

export interface ExpertiseRuleEffect {
  type: "surveyBonus";
  resourceId: string;
  amount: number;
  chance: number;
  customLogText: string;
  tileId?: string;
}

export interface ExpertiseDefinition {
  expertiseId: string;
  name: string;
  description: string;
  ruleEffect?: ExpertiseRuleEffect;
}

export interface DiaryEntryDefinition {
  entryId: string;
  triggerNode: string;
  gameSecond: number;
  text: string;
  availability: DiaryAvailability;
}

export interface EventEffectDefinition {
  type:
    | "addResource"
    | "removeResource"
    | "discoverResource"
    | "updateTile"
    | "updateCrewStatus"
    | "addCrewCondition"
    | "startEmergency"
    | "addLog"
    | "addItem"
    | "useItemByTag";
  resource?: string;
  itemId?: string;
  itemTag?: string;
  target?: "crewInventory" | "baseInventory";
  amount?: number;
  quality?: string;
  field?: string;
  value?: unknown;
  status?: CrewStatus;
  condition?: string;
  text?: string;
  tone?: Tone;
}

export interface EventChoiceDefinition {
  choiceId: string;
  text: string;
  hint?: string;
  tone?: Tone;
  baseSuccessChance?: number;
  dangerStageModifier?: number;
  durationSeconds?: number;
  usesItemTag?: string;
  unavailableHint?: string;
  successEffects?: EventEffectDefinition[];
  failureEffects?: EventEffectDefinition[];
  effects?: EventEffectDefinition[];
}

export interface EventDefinition {
  eventId: string;
  title: string;
  type: EventType;
  priority: number;
  scope: EventScope;
  repeatable: boolean;
  cooldownSeconds: number;
  trigger: {
    source: TriggerSource;
    tileTypes?: string[];
    actionTypes?: ActionType[];
    minIdleSeconds?: number;
    surveyLevel?: "quick" | "standard" | "deep";
    choiceId?: string;
  };
  conditions: string[];
  baseChance: number;
  modifiers: Array<{ condition: string; chance: number }>;
  durationSeconds: number;
  effects: EventEffectDefinition[];
  choices: EventChoiceDefinition[];
  emergency?: {
    firstWaitSeconds: number;
    escalationIntervalSeconds: number;
    deadlineSeconds: number;
    autoResolveResult: string;
  } | null;
  resultText: Record<string, string>;
  tags: string[];
}

export interface CrewDefinition {
  crewId: string;
  name: string;
  role: string;
  currentTile: string;
  status: CrewStatus;
  statusTone: Tone;
  summary: string;
  attributes: CrewAttributeMap;
  skills: string[];
  inventory: Array<{ itemId: string; quantity: number }>;
  profile: CrewProfile;
  voiceTone: string;
  personalityTags: string[];
  expertise: ExpertiseDefinition[];
  diaryEntries: DiaryEntryDefinition[];
  canCommunicate: boolean;
  lastContactTime: number;
  activeAction?: {
    actionType: ActionType;
    status: ActionStatus;
    targetTile: string;
    durationSeconds: number;
    resourceId?: string;
  };
  emergencyEvent?: {
    eventId: string;
    dangerStage: number;
    deadlineSeconds: number;
  };
  unavailable?: boolean;
}

export interface ItemDefinition {
  itemId: string;
  name: string;
  category: "tool" | "weapon" | "consumable" | "resource" | "quest" | "misc";
  stackable: boolean;
  maxStack?: number;
  usableInResponse: boolean;
  consumedOnUse: boolean;
  description: string;
  tags: string[];
  effects: Array<{ type: string; target?: string; value?: number; condition?: string }>;
}

export interface MapEnvironmentDefinition {
  temperatureCelsius: number;
  humidityPercent: number;
  magneticFieldMicroTesla: number;
  radiationLevel: MapRadiationLevel;
  toxicityLevel?: MapRadiationLevel;
  atmosphericPressureKpa?: number;
  notes?: string;
}

export interface MapObjectDefinition {
  id: string;
  kind: MapObjectKind;
  name: string;
  description?: string;
  visibility: Exclude<MapVisibility, "hidden">;
  tags?: string[];
  legacyResource?: string;
  legacyBuilding?: string;
  legacyInstrument?: string;
  candidateActions?: MapCandidateAction[];
}

export interface MapSpecialStateDefinition {
  id: string;
  name: string;
  description?: string;
  visibility: MapVisibility;
  severity: MapSpecialStateSeverity;
  tags?: string[];
  startsActive: boolean;
  durationGameSeconds?: number;
  legacyDanger?: string;
}

export interface MapTileDefinition {
  id: string;
  row: number;
  col: number;
  areaName: string;
  terrain: string;
  weather: string;
  environment: MapEnvironmentDefinition;
  /** New schema: identifiers into `mapObjectDefinitionById`. Authoritative going forward. */
  objectIds: string[];
  /**
   * Backwards-compatible legacy projection synthesised from `objectIds` plus the
   * new `mapObjectDefinitionById` index. Task 3 will remove this in favour of
   * direct `objectIds` lookups everywhere.
   * @deprecated use `objectIds` and `mapObjectDefinitionById` instead.
   */
  objects: MapObjectDefinition[];
  specialStates: MapSpecialStateDefinition[];
}

export interface MapConfigDefinition {
  $schema?: string;
  id: string;
  name: string;
  version: number;
  size: {
    rows: number;
    cols: number;
  };
  originTileId: string;
  initialDiscoveredTileIds: string[];
  tiles: MapTileDefinition[];
}

export interface CallActionDef {
  id: CallActionId;
  category: CallActionCategory;
  label: string;
  tone: Tone;
  availableWhenBusy: boolean;
  applicableObjectKinds?: MapObjectKind[];
  durationSeconds: number;
  handler: string;
  params?: Record<string, unknown>;
}

export const eventProgramDefinitions = collectContentArray(eventDefinitionModules, "event_definitions") as unknown as ProgramEventDefinition[];
export const callTemplates = collectContentArray(callTemplateModules, "call_templates") as unknown as CallTemplate[];
export const handlerDefinitions = handlerRegistryContent.handlers as unknown as HandlerDefinition[];
export const presetDefinitions = collectContentArray(presetModules, "presets") as unknown as PresetDefinition[];
export const eventContentLibrary: EventContentLibrary = {
  event_definitions: eventProgramDefinitions,
  call_templates: callTemplates,
  handlers: handlerDefinitions,
  presets: presetDefinitions,
};

export const eventDefinitions = eventsContent.events as unknown as EventDefinition[];
export const crewDefinitions = crewContent.crew as unknown as CrewDefinition[];
export const itemDefinitions = itemsContent.items as unknown as ItemDefinition[];

const KNOWN_CANDIDATE_ACTION_VERBS: ReadonlySet<MapCandidateAction> = new Set([
  "move",
  "survey",
  "gather",
  "build",
  "standby",
  "extract",
  "scan",
]);

export const defaultMapConfig: MapConfigDefinition = projectDefaultMapConfig(defaultMapJson as unknown as MapConfigDefinition);
export const callActionsContent = [
  ...basicCallActionsContent.call_actions,
  ...objectCallActionsContent.call_actions,
] as unknown as CallActionDef[];

export const eventDefinitionById = new Map(eventDefinitions.map((event) => [event.eventId, event]));
export const itemDefinitionById = new Map(itemDefinitions.map((item) => [item.itemId, item]));

export function formatInventory(entries: Array<{ itemId: string; quantity: number }>) {
  return entries.map((entry) => {
    const item = itemDefinitionById.get(entry.itemId);
    const name = item?.name ?? entry.itemId;
    return entry.quantity > 1 ? `${name} x${entry.quantity}` : name;
  });
}

function collectContentArray<T extends string>(modules: Record<string, JsonModule<Record<T, unknown[]>>>, key: T) {
  return Object.keys(modules)
    .sort()
    .flatMap((path) => unwrapJsonModule(modules[path])[key]);
}

function unwrapJsonModule<T extends object>(module: JsonModule<T>): T {
  return "default" in module ? module.default : module;
}

/**
 * Bridge the migrated map JSON (which now stores `tile.objectIds: string[]`)
 * to the legacy `tile.objects` runtime shape consumed by callActions, mapSystem,
 * App.tsx, etc. Task 3 will remove this projection along with the legacy field.
 */
function projectDefaultMapConfig(rawConfig: MapConfigDefinition): MapConfigDefinition {
  return {
    ...rawConfig,
    tiles: rawConfig.tiles.map((tile) => projectTile(tile)),
  };
}

function projectTile(tile: MapTileDefinition): MapTileDefinition {
  const objectIds = Array.isArray(tile.objectIds) ? tile.objectIds : [];
  const objects = objectIds
    .map((id) => projectMapObject(id))
    .filter((object): object is MapObjectDefinition => Boolean(object));
  return {
    ...tile,
    objectIds,
    objects,
  };
}

function projectMapObject(id: string): MapObjectDefinition | undefined {
  const definition = newMapObjectDefinitionById.get(id);
  if (!definition) {
    return undefined;
  }

  const candidateActions = extractCandidateActions(definition);
  const projected: MapObjectDefinition = {
    id: definition.id,
    kind: definition.kind,
    name: definition.name,
    description: definition.description,
    visibility: (definition.visibility === "hidden" ? "onInvestigated" : definition.visibility) as Exclude<MapVisibility, "hidden">,
    tags: definition.tags,
    legacyResource: definition.legacyResource,
    legacyBuilding: definition.legacyBuilding,
    legacyInstrument: definition.legacyInstrument,
  };
  if (candidateActions.length > 0) {
    projected.candidateActions = candidateActions;
  }
  return projected;
}

function extractCandidateActions(definition: { actions?: Array<{ id: string }> }): MapCandidateAction[] {
  if (!Array.isArray(definition.actions)) {
    return [];
  }

  const verbs: MapCandidateAction[] = [];
  for (const action of definition.actions) {
    const colonIndex = action.id.lastIndexOf(":");
    if (colonIndex < 0) {
      continue;
    }
    const verb = action.id.slice(colonIndex + 1) as MapCandidateAction;
    if (!KNOWN_CANDIDATE_ACTION_VERBS.has(verb) || verbs.includes(verb)) {
      continue;
    }
    verbs.push(verb);
  }
  return verbs;
}
