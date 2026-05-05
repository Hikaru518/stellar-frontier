import {
  EVENT_SAVE_SCHEMA_VERSION,
  type BlockingRequirement,
  type CallNode,
  type CallTemplate,
  type EndNode,
  type EventDefinition,
  type EventGraph,
  type TextVariantGroup,
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

const DEFAULT_CALL_NODE_ID = "call";
const DEFAULT_END_NODE_ID = "end";
const DEFAULT_ACK_OPTION_ID = "ack";
const DEFAULT_RESOLVED_LOG_ID = "resolved_log";

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
