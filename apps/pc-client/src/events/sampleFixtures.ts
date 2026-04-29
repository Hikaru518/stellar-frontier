import handlerRegistryContent from "../../../../content/events/handler_registry.json";
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
  type RuntimeEvent,
  type RuntimeEventStatus,
  type TileState,
  type TriggerContext,
} from "./types";

export const SAMPLE_EVENT_IDS = [
  "fixture_normal_discovery",
  "fixture_emergency_call",
  "fixture_cross_crew_objective",
] as const;

export type SampleEventId = (typeof SAMPLE_EVENT_IDS)[number];

export type SampleCoverageCategory =
  | "normal_discovery"
  | "emergency_multi_call"
  | "cross_crew_objective";
export type SampleReachability = "manual-reachable" | "seeded-regression" | "future-integration";

export const SAMPLE_EVENT_COVERAGE = {
  normal_discovery: ["fixture_normal_discovery"],
  emergency_multi_call: ["fixture_emergency_call"],
  cross_crew_objective: ["fixture_cross_crew_objective"],
} satisfies Record<SampleCoverageCategory, readonly SampleEventId[]>;

export const SAMPLE_EVENT_REACHABILITY = {
  fixture_normal_discovery: "seeded-regression",
  fixture_emergency_call: "seeded-regression",
  fixture_cross_crew_objective: "seeded-regression",
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
    domains: ["fixture_events"],
    event_definitions: sampleEventDefinitions(),
    call_templates: sampleCallTemplates(),
    handlers: (handlerRegistryContent.handlers ?? []) as HandlerDefinition[],
    presets: [],
  };
}

function sampleEventDefinitions(): EventDefinition[] {
  return [
    callToEndDefinition({
      id: "fixture_normal_discovery",
      domain: "fixture_events",
      title: "Fixture normal discovery",
      summary: "A crew member reports a small fixture signal.",
      tag: "normal_discovery",
      triggerTag: "fixture_signal",
      callTemplateId: "fixture_normal_discovery.call.report",
      callNodeId: "trace_report",
      optionId: "acknowledge_signal",
      endNodeId: "trace_resolved",
      resultKey: "trace_resolved",
      context: {
        trigger_type: "action_complete",
        occurred_at: 120,
        source: "crew_action",
        crew_id: "amy",
        tile_id: "2-3",
        action_id: "amy-survey-2-3",
        payload: { action_type: "survey" },
      },
    }),
    callToEndDefinition({
      id: "fixture_emergency_call",
      domain: "fixture_events",
      title: "Fixture emergency call",
      summary: "A crew member reports an urgent threat.",
      tag: "emergency_multi_call",
      triggerTag: "urgent_signal",
      triggerField: "danger_tags",
      callTemplateId: "fixture_emergency_call.call.report",
      callNodeId: "emergency_call",
      optionId: "stabilize",
      endNodeId: "emergency_resolved_end",
      resultKey: "emergency_resolved",
      urgency: "emergency",
      delivery: "incoming_call",
      requiresBlockingSlot: true,
      mutexGroup: "fixture_crew_emergency",
      context: {
        trigger_type: "action_complete",
        occurred_at: 240,
        source: "crew_action",
        crew_id: "amy",
        tile_id: "2-3",
        action_id: "current-area-survey:amy:2-3:240",
        payload: { action_type: "survey" },
      },
    }),
    objectiveDefinition(),
  ];
}

function sampleCallTemplates(): CallTemplate[] {
  return [
    callTemplate("fixture_normal_discovery.call.report", "fixture_events", "fixture_normal_discovery", "trace_report", [
      "acknowledge_signal",
    ]),
    callTemplate("fixture_emergency_call.call.report", "fixture_events", "fixture_emergency_call", "emergency_call", [
      "stabilize",
    ]),
    callTemplate("fixture_cross_crew_objective.call.briefing", "fixture_events", "fixture_cross_crew_objective", "objective_call", [
      "assign_helper",
    ]),
  ];
}

