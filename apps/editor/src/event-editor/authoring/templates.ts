import {
  EVENT_SAVE_SCHEMA_VERSION,
  type ActionRequestNode,
  type BlockingRequirement,
  type CallNode,
  type CallTemplate,
  type CheckNode,
  type EndNode,
  type Effect,
  type EffectType,
  type EventDefinition,
  type EventGraph,
  type EventNode,
  type EventNodeType,
  type LogOnlyNode,
  type ObjectiveNode,
  type RandomNode,
  type SpawnEventNode,
  type TextVariantGroup,
  type WaitNode,
} from "../../../../pc-client/src/events/types";

export const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export interface CreateDefaultBlockingOptions {
  occupiesCrewAction?: boolean;
  occupiesCommunication?: boolean;
  blockingKeyTemplate?: string | null;
}

export interface CreateDefaultEventDefinitionShellOptions {
  domain: string;
  definitionId: string;
  title?: string;
  summary?: string;
}

export interface CreateDefaultCallTemplateShellOptions {
  domain: string;
  eventDefinitionId: string;
  nodeId?: string;
}

export interface CreateDefaultNodeTemplateOptions {
  type: EventNodeType;
  eventDefinitionId?: string;
  nodeId?: string;
  nextNodeId?: string;
}

export interface CreateDefaultEffectTemplateOptions {
  type: EffectType;
  effectId?: string;
  handlerType?: string;
}

export const EVENT_NODE_TYPES = [
  "call",
  "wait",
  "check",
  "random",
  "action_request",
  "objective",
  "spawn_event",
  "log_only",
  "end",
] as const satisfies readonly EventNodeType[];

const DEFAULT_CALL_NODE_ID = "call";
const DEFAULT_END_NODE_ID = "end";
const DEFAULT_ACK_OPTION_ID = "ack";
const DEFAULT_RESOLVED_LOG_ID = "resolved_log";
const DEFAULT_NEXT_NODE_ID = "next_node";
const DEFAULT_EVENT_DEFINITION_ID = "TODO_EVENT";
const DEFAULT_EVENT_LOG_TEMPLATE_ID = "TODO_EVENT_LOG";
const DEFAULT_REQUEST_ID = "TODO_REQUEST";
const DEFAULT_BRANCH_ID = "default_branch";

const DEFAULT_NODE_TITLES = {
  call: "Call",
  wait: "Wait",
  check: "Check",
  random: "Random",
  action_request: "Action Request",
  objective: "Objective",
  spawn_event: "Spawn Event",
  log_only: "Log",
  end: "End",
} as const satisfies Record<EventNodeType, string>;

export function isSafeEventId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value);
}

export function normalizeEventIdCandidate(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "");
}

export function deriveCallTemplateId(eventId: string, nodeId: string): string {
  return `${eventId}.call.${nodeId}`;
}

export function createDefaultBlocking(options: CreateDefaultBlockingOptions = {}): BlockingRequirement {
  return {
    occupies_crew_action: options.occupiesCrewAction ?? false,
    occupies_communication: options.occupiesCommunication ?? false,
    blocking_key_template: options.blockingKeyTemplate ?? null,
  };
}

export function createDefaultGraphRules(): EventGraph["graph_rules"] {
  return {
    acyclic: true,
    max_active_nodes: 1,
    allow_parallel_nodes: false,
  };
}

export function createTextVariantGroup(text = "TODO text."): TextVariantGroup {
  return {
    selection: "first_match",
    variants: [{ id: "default", text, priority: 1 }],
  };
}

export function createDefaultCallOptionTextVariantGroup(optionId: string): TextVariantGroup {
  const label = optionId.replace(/[_-]+/g, " ").trim() || "option";

  return createTextVariantGroup(`Choose ${label}.`);
}

export function createDefaultEffectTemplate({ type, effectId = type, handlerType }: CreateDefaultEffectTemplateOptions): Effect {
  const effect: Effect = {
    id: effectId,
    type,
    target: createDefaultEffectTarget(type),
    params: {},
    failure_policy: "fail_event",
    record_policy: {
      write_event_log: false,
      write_world_history: false,
    },
  };

  if (type === "handler_effect") {
    effect.handler_type = handlerType ?? "TODO_HANDLER";
  }
  if (type === "set_feature_status") {
    effect.params = { feature_id: "TODO_FEATURE", status: "TODO_STATUS" };
  }
  if (type === "set_feature_revealed") {
    effect.params = { feature_id: "TODO_FEATURE", revealed: true };
  }

  return effect;
}

