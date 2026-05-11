import handlerRegistryContent from "../../../../content/events/handler_registry.json";
import eventManifest from "../../../../content/events/manifest.json";
import crewContent from "../../../../content/crew/crew.json";
import itemsContent from "../../../../content/items/items.json";
import defaultMapJson from "../../../../content/maps/default-map.json";
import type { EventContentLibrary } from "../events/contentIndex";
import type { CallTemplate, EventDefinition, HandlerDefinition, PresetDefinition } from "../events/types";

interface EventManifestContent {
  schema_version: "event-manifest.v1";
  domains: EventManifestDomain[];
}

interface EventManifestDomain {
  id: string;
  definitions: string;
  call_templates: string;
  presets: string | null;
}

interface EventDefinitionsContent {
  event_definitions: EventDefinition[];
}

interface CallTemplatesContent {
  call_templates: CallTemplate[];
}

interface PresetsContent {
  presets: PresetDefinition[];
}

interface QuestsContent {
  schema_version: "quests.v1";
  quests: QuestDefinition[];
}

const eventDefinitionModules = import.meta.glob("../../../../content/events/definitions/*.json", {
  eager: true,
  import: "default",
}) as Record<string, EventDefinitionsContent>;

const callTemplateModules = import.meta.glob("../../../../content/events/call_templates/*.json", {
  eager: true,
  import: "default",
}) as Record<string, CallTemplatesContent>;

const presetModules = import.meta.glob("../../../../content/events/presets/*.json", {
  eager: true,
  import: "default",
}) as Record<string, PresetsContent>;

const questModules = import.meta.glob("../../../../content/quests/*.json", {
  eager: true,
  import: "default",
}) as Record<string, QuestsContent>;

const radarModules = import.meta.glob("../../../../content/maps/radar/*.json", {
  eager: true,
  import: "default",
}) as Record<string, RadarContentDefinition>;

const eventManifestContent = eventManifest as EventManifestContent;
const eventManifestDomains = eventManifestContent.domains;

function eventContentModulePath(manifestPath: string): string {
  return `../../../../content/events/${manifestPath}`;
}

function readManifestContentFile<T>(modules: Record<string, T>, manifestPath: string): T {
  const modulePath = eventContentModulePath(manifestPath);
  const content = modules[modulePath];

  if (!content) {
    throw new Error(`Missing structured event content file listed in content/events/manifest.json: ${manifestPath}`);
  }

  return content;
}

export type Tone = "neutral" | "muted" | "accent" | "danger" | "success";
export type CrewStatus = "idle" | "moving" | "working" | "lost" | "dead";
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
}

export type RadarToneKey = "g" | "d" | "c" | "a" | "w" | "s" | "r" | string;

export interface RadarWorldDefinition {
  width: number;
  height: number;
  origin: {
    x: number;
    y: number;
  };
}

export interface RadarSymbolDefinition {
  glyph: string;
  tone: RadarToneKey;
}

export type RadarRegionShapeDefinition =
  | { type: "circle"; x: number; y: number; radius: number }
  | { type: "box"; x1: number; y1: number; x2: number; y2: number };

export interface RadarRegionDefinition {
  id: string;
  label: string;
  priority: number;
  shape: RadarRegionShapeDefinition;
  tone: RadarToneKey;
}

export interface RadarTraceDefinition {
  layerNotice: string;
  controlMode: string;
  callMode: string;
  worldLine: string;
  jsonLine: string;
  emptyLine: string;
}

export interface RadarDefinition {
  world: RadarWorldDefinition;
  glyphRows: string[];
  toneRows: string[];
  palette: Record<RadarToneKey, string>;
  symbols: {
    crew: RadarSymbolDefinition;
    focus: RadarSymbolDefinition;
  };
  trace: RadarTraceDefinition;
  regions: RadarRegionDefinition[];
}