function callToEndDefinition({
  id,
  domain,
  title,
  summary,
  tag,
  triggerTag,
  triggerField = "tags",
  callTemplateId,
  callNodeId,
  optionId,
  endNodeId,
  resultKey,
  urgency = "normal",
  delivery = "queued_message",
  requiresBlockingSlot = false,
  mutexGroup = null,
  context,
}: {
  id: SampleEventId;
  domain: string;
  title: string;
  summary: string;
  tag: string;
  triggerTag: string;
  triggerField?: "tags" | "danger_tags";
  callTemplateId: Id;
  callNodeId: Id;
  optionId: Id;
  endNodeId: Id;
  resultKey: string;
  urgency?: "normal" | "emergency";
  delivery?: "queued_message" | "incoming_call";
  requiresBlockingSlot?: boolean;
  mutexGroup?: string | null;
  context: TriggerContext;
}): EventDefinition {
  return {
    schema_version: "event-program-model-v1",
    id,
    version: 1,
    domain,
    title,
    summary,
    tags: ["sample_fixture", tag],
    status: "approved",
    trigger: {
      type: "action_complete",
      required_context: ["crew_id", "tile_id", "action_id"],
      conditions: [{ type: "has_tag", target: { type: "event_tile" }, field: triggerField, value: triggerTag }],
    },
    candidate_selection: {
      priority: requiresBlockingSlot ? 90 : 30,
      weight: 1,
      mutex_group: mutexGroup,
      max_instances_per_trigger: 1,
      requires_blocking_slot: requiresBlockingSlot,
    },
    repeat_policy: {
      scope: "crew_tile",
      max_trigger_count: 1,
      cooldown_seconds: 0,
      history_key_template: `event:${id}:{crew_id}:{tile_id}`,
      allow_while_active: false,
    },
    event_graph: {
      entry_node_id: callNodeId,
      nodes: [
        {
          id: callNodeId,
          type: "call",
          title,
          call_template_id: callTemplateId,
          speaker_crew_ref: { type: "primary_crew" },
          urgency,
          delivery,
          options: [{ id: optionId, is_default: true }],
          option_node_mapping: { [optionId]: endNodeId },
          blocking: communicationBlocking(),
          expires_in_seconds: 180,
        },
        endNode(endNodeId, resultKey),
      ],
      edges: [],
      terminal_node_ids: [endNodeId],
      graph_rules: { acyclic: true, max_active_nodes: 1, allow_parallel_nodes: false },
    },
    log_templates: [logTemplate(`${id}.log`)],
    content_refs: { call_template_ids: [callTemplateId] },
    sample_contexts: [context],
  };
}

