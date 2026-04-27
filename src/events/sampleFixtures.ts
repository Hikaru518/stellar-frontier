import crewKaelCallTemplatesContent from "../../content/events/call_templates/crew_kael.json";
import desertCallTemplatesContent from "../../content/events/call_templates/desert.json";
import forestCallTemplatesContent from "../../content/events/call_templates/forest.json";
import mountainCallTemplatesContent from "../../content/events/call_templates/mountain.json";
import crewKaelDefinitionsContent from "../../content/events/definitions/crew_kael.json";
import desertDefinitionsContent from "../../content/events/definitions/desert.json";
import forestDefinitionsContent from "../../content/events/definitions/forest.json";
import mountainDefinitionsContent from "../../content/events/definitions/mountain.json";
import handlerRegistryContent from "../../content/events/handler_registry.json";
import forestPresetsContent from "../../content/events/presets/forest.json";
import { buildEventContentIndex, type EventContentIndex, type EventContentIndexResult } from "./contentIndex";
import { assignObjective, completeObjective, processEventWakeups, processTrigger, selectCallOption, type EventEngineResult } from "./eventEngine";
import type { GraphRunnerGameState, GraphRunnerResult } from "./graphRunner";
import {
  createEmptyEventRuntimeState,
  type CallTemplate,
  type CrewState,
  type EventDefinition,
  type HandlerDefinition,
  type Id,
  type PresetDefinition,
  type RuntimeEvent,
  type RuntimeEventStatus,
  type TileState,
  type TriggerContext,
} from "./types";

export const SAMPLE_EVENT_IDS = [
  "forest_trace_small_camp",
  "forest_beast_emergency",
  "mountain_signal_probe",
  "volcanic_ash_trace",
  "lost_relic_argument",
] as const;

export type SampleEventId = (typeof SAMPLE_EVENT_IDS)[number];

export type SampleCoverageCategory =
  | "normal_discovery"
  | "emergency_multi_call"
  | "wait_node"
  | "cross_crew_objective"
  | "long_term_consequence";
export type SampleReachability = "manual-reachable" | "seeded-regression" | "future-integration";

export const SAMPLE_EVENT_COVERAGE = {
  normal_discovery: ["forest_trace_small_camp"],
  emergency_multi_call: ["forest_beast_emergency"],
  wait_node: ["mountain_signal_probe"],
  cross_crew_objective: ["volcanic_ash_trace"],
  long_term_consequence: ["lost_relic_argument"],
} satisfies Record<SampleCoverageCategory, readonly SampleEventId[]>;

export const SAMPLE_EVENT_REACHABILITY = {
  forest_trace_small_camp: "seeded-regression",
  forest_beast_emergency: "seeded-regression",
  mountain_signal_probe: "manual-reachable",
  volcanic_ash_trace: "seeded-regression",
  lost_relic_argument: "seeded-regression",
} satisfies Record<SampleEventId, SampleReachability>;

export interface SampleDryRunReport {
  event_definition_id: SampleEventId;
  sample_index: number;
  terminal_status: RuntimeEventStatus | null;
  terminal_node_id: Id | null;
  visited_node_ids: Id[];
  selected_option_ids: Id[];
  objective_ids: Id[];
  errors: string[];
}

const TERMINAL_STATUSES = new Set<RuntimeEventStatus>(["resolved", "cancelled", "expired", "failed"]);
const MAX_DRY_RUN_STEPS = 20;

export function buildSampleEventContentIndex(): EventContentIndexResult {
  return buildEventContentIndex(sampleEventContentLibrary());
}