export function createDefaultNodeTemplate({
  type,
  eventDefinitionId = DEFAULT_EVENT_DEFINITION_ID,
  nodeId = type,
  nextNodeId = DEFAULT_NEXT_NODE_ID,
}: CreateDefaultNodeTemplateOptions): EventNode {
  switch (type) {
    case "call": {
      const node: CallNode = {
        ...createDefaultNodeCommon("call", nodeId),
        type: "call",
        blocking: createDefaultBlocking({ occupiesCommunication: true }),
        call_template_id: deriveCallTemplateId(eventDefinitionId, nodeId),
        speaker_crew_ref: { type: "primary_crew" },
        urgency: "normal",
        delivery: "queued_message",
        options: [{ id: DEFAULT_ACK_OPTION_ID, is_default: true }],
        option_node_mapping: {
          [DEFAULT_ACK_OPTION_ID]: nextNodeId,
        },
      };
      return node;
    }
    case "wait": {
      const node: WaitNode = {
        ...createDefaultNodeCommon("wait", nodeId),
        type: "wait",
        duration_seconds: 60,
        wake_trigger_type: "time_wakeup",
        next_node_id: nextNodeId,
        set_next_wakeup_at: true,
        interrupt_policy: "not_interruptible",
      };
      return node;
    }
    case "check": {
      const node: CheckNode = {
        ...createDefaultNodeCommon("check", nodeId),
        type: "check",
        branches: [{ id: DEFAULT_BRANCH_ID, conditions: [], next_node_id: nextNodeId }],
        default_next_node_id: nextNodeId,
        evaluation_order: "first_match",
      };
      return node;
    }
    case "random": {
      const node: RandomNode = {
        ...createDefaultNodeCommon("random", nodeId),
        type: "random",
        seed_scope: "event_instance",
        branches: [{ id: DEFAULT_BRANCH_ID, weight: 1, next_node_id: nextNodeId }],
        default_next_node_id: nextNodeId,
        store_result_as: `${nodeId}_result`,
      };
      return node;
    }
    case "action_request": {
      const node: ActionRequestNode = {
        ...createDefaultNodeCommon("action_request", nodeId),
        type: "action_request",
        blocking: createDefaultBlocking({ occupiesCrewAction: true }),
        request_id: DEFAULT_REQUEST_ID,
        action_type: "survey",
        target_crew_ref: { type: "primary_crew" },
        target_tile_ref: { type: "event_tile" },
        action_params: {},
        acceptance_conditions: [],
        completion_trigger: { type: "action_complete", conditions: [] },
        on_completed_node_id: nextNodeId,
        on_failed_node_id: nextNodeId,
        occupies_crew_action: true,
      };
      return node;
    }
    case "objective": {
      const node: ObjectiveNode = {
        ...createDefaultNodeCommon("objective", nodeId),
        type: "objective",
        objective_template: {
          title: "TODO objective",
          summary: "TODO objective summary.",
          target_tile_ref: { type: "event_tile" },
          eligible_crew_conditions: [],
          required_action_type: "survey",
          required_action_params: {},
        },
        mode: "create_and_wait",
        on_completed_node_id: nextNodeId,
        on_failed_node_id: nextNodeId,
        parent_event_link: true,
      };
      return node;
    }
    case "spawn_event": {
      const node: SpawnEventNode = {
        ...createDefaultNodeCommon("spawn_event", nodeId),
        type: "spawn_event",
        event_definition_id: DEFAULT_EVENT_DEFINITION_ID,
        spawn_policy: "immediate",
        context_mapping: {},
        parent_event_link: true,
        next_node_id: nextNodeId,
      };
      return node;
    }
    case "log_only": {
      const node: LogOnlyNode = {
        ...createDefaultNodeCommon("log_only", nodeId),
        type: "log_only",
        event_log_template_id: DEFAULT_EVENT_LOG_TEMPLATE_ID,
        history_writes: [],
        next_node_id: nextNodeId,
      };
      return node;
    }
    case "end": {
      const node: EndNode = {
        ...createDefaultNodeCommon("end", nodeId),
        type: "end",
        resolution: "resolved",
        result_key: "resolved",
        event_log_template_id: DEFAULT_EVENT_LOG_TEMPLATE_ID,
        history_writes: [],
        cleanup_policy: createDefaultCleanupPolicy(),
      };
      return node;
    }
  }
}