function objectiveDefinition(): EventDefinition {
  return {
    schema_version: "event-program-model-v1",
    id: "fixture_cross_crew_objective",
    version: 1,
    domain: "fixture_events",
    title: "Fixture cross-crew objective",
    summary: "A crew member asks another crew member to inspect a trace.",
    tags: ["sample_fixture", "cross_crew_objective"],
    status: "approved",
    trigger: {
      type: "action_complete",
      required_context: ["crew_id", "tile_id", "action_id"],
      conditions: [{ type: "has_tag", target: { type: "event_tile" }, field: "tags", value: "objective_signal" }],
    },
    candidate_selection: {
      priority: 35,
      weight: 1,
      mutex_group: null,
      max_instances_per_trigger: 1,
      requires_blocking_slot: false,
    },
    repeat_policy: {
      scope: "tile",
      max_trigger_count: 1,
      cooldown_seconds: 0,
      history_key_template: "event:fixture_cross_crew_objective:{tile_id}",
      allow_while_active: false,
    },
    event_graph: {
      entry_node_id: "objective_call",
      nodes: [
        {
          id: "objective_call",
          type: "call",
          title: "Report trace",
          call_template_id: "fixture_cross_crew_objective.call.briefing",
          speaker_crew_ref: { type: "primary_crew" },
          urgency: "normal",
          delivery: "queued_message",
          options: [{ id: "assign_helper", is_default: true }],
          option_node_mapping: { assign_helper: "cross_crew_objective" },
          blocking: communicationBlocking(),
          expires_in_seconds: 180,
        },
        {
          id: "cross_crew_objective",
          type: "objective",
          title: "Inspect trace",
          objective_template: {
            title: "Inspect trace",
            summary: "Send a second crew member to inspect the trace.",
            target_tile_ref: { type: "event_tile" },
            required_action_type: "survey",
            required_action_params: { duration_seconds: 45, can_interrupt: true },
          },
          mode: "create_and_wait",
          on_completed_node_id: "objective_completed_end",
          on_failed_node_id: "objective_failed_end",
          expires_in_seconds: 600,
          parent_event_link: true,
          blocking: nonBlocking(),
        },
        endNode("objective_completed_end", "objective_completed"),
        endNode("objective_failed_end", "objective_failed", "failed"),
      ],
      edges: [],
      terminal_node_ids: ["objective_completed_end", "objective_failed_end"],
      graph_rules: { acyclic: true, max_active_nodes: 1, allow_parallel_nodes: false },
    },
    log_templates: [logTemplate("fixture_cross_crew_objective.log")],
    content_refs: { call_template_ids: ["fixture_cross_crew_objective.call.briefing"] },
    sample_contexts: [
      {
        trigger_type: "action_complete",
        occurred_at: 480,
        source: "crew_action",
        crew_id: "garry",
        tile_id: "4-3",
        action_id: "garry-survey-4-3",
        payload: { action_type: "survey", dry_run_assignee_crew_id: "amy" },
      },
    ],
  };
}

function endNode(id: Id, resultKey: string, resolution: "resolved" | "failed" = "resolved"): EventDefinition["event_graph"]["nodes"][number] {
  return {
    id,
    type: "end",
    title: resultKey,
    resolution,
    result_key: resultKey,
    event_log_template_id: `${resultKey}.log`,
    history_writes: [],
    blocking: nonBlocking(),
    cleanup_policy: {
      release_blocking_claims: true,
      delete_active_calls: true,
      keep_player_summary: true,
    },
  };
}

function callTemplate(id: Id, domain: string, eventDefinitionId: Id, nodeId: Id, optionIds: Id[]): CallTemplate {
  return {
    schema_version: "event-program-model-v1",
    id,
    version: 1,
    domain,
    event_definition_id: eventDefinitionId,
    node_id: nodeId,
    render_context_fields: ["crew_id", "crew_display_name", "tile_id"],
    opening_lines: {
      selection: "best_match",
      variants: [{ id: `${id}.opening`, text: "Fixture event report.", priority: 0 }],
    },
    option_lines: Object.fromEntries(
      optionIds.map((optionId) => [
        optionId,
        {
          selection: "best_match",
          variants: [{ id: `${id}.${optionId}`, text: "Continue.", priority: 0 }],
        },
      ]),
    ),
    fallback_order: ["default"],
    default_variant_required: true,
  };
}

function logTemplate(id: Id): NonNullable<EventDefinition["log_templates"]>[number] {
  return {
    id,
    summary: "Fixture event completed.",
    importance: "normal",
    visibility: "player_visible",
  };
}

function communicationBlocking() {
  return { occupies_crew_action: false, occupies_communication: true, blocking_key_template: null };
}

function nonBlocking() {
  return { occupies_crew_action: false, occupies_communication: false, blocking_key_template: null };
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
    mike: crewState("mike", "Mike", "2-1", { strength: 5 }, ["direct"], ["guard"]),
  };

  return {
    ...createEmptyEventRuntimeState(),
    elapsed_game_seconds: context.occurred_at,
    crew,
    tiles: {
      "2-3": tileState("2-3", { x: 2, y: 3 }, "fixture_field", ["fixture_signal"], ["urgent_signal"], ["amy"]),
      "4-3": tileState("4-3", { x: 4, y: 3 }, "fixture_ridge", ["objective_signal"], [], ["garry"]),
    },
    inventories: {
      inv_amy: inventory("inv_amy", "crew", "amy"),
      inv_garry: inventory("inv_garry", "crew", "garry"),
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