export function dryRunApprovedSampleEvents(): SampleDryRunReport[] {
  const { index, errors } = buildSampleEventContentIndex();

  if (errors.length > 0) {
    return SAMPLE_EVENT_IDS.map((eventDefinitionId) => ({
      event_definition_id: eventDefinitionId,
      sample_index: 0,
      terminal_status: null,
      terminal_node_id: null,
      visited_node_ids: [],
      selected_option_ids: [],
      objective_ids: [],
      errors: errors.map((error) => `${error.path}: ${error.message}`),
    }));
  }

  return SAMPLE_EVENT_IDS.flatMap((eventDefinitionId) => {
    const definition = index.definitionsById.get(eventDefinitionId);
    if (!definition || definition.status !== "approved") {
      return [missingDefinitionReport(eventDefinitionId)];
    }

    return definition.sample_contexts.map((context, sampleIndex) => dryRunSampleContext(index, definition, context, sampleIndex));
  });
}

function sampleEventContentLibrary() {
  return {
    event_definitions: [
      ...readDefinitions(forestDefinitionsContent),
      ...readDefinitions(mountainDefinitionsContent),
      ...readDefinitions(desertDefinitionsContent),
      ...readDefinitions(crewKaelDefinitionsContent),
    ],
    call_templates: [
      ...readCallTemplates(forestCallTemplatesContent),
      ...readCallTemplates(mountainCallTemplatesContent),
      ...readCallTemplates(desertCallTemplatesContent),
      ...readCallTemplates(crewKaelCallTemplatesContent),
    ],
    handlers: (handlerRegistryContent.handlers ?? []) as HandlerDefinition[],
    presets: (forestPresetsContent.presets ?? []) as PresetDefinition[],
  };
}

function dryRunSampleContext(
  index: EventContentIndex,
  definition: EventDefinition,
  context: TriggerContext,
  sampleIndex: number,
): SampleDryRunReport {
  let state = createSampleState(context);
  let occurredAt = context.occurred_at;
  const visitedNodeIds = new Set<Id>();
  const selectedOptionIds: Id[] = [];
  const objectiveIds: Id[] = [];
  const errors: string[] = [];

  const started = processTrigger({ state, index, context });
  state = started.state;
  collectTransitions(started, visitedNodeIds);
  errors.push(...engineErrors(started));

  let event = findRuntimeEvent(state, started, definition.id);
  if (!event) {
    return report(definition.id as SampleEventId, sampleIndex, null, null, visitedNodeIds, selectedOptionIds, objectiveIds, [
      ...errors,
      `Dry-run did not create runtime event for ${definition.id}.`,
    ]);
  }

  for (let step = 0; step < MAX_DRY_RUN_STEPS; step += 1) {
    event = state.active_events[event.id] ?? event;
    visitedNodeIds.add(event.current_node_id);

    if (TERMINAL_STATUSES.has(event.status)) {
      return report(
        definition.id as SampleEventId,
        sampleIndex,
        event.status,
        event.current_node_id,
        visitedNodeIds,
        selectedOptionIds,
        objectiveIds,
        errors,
      );
    }

    if (event.status === "waiting_call") {
      const call = event.active_call_id ? state.active_calls[event.active_call_id] : undefined;
      const option = call?.available_options.find((candidate) => candidate.is_default) ?? call?.available_options[0];
      if (!call || !option) {
        errors.push(`Event ${event.id} is waiting_call without an available option.`);
        break;
      }

      selectedOptionIds.push(option.option_id);
      const selected = selectCallOption({
        state,
        index,
        call_id: call.id,
        option_id: option.option_id,
        occurred_at: occurredAt + 1,
      });
      state = selected.state;
      occurredAt += 1;
      collectTransitions(selected, visitedNodeIds);
      errors.push(...engineErrors(selected));
      continue;
    }

    if (event.status === "waiting_time") {
      const wakeupAt = event.next_wakeup_at ?? occurredAt + 1;
      const awakened = processEventWakeups({ state, index, elapsed_game_seconds: wakeupAt });
      state = awakened.state;
      occurredAt = wakeupAt;
      collectTransitions(awakened, visitedNodeIds);
      errors.push(...engineErrors(awakened));
      continue;
    }

    if (event.status === "waiting_objective") {
      const objectiveId = event.objective_ids.find((id) => state.objectives[id]?.status !== "completed");
      if (!objectiveId) {
        errors.push(`Event ${event.id} is waiting_objective without an open objective.`);
        break;
      }

      objectiveIds.push(objectiveId);
      const objective = state.objectives[objectiveId];
      const assigneeCrewId = readPayloadString(context, "dry_run_assignee_crew_id") ?? objective.assigned_crew_id ?? context.crew_id ?? "amy";
      const assigned =
        objective.status === "available"
          ? assignObjective({
              state,
              index,
              objective_id: objectiveId,
              crew_id: assigneeCrewId,
              occurred_at: occurredAt + 1,
            })
          : { state, errors: [] };

      state = assigned.state;
      occurredAt += 1;
      errors.push(...engineErrors(assigned));

      const completed = completeObjective({
        state,
        index,
        objective_id: objectiveId,
        occurred_at: occurredAt + 1,
        result_key: "dry_run_completed",
      });
      state = completed.state;
      occurredAt += 1;
      collectTransitions(completed, visitedNodeIds);
      errors.push(...engineErrors(completed));
      continue;
    }

    errors.push(`Event ${event.id} stopped in unsupported dry-run status ${event.status}.`);
    break;
  }

  event = state.active_events[event.id] ?? event;
  return report(
    definition.id as SampleEventId,
    sampleIndex,
    TERMINAL_STATUSES.has(event.status) ? event.status : null,
    TERMINAL_STATUSES.has(event.status) ? event.current_node_id : null,
    visitedNodeIds,
    selectedOptionIds,
    objectiveIds,
    errors.length > 0 ? errors : [`Dry-run exceeded ${MAX_DRY_RUN_STEPS} steps for ${definition.id}.`],
  );
}