export function createDefaultEventDefinitionShell({
  domain,
  definitionId,
  title = definitionId,
  summary = "TODO summary.",
}: CreateDefaultEventDefinitionShellOptions): EventDefinition {
  const callTemplateId = deriveCallTemplateId(definitionId, DEFAULT_CALL_NODE_ID);
  const callNode: CallNode = {
    id: DEFAULT_CALL_NODE_ID,
    type: "call",
    title: "Call",
    blocking: createDefaultBlocking({ occupiesCommunication: true }),
    call_template_id: callTemplateId,
    speaker_crew_ref: { type: "primary_crew" },
    urgency: "normal",
    delivery: "queued_message",
    options: [{ id: DEFAULT_ACK_OPTION_ID, is_default: true }],
    option_node_mapping: {
      [DEFAULT_ACK_OPTION_ID]: DEFAULT_END_NODE_ID,
    },
  };
  const endNode: EndNode = {
    id: DEFAULT_END_NODE_ID,
    type: "end",
    title: "Resolved",
    blocking: createDefaultBlocking(),
    resolution: "resolved",
    result_key: "resolved",
    event_log_template_id: DEFAULT_RESOLVED_LOG_ID,
    history_writes: [],
    cleanup_policy: {
      release_blocking_claims: true,
      delete_active_calls: true,
      keep_player_summary: true,
    },
  };

  return {
    schema_version: EVENT_SAVE_SCHEMA_VERSION,
    id: definitionId,
    version: 1,
    domain,
    title,
    summary,
    status: "draft",
    trigger: {
      type: "arrival",
      conditions: [],
    },
    candidate_selection: {
      priority: 0,
      weight: 1,
      max_instances_per_trigger: 1,
      requires_blocking_slot: false,
    },
    repeat_policy: {
      scope: "event",
      max_trigger_count: null,
      cooldown_seconds: 0,
      history_key_template: `${definitionId}_triggered`,
      allow_while_active: false,
    },
    event_graph: {
      entry_node_id: DEFAULT_CALL_NODE_ID,
      nodes: [callNode, endNode],
      edges: [
        {
          from_node_id: DEFAULT_CALL_NODE_ID,
          to_node_id: DEFAULT_END_NODE_ID,
          via: DEFAULT_ACK_OPTION_ID,
        },
      ],
      terminal_node_ids: [DEFAULT_END_NODE_ID],
      graph_rules: createDefaultGraphRules(),
    },
    log_templates: [
      {
        id: DEFAULT_RESOLVED_LOG_ID,
        summary: `${title} resolved.`,
        importance: "normal",
        visibility: "player_visible",
      },
    ],
    content_refs: {
      call_template_ids: [callTemplateId],
    },
    sample_contexts: [],
  };
}

export function createDefaultCallTemplateShell({
  domain,
  eventDefinitionId,
  nodeId = DEFAULT_CALL_NODE_ID,
}: CreateDefaultCallTemplateShellOptions): CallTemplate {
  return {
    schema_version: EVENT_SAVE_SCHEMA_VERSION,
    id: deriveCallTemplateId(eventDefinitionId, nodeId),
    version: 1,
    domain,
    event_definition_id: eventDefinitionId,
    node_id: nodeId,
    render_context_fields: [],
    opening_lines: createTextVariantGroup("Opening line for call."),
    option_lines: {
      [DEFAULT_ACK_OPTION_ID]: createTextVariantGroup("Acknowledge."),
    },
    fallback_order: ["default"],
    default_variant_required: true,
  };
}

function createDefaultNodeCommon(type: EventNodeType, nodeId: string): {
  id: string;
  type: EventNodeType;
  title: string;
  blocking: BlockingRequirement;
} {
  return {
    id: nodeId,
    type,
    title: DEFAULT_NODE_TITLES[type],
    blocking: createDefaultBlocking(),
  };
}

function createDefaultCleanupPolicy(): EndNode["cleanup_policy"] {
  return {
    release_blocking_claims: true,
    delete_active_calls: true,
    keep_player_summary: true,
  };
}

function createDefaultEffectTarget(type: EffectType): Effect["target"] {
  switch (type) {
    case "add_crew_condition":
    case "remove_crew_condition":
    case "update_crew_attribute":
    case "add_personality_tag":
    case "remove_personality_tag":
    case "add_expertise_tag":
    case "update_crew_location":
    case "create_crew_action":
    case "cancel_crew_action":
    case "update_crew_action":
    case "add_diary_entry":
      return { type: "primary_crew" };
    case "update_tile_field":
    case "update_tile_state":
    case "add_tile_tag":
    case "add_danger_tag":
    case "set_discovery_state":
    case "set_survey_state":
    case "update_tile_resource":
    case "set_feature_status":
    case "set_feature_revealed":
    case "set_object_status":
      return { type: "event_tile" };
    case "add_item":
    case "remove_item":
    case "transfer_item":
      return { type: "crew_inventory" };
    case "add_resource":
    case "remove_resource":
      return { type: "base_resources" };
    case "update_objective":
    case "complete_objective":
    case "fail_objective":
      return { type: "objective_id" };
    case "set_world_flag":
    case "increment_world_counter":
    case "unlock_event_definition":
    case "handler_effect":
      return { type: "world_flags" };
    case "write_world_history":
      return { type: "world_history" };
    case "add_event_log":
      return { type: "event_log" };
    case "add_event_mark":
    case "create_objective":
    case "spawn_event":
      return { type: "active_event" };
  }
}