export interface RadarContentDefinition extends RadarDefinition {
  $schema?: string;
  mapId: string;
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

export interface MapConfigJsonDefinition {
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
  radarPath: string;
  tiles: MapTileDefinition[];
}

export interface MapConfigDefinition extends MapConfigJsonDefinition {
  radar: RadarDefinition;
}

export type QuestCategory = "main" | "side";

export type QuestNavigationEntry =
  | { type: "page"; label: string; page: "control" | "station" | "map" }
  | { type: "tile"; label: string; tile_id: string }
  | { type: "crew"; label: string; crew_id: string };

export interface QuestProgressNodeDefinition {
  id: string;
  type?: "progress";
  description: string;
}

export interface QuestCompletedNodeDefinition {
  id: string;
  type: "completed";
  title: string;
  summary: string;
  outcomes?: string[];
}

export type QuestNodeDefinition = QuestProgressNodeDefinition | QuestCompletedNodeDefinition;

export interface QuestTodoDefinition {
  id: string;
  title: string;
  description?: string;
  visible_after_node?: string;
  navigation?: QuestNavigationEntry[];
}

export interface QuestCompletionResultDefinition {
  title: string;
  summary: string;
  outcomes?: string[];
}

export interface SubquestDefinition {
  id: string;
  title: string;
  summary: string;
  initial_node_id: string;
  nodes: QuestNodeDefinition[];
  todos: QuestTodoDefinition[];
  navigation?: QuestNavigationEntry[];
}

export interface QuestDefinition {
  id: string;
  category: QuestCategory;
  title: string;
  summary: string;
  description: string;
  initial_node_id: string;
  completed_node_id?: string;
  nodes: QuestNodeDefinition[];
  todos?: QuestTodoDefinition[];
  subquests?: SubquestDefinition[];
  navigation?: QuestNavigationEntry[];
}

export const eventProgramDefinitions = eventManifestDomains.flatMap(
  (domain) => readManifestContentFile(eventDefinitionModules, domain.definitions).event_definitions,
);

export const callTemplates = eventManifestDomains.flatMap(
  (domain) => readManifestContentFile(callTemplateModules, domain.call_templates).call_templates,
);

export const handlerDefinitions = handlerRegistryContent.handlers as unknown as HandlerDefinition[];

export const presetDefinitions = eventManifestDomains.flatMap((domain) =>
  domain.presets ? readManifestContentFile(presetModules, domain.presets).presets : [],
);

export const questDefinitions = Object.keys(questModules)
  .sort()
  .flatMap((modulePath) => questModules[modulePath].quests);

export const eventContentLibrary: EventContentLibrary = {
  domains: eventManifestDomains.map((domain) => domain.id),
  event_definitions: eventProgramDefinitions,
  call_templates: callTemplates,
  handlers: handlerDefinitions,
  presets: presetDefinitions,
};

export const crewDefinitions = crewContent.crew as unknown as CrewDefinition[];
export const itemDefinitions = itemsContent.items as unknown as ItemDefinition[];

export const defaultMapConfig: MapConfigDefinition = normalizeMapConfig(defaultMapJson as unknown as MapConfigJsonDefinition);

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
 * old synthesised `tile.objects` projection has been removed.
 */
function normalizeMapConfig(rawConfig: MapConfigJsonDefinition): MapConfigDefinition {
  const radarContent = readRadarContent(rawConfig);
  return {
    ...rawConfig,
    radar: stripRadarContentMetadata(radarContent),
    tiles: rawConfig.tiles.map((tile) => ({
      ...tile,
      objectIds: Array.isArray(tile.objectIds) ? tile.objectIds : [],
    })),
  };
}

function readRadarContent(mapConfig: MapConfigJsonDefinition): RadarContentDefinition {
  const modulePath = contentModulePath(mapConfig.radarPath);
  const radarContent = radarModules[modulePath];
  if (!radarContent) {
    throw new Error(`Missing map radar content file listed by ${mapConfig.id}: ${mapConfig.radarPath}`);
  }
  if (radarContent.mapId !== mapConfig.id) {
    throw new Error(`Map radar content ${mapConfig.radarPath} belongs to ${radarContent.mapId}, expected ${mapConfig.id}.`);
  }
  return radarContent;
}

function stripRadarContentMetadata(radarContent: RadarContentDefinition): RadarDefinition {
  const radar = { ...radarContent } as Partial<RadarContentDefinition>;
  delete radar.$schema;
  delete radar.mapId;
  return radar as RadarDefinition;
}

function contentModulePath(contentPath: string): string {
  return `../../../../${contentPath}`;
}