function createSampleState(context: TriggerContext): GraphRunnerGameState {
  const crew = {
    amy: crewState("amy", "Amy", "2-3", { perception: 4 }, ["steady"], ["field_scout"]),
    garry: crewState("garry", "Garry", "4-3", { perception: 3 }, ["practical"], ["miner"]),
    kael: crewState("kael", "Kael", "4-2", { perception: 5, intelligence: 4 }, ["guarded", "relic_sensitive"], ["signal_operator"]),
    lin_xia: crewState("lin_xia", "Lin Xia", "4-1", { perception: 5, intelligence: 5 }, ["precise"], ["medic"]),
    mike: crewState("mike", "Mike", "2-1", { strength: 5 }, ["direct"], ["guard"]),
  };

  return {
    ...createEmptyEventRuntimeState(),
    elapsed_game_seconds: context.occurred_at,
    crew,
    tiles: {
      "2-3": tileState("2-3", { x: 2, y: 3 }, "forest", ["forest", "woods"], ["beast_tracks"], ["amy"]),
      "4-1": tileState("4-1", { x: 4, y: 1 }, "old_medical_outpost", ["ruin"], [], ["lin_xia"]),
      "4-2": tileState("4-2", { x: 4, y: 2 }, "mountain_signal", ["mountain", "mountain_signal"], [], ["kael"]),
      "4-3": tileState("4-3", { x: 4, y: 3 }, "desert_volcanic", ["desert", "volcanic"], [], ["garry"]),
    },
    inventories: {
      inv_amy: inventory("inv_amy", "crew", "amy"),
      inv_garry: inventory("inv_garry", "crew", "garry"),
      inv_kael: inventory("inv_kael", "crew", "kael"),
      inv_lin_xia: inventory("inv_lin_xia", "crew", "lin_xia"),
      inv_mike: inventory("inv_mike", "crew", "mike"),
      inv_base: inventory("inv_base", "base", "base"),
    },
  };
}

