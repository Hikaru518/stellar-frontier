import handlerRegistryContent from "../../../../content/events/handler_registry.json";
import crewContent from "../../../../content/crew/crew.json";
import itemsContent from "../../../../content/items/items.json";
import defaultMapJson from "../../../../content/maps/default-map.json";
import type { EventContentLibrary } from "../events/contentIndex";
import type { HandlerDefinition } from "../events/types";
import {
  generatedCallTemplates,
  generatedEventDomains,
  generatedEventProgramDefinitions,
  generatedPresetDefinitions,
} from "./generated/eventContentManifest";

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
export type MapSpecialStateSeverity = "low" | "medium" | "high" | "critical";

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

export type CrewDefinitionId = "mike" | "amy" | "garry";

export interface CrewDefinition {
  crewId: CrewDefinitionId;
  name: string;
  role: string;
  currentTile: string;
  status: CrewStatus;
  statusTone: Tone;
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
  /** Identifiers into `mapObjectDefinitionById` (the only authoritative pointer to map-object content). */
  objectIds: string[];
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

export const eventProgramDefinitions = generatedEventProgramDefinitions;
export const callTemplates = generatedCallTemplates;
export const handlerDefinitions = handlerRegistryContent.handlers as unknown as HandlerDefinition[];
export const presetDefinitions = generatedPresetDefinitions;
export const eventContentLibrary: EventContentLibrary = {
  domains: generatedEventDomains,
  event_definitions: eventProgramDefinitions,
  call_templates: callTemplates,
  handlers: handlerDefinitions,
  presets: presetDefinitions,
};

export const crewDefinitions = crewContent.crew as unknown as CrewDefinition[];
export const itemDefinitions = itemsContent.items as unknown as ItemDefinition[];

export const defaultMapConfig: MapConfigDefinition = normalizeMapConfig(defaultMapJson as unknown as MapConfigDefinition);

export const itemDefinitionById = new Map(itemDefinitions.map((item) => [item.itemId, item]));

export function formatInventory(entries: Array<{ itemId: string; quantity: number }>) {
  return entries.map((entry) => {
    const item = itemDefinitionById.get(entry.itemId);
    const name = item?.name ?? entry.itemId;
    return entry.quantity > 1 ? `${name} x${entry.quantity}` : name;
  });
}

/**
 * Defensive normalization of the migrated map JSON: ensures every tile has an
 * `objectIds` array (defaulting to `[]`). All consumers should now read
 * `tile.objectIds` and resolve definitions via `mapObjectDefinitionById`; the
 * legacy synthesised `tile.objects` projection has been removed.
 */
function normalizeMapConfig(rawConfig: MapConfigDefinition): MapConfigDefinition {
  return {
    ...rawConfig,
    tiles: rawConfig.tiles.map((tile) => ({
      ...tile,
      objectIds: Array.isArray(tile.objectIds) ? tile.objectIds : [],
    })),
  };
}