function crewState(
  id: Id,
  displayName: string,
  tileId: Id,
  attributes: Partial<CrewState["attributes"]>,
  personalityTags: string[],
  expertiseTags: string[],
): CrewState {
  return {
    id,
    display_name: displayName,
    tile_id: tileId,
    status: "idle",
    attributes: {
      strength: attributes.strength ?? 3,
      agility: attributes.agility ?? 3,
      intelligence: attributes.intelligence ?? 3,
      perception: attributes.perception ?? 3,
      luck: attributes.luck ?? 3,
    },
    personality_tags: personalityTags,
    expertise_tags: expertiseTags,
    condition_tags: [],
    communication_state: "available",
    current_action_id: null,
    blocking_event_id: null,
    blocking_call_id: null,
    background_event_ids: [],
    inventory_id: `inv_${id}`,
    diary_entry_ids: [],
    event_history_keys: [],
  };
}

function tileState(
  id: Id,
  coordinates: TileState["coordinates"],
  terrainType: string,
  tags: string[],
  dangerTags: string[],
  currentCrewIds: string[],
): TileState {
  return {
    id,
    coordinates,
    terrain_type: terrainType,
    tags,
    danger_tags: dangerTags,
    discovery_state: "visited",
    survey_state: "surveyed",
    visibility: "visible",
    current_crew_ids: currentCrewIds,
    resource_nodes: [],
    site_objects: [],
    buildings: [],
    event_marks: [],
    history_keys: [],
  };
}

function inventory(id: Id, ownerType: "crew" | "base", ownerId: Id): GraphRunnerGameState["inventories"][Id] {
  return {
    id,
    owner_type: ownerType,
    owner_id: ownerId,
    items: [],
    resources: {},
  };
}

function findRuntimeEvent(state: GraphRunnerGameState, result: EventEngineResult, definitionId: Id): RuntimeEvent | undefined {
  return (
    result.event ??
    result.events?.find((event) => event.event_definition_id === definitionId) ??
    Object.values(state.active_events).find((event) => event.event_definition_id === definitionId)
  );
}

function collectTransitions(result: EventEngineResult, visitedNodeIds: Set<Id>): void {
  if (result.graph_result) {
    collectGraphTransitions(result.graph_result, visitedNodeIds);
  }
  for (const graphResult of result.graph_results ?? []) {
    collectGraphTransitions(graphResult, visitedNodeIds);
  }
}

function collectGraphTransitions(result: GraphRunnerResult, visitedNodeIds: Set<Id>): void {
  for (const transition of result.transitions) {
    visitedNodeIds.add(transition.to_node_id);
  }
  visitedNodeIds.add(result.event.current_node_id);
}

function engineErrors(result: Pick<EventEngineResult, "errors">): string[] {
  return result.errors.map((error) => `${error.path}: ${error.message}`);
}

function report(
  eventDefinitionId: SampleEventId,
  sampleIndex: number,
  terminalStatus: RuntimeEventStatus | null,
  terminalNodeId: Id | null,
  visitedNodeIds: Set<Id>,
  selectedOptionIds: Id[],
  objectiveIds: Id[],
  errors: string[],
): SampleDryRunReport {
  return {
    event_definition_id: eventDefinitionId,
    sample_index: sampleIndex,
    terminal_status: terminalStatus,
    terminal_node_id: terminalNodeId,
    visited_node_ids: [...visitedNodeIds],
    selected_option_ids: selectedOptionIds,
    objective_ids: Array.from(new Set(objectiveIds)),
    errors,
  };
}

function missingDefinitionReport(eventDefinitionId: SampleEventId): SampleDryRunReport {
  return {
    event_definition_id: eventDefinitionId,
    sample_index: 0,
    terminal_status: null,
    terminal_node_id: null,
    visited_node_ids: [],
    selected_option_ids: [],
    objective_ids: [],
    errors: [`Missing approved sample event definition ${eventDefinitionId}.`],
  };
}

function readPayloadString(context: TriggerContext, key: string): string | undefined {
  const value = context.payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readDefinitions(content: unknown): EventDefinition[] {
  return ((content as { event_definitions?: EventDefinition[] }).event_definitions ?? []).filter((definition) =>
    SAMPLE_EVENT_IDS.includes(definition.id as SampleEventId),
  );
}

function readCallTemplates(content: unknown): CallTemplate[] {
  return (content as { call_templates?: CallTemplate[] }).call_templates ?? [];
}
