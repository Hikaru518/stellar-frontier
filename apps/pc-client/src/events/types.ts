export const EVENT_SAVE_SCHEMA_VERSION = "event-program-model-v1";

export type Id = string;
export type GameSeconds = number;
export type JsonObject = Record<string, unknown>;

export type TriggerType =
  | "arrival"
  | "proximity"
  | "action_complete"
  | "idle_time"
  | "call_choice"
  | "event_node_finished"
  | "objective_created"
  | "objective_completed"
  | "world_flag_changed"
  | "time_wakeup";

export type TriggerSource =
  | "crew_action"
  | "tile_system"
  | "call"
  | "event_node"
  | "objective"
  | "world_flag"
  | "time_system";

export interface TriggerContext {
  trigger_type: TriggerType;
  occurred_at: GameSeconds;
  source: TriggerSource;
  crew_id?: Id | null;
  tile_id?: Id | null;
  action_id?: Id | null;
  event_id?: Id | null;
  event_definition_id?: Id | null;
  node_id?: Id | null;
  call_id?: Id | null;
  objective_id?: Id | null;
  selected_option_id?: Id | null;
  world_flag_key?: Id | null;
  previous_value?: unknown;
  new_value?: unknown;
  proximity?: {
    origin_tile_id: Id;
    nearby_tile_ids: Id[];
    distance: number;
  } | null;
  payload?: JsonObject;
}

export interface TargetRef {
  type:
    | "primary_crew"
    | "related_crew"
    | "crew_id"
    | "event_tile"
    | "tile_id"
    | "active_event"
    | "parent_event"
    | "child_event"
    | "objective_id"
    | "crew_inventory"
    | "base_inventory"
    | "base_resources"
    | "tile_resources"
    | "world_flags"
    | "world_history"
    | "event_log";
  id?: Id | null;
  ref?: string | null;
}

export type ConditionType =
  | "all_of"
  | "any_of"
  | "not"
  | "compare_field"
  | "has_tag"
  | "lacks_tag"
  | "has_condition"
  | "attribute_check"
  | "inventory_has_item"
  | "resource_amount"
  | "tile_discovery_state"
  | "tile_survey_state"
  | "world_flag_equals"
  | "world_history_exists"
  | "world_history_count"
  | "objective_status"
  | "event_status"
  | "event_current_node"
  | "crew_action_status"
  | "time_compare"
  | "handler_condition";

export type CompareOp = "equals" | "not_equals" | "gt" | "gte" | "lt" | "lte" | "includes" | "not_includes";

export interface Condition {
  type: ConditionType;
  target?: TargetRef | null;
  field?: string | null;
  op?: CompareOp | null;
  value?: unknown;
  conditions?: Condition[];
  handler_type?: string | null;
  params?: JsonObject;
  description?: string;
}

export type EffectType =
  | "add_crew_condition"
  | "remove_crew_condition"
  | "update_crew_attribute"
  | "add_personality_tag"
  | "remove_personality_tag"
  | "add_expertise_tag"
  | "update_crew_location"
  | "create_crew_action"
  | "cancel_crew_action"
  | "update_crew_action"
  | "update_tile_field"
  | "update_tile_state"
  | "add_tile_tag"
  | "add_danger_tag"
  | "set_discovery_state"
  | "set_survey_state"
  | "add_event_mark"
  | "add_item"
  | "remove_item"
  | "transfer_item"
  | "add_resource"
  | "remove_resource"
  | "update_tile_resource"
  | "create_objective"
  | "update_objective"
  | "complete_objective"
  | "fail_objective"
  | "set_world_flag"
  | "increment_world_counter"
  | "write_world_history"
  | "add_event_log"
  | "add_diary_entry"
  | "spawn_event"
  | "unlock_event_definition"
  | "handler_effect";

export type EffectFailurePolicy = "fail_event" | "skip_effect" | "skip_group" | "retry_later";

export type EffectExecutionStatus = "success" | "failed" | "skipped" | "retry_later";

export type EffectExecutionErrorCode =
  | "invalid_effect"
  | "missing_target"
  | "missing_field"
  | "missing_value"
  | "invalid_handler_kind"
  | "invalid_handler_target"
  | "unknown_handler_type"
  | "missing_handler_implementation"
  | "handler_error";

export interface Effect {
  id: Id;
  type: EffectType;
  target: TargetRef;
  params: JsonObject;
  failure_policy: EffectFailurePolicy;
  record_policy: {
    write_event_log: boolean;
    write_world_history: boolean;
    history_key_template?: string | null;
  };
  idempotency_key_template?: string | null;
  handler_type?: string | null;
}

export interface EffectGroup {
  id: Id;
  effects: Effect[];
  description?: string;
}

export interface HistoryWrite {
  key_template: string;
  scope: WorldHistoryScope;
  value?: unknown;
}

export interface BlockingRequirement {
  occupies_crew_action: boolean;
  occupies_communication: boolean;
  blocking_key_template?: string | null;
}

export interface TimeoutRule {
  duration_seconds: number;
  next_node_id?: Id | null;
  effect_refs?: Id[];
}

export interface EventNodeBase {
  id: Id;
  type: EventNodeType;
  title: string;
  description?: string;
  requirements?: Condition[];
  enter_effect_refs?: Id[];
  exit_effect_refs?: Id[];
  inline_effects?: Effect[];
  event_log_template_id?: Id | null;
  history_writes?: HistoryWrite[];
  blocking: BlockingRequirement;
  timeout?: TimeoutRule | null;
  auto_next_node_id?: Id | null;
}

export type EventNodeType =
  | "call"
  | "wait"
  | "check"
  | "random"
  | "action_request"
  | "objective"
  | "spawn_event"
  | "log_only"
  | "end";

export interface CallNode extends EventNodeBase {
  type: "call";
  call_template_id: Id;
  speaker_crew_ref: TargetRef;
  urgency: "normal" | "urgent" | "emergency";
  delivery: "incoming_call" | "auto_report" | "queued_message";
  options: CallOption[];
  option_node_mapping: Record<Id, Id>;
  on_missed?: {
    next_node_id?: Id | null;
    effect_refs?: Id[];
  };
  expires_in_seconds?: number | null;
}

export interface CallOption {
  id: Id;
  requirements?: Condition[];
  effect_refs?: Id[];
  is_default?: boolean;
}

export interface WaitNode extends EventNodeBase {
  type: "wait";
  duration_seconds: number;
  wake_trigger_type: Extract<TriggerType, "time_wakeup" | "event_node_finished">;
  next_node_id: Id;
  set_next_wakeup_at: boolean;
  crew_action_during_wait?: CrewActionPatch | null;
  interrupt_policy: "not_interruptible" | "player_can_cancel" | "event_can_cancel";
  on_interrupted?: {
    next_node_id: Id;
    effect_refs?: Id[];
  } | null;
}

export interface CheckNode extends EventNodeBase {
  type: "check";
  branches: CheckBranch[];
  default_next_node_id: Id;
  evaluation_order: "first_match";
}

export interface CheckBranch {
  id: Id;
  conditions: Condition[];
  next_node_id: Id;
  effect_refs?: Id[];
}

export interface RandomNode extends EventNodeBase {
  type: "random";
  seed_scope: "event_instance" | "node_entry" | "trigger_context";
  branches: RandomBranch[];
  default_next_node_id?: Id | null;
  store_result_as: string;
}

export interface RandomBranch {
  id: Id;
  weight: number;
  conditions?: Condition[];
  next_node_id: Id;
  effect_refs?: Id[];
}

export interface ActionRequestNode extends EventNodeBase {
  type: "action_request";
  request_id: Id;
  action_type: CrewActionType | "custom_handler_action";
  target_crew_ref: TargetRef;
  target_tile_ref?: TargetRef | null;
  action_params: JsonObject;
  acceptance_conditions?: Condition[];
  completion_trigger: TriggerDefinition;
  on_accepted_node_id?: Id | null;
  on_completed_node_id: Id;
  on_failed_node_id: Id;
  expires_in_seconds?: number | null;
  occupies_crew_action: boolean;
}

export interface ObjectiveNode extends EventNodeBase {
  type: "objective";
  objective_template: ObjectiveTemplate;
  mode: "create_and_wait" | "create_and_continue";
  on_created_node_id?: Id | null;
  on_completed_node_id: Id;
  on_failed_node_id?: Id | null;
  expires_in_seconds?: number | null;
  parent_event_link: boolean;
}

export interface SpawnEventNode extends EventNodeBase {
  type: "spawn_event";
  event_definition_id: Id;
  spawn_policy: "immediate" | "deferred_until_trigger";
  context_mapping: Record<string, string>;
  parent_event_link: boolean;
  dedupe_key_template?: string | null;
  next_node_id: Id;
}

export interface LogOnlyNode extends EventNodeBase {
  type: "log_only";
  event_log_template_id: Id;
  effect_refs?: Id[];
  history_writes?: HistoryWrite[];
  next_node_id: Id;
}

export interface EndNode extends EventNodeBase {
  type: "end";
  resolution: EventTerminalStatus;
  result_key: string;
  final_effect_refs?: Id[];
  event_log_template_id: Id;
  history_writes: HistoryWrite[];
  cleanup_policy: {
    release_blocking_claims: boolean;
    delete_active_calls: boolean;
    keep_player_summary: boolean;
  };
}

export type EventNode =
  | CallNode
  | WaitNode
  | CheckNode
  | RandomNode
  | ActionRequestNode
  | ObjectiveNode
  | SpawnEventNode
  | LogOnlyNode
  | EndNode;

export interface EventEdge {
  from_node_id: Id;
  to_node_id: Id;
  via?: string | null;
}

export interface EventGraph {
  entry_node_id: Id;
  nodes: EventNode[];
  edges: EventEdge[];
  terminal_node_ids: Id[];
  graph_rules: {
    acyclic: boolean;
    max_active_nodes: number;
    allow_parallel_nodes: boolean;
  };
}

export interface TriggerDefinition {
  type: TriggerType;
  conditions?: Condition[];
  probability?: {
    base: number;
    modifiers?: ProbabilityModifier[];
    min?: number;
    max?: number;
  };
  required_context?: string[];
  dedupe_key_template?: string;
}

export interface ProbabilityModifier {
  conditions: Condition[];
  add?: number;
  multiply?: number;
}

export interface EventDefinition {
  schema_version: string;
  id: Id;
  version: number;
  domain: string;
  title: string;
  summary: string;
  tags?: string[];
  status: "draft" | "ready_for_test" | "approved" | "disabled";
  trigger: TriggerDefinition;
  candidate_selection: {
    priority: number;
    weight: number;
    mutex_group?: string | null;
    max_instances_per_trigger: number;
    requires_blocking_slot: boolean;
  };
  repeat_policy: {
    scope: WorldHistoryScope;
    max_trigger_count?: number | null;
    cooldown_seconds: number;
    history_key_template: string;
    allow_while_active: boolean;
  };
  event_graph: EventGraph;
  effect_groups?: EffectGroup[];
  log_templates?: EventLogTemplate[];
  content_refs?: {
    call_template_ids?: Id[];
    item_ids?: Id[];
    resource_ids?: Id[];
    crew_ids?: Id[];
  };
  sample_contexts: TriggerContext[];
}

export interface EventLogTemplate {
  id: Id;
  summary: string;
  importance: EventLogImportance;
  visibility: EventLogVisibility;
}

export interface CallTemplate {
  schema_version: string;
  id: Id;
  version: number;
  domain: string;
  event_definition_id: Id;
  node_id: Id;
  render_context_fields: string[];
  opening_lines: TextVariantGroup;
  body_lines?: TextVariantGroup[];
  option_lines: Record<Id, TextVariantGroup>;
  fallback_order: string[];
  default_variant_required: boolean;
}

export interface TextVariantGroup {
  variants: TextVariant[];
  max_lines?: number;
  selection: "best_match" | "first_match" | "weighted_random";
}

export interface TextVariant {
  id: Id;
  text: string;
  when?: Condition[];
  priority: number;
  weight?: number;
}

export interface HandlerDefinition {
  handler_type: string;
  kind: "condition" | "effect" | "candidate_weight" | "action_params";
  description: string;
  params_schema_ref: string;
  allowed_target_types: TargetRef["type"][];
  deterministic: boolean;
  uses_random: boolean;
  failure_policy: EffectFailurePolicy;
  sample_fixtures: string[];
}

export interface PresetDefinition {
  id: Id;
  kind: "condition" | "effect" | "effect_group" | "probability_modifier";
  expands_to: JsonObject;
  params?: JsonObject;
  description: string;
}

export type RuntimeEventStatus =
  | "active"
  | "waiting_call"
  | "waiting_time"
  | "waiting_action"
  | "waiting_objective"
  | "resolving"
  | EventTerminalStatus;

export type EventTerminalStatus = "resolved" | "cancelled" | "expired" | "failed";

export interface RandomResult {
  branch_id: Id;
  roll: number;
  seed: string;
}

export interface RuntimeEvent {
  id: Id;
  event_definition_id: Id;
  event_definition_version: number;
  status: RuntimeEventStatus;
  current_node_id: Id;
  primary_crew_id?: Id | null;
  related_crew_ids: Id[];
  primary_tile_id?: Id | null;
  related_tile_ids: Id[];
  parent_event_id?: Id | null;
  child_event_ids: Id[];
  objective_ids: Id[];
  active_call_id?: Id | null;
  selected_options: Record<Id, Id>;
  random_results: Record<string, RandomResult>;
  blocking_claim_ids: Id[];
  created_at: GameSeconds;
  updated_at: GameSeconds;
  deadline_at?: GameSeconds | null;
  next_wakeup_at?: GameSeconds | null;
  trigger_context_snapshot: TriggerContext;
  history_keys: string[];
  result_key?: string | null;
  result_summary?: string | null;
}

export type RuntimeCallStatus = "incoming" | "connected" | "awaiting_choice" | "ended" | "missed" | "expired" | "cancelled";

export interface RuntimeCall {
  id: Id;
  event_id: Id;
  event_node_id: Id;
  call_template_id: Id;
  crew_id: Id;
  status: RuntimeCallStatus;
  created_at: GameSeconds;
  connected_at?: GameSeconds | null;
  ended_at?: GameSeconds | null;
  expires_at?: GameSeconds | null;
  render_context_snapshot: JsonObject;
  rendered_lines: RenderedLine[];
  available_options: RuntimeCallOption[];
  selected_option_id?: Id | null;
  blocking_claim_id?: Id | null;
}

export interface RenderedLine {
  template_variant_id: Id;
  text: string;
  speaker_crew_id: Id;
}

export interface RuntimeCallOption {
  option_id: Id;
  template_variant_id: Id;
  text: string;
  is_default: boolean;
}

export type ObjectiveStatus = "available" | "assigned" | "in_progress" | "completed" | "failed" | "expired" | "cancelled";

export interface Objective {
  id: Id;
  status: ObjectiveStatus;
  parent_event_id: Id;
  created_by_node_id: Id;
  title: string;
  summary: string;
  target_tile_id?: Id | null;
  eligible_crew_conditions: Condition[];
  required_action_type: string;
  required_action_params: JsonObject;
  assigned_crew_id?: Id | null;
  action_id?: Id | null;
  created_at: GameSeconds;
  assigned_at?: GameSeconds | null;
  completed_at?: GameSeconds | null;
  deadline_at?: GameSeconds | null;
  completion_trigger_type: Extract<TriggerType, "objective_completed" | "action_complete">;
  result_key?: string | null;
}

export interface ObjectiveTemplate {
  title: string;
  summary: string;
  target_tile_ref?: TargetRef | null;
  eligible_crew_conditions?: Condition[];
  required_action_type: string;
  required_action_params: JsonObject;
}

export type CrewActionType =
  | "move"
  | "survey"
  | "gather"
  | "build"
  | "extract"
  | "return_to_base"
  | "event_waiting"
  | "guarding_event_site";

export type CrewActionStatus = "queued" | "active" | "paused" | "completed" | "failed" | "interrupted" | "cancelled";

export interface CrewActionPatch {
  type?: CrewActionType;
  status?: CrewActionStatus;
  action_params?: JsonObject;
}

export interface CrewActionState {
  id: Id;
  crew_id: Id;
  type: CrewActionType;
  status: CrewActionStatus;
  source: "player_command" | "event_action_request" | "objective" | "system";
  parent_event_id?: Id | null;
  objective_id?: Id | null;
  action_request_id?: Id | null;
  from_tile_id?: Id | null;
  to_tile_id?: Id | null;
  target_tile_id?: Id | null;
  path_tile_ids?: Id[];
  started_at?: GameSeconds | null;
  ends_at?: GameSeconds | null;
  progress_seconds: number;
  duration_seconds: number;
  action_params: JsonObject;
  can_interrupt: boolean;
  interrupt_duration_seconds: number;
  blocking_claim_id?: Id | null;
  completion_trigger_context?: TriggerContext | null;
}

export interface CrewState {
  id: Id;
  display_name: string;
  tile_id: Id;
  status: "idle" | "moving" | "acting" | "in_event" | "unavailable" | "lost_contact";
  attributes: {
    strength: number;
    agility: number;
    intelligence: number;
    perception: number;
    luck: number;
  };
  personality_tags: string[];
  expertise_tags: string[];
  condition_tags: string[];
  communication_state: "available" | "busy_call" | "blocked" | "lost_contact";
  current_action_id?: Id | null;
  blocking_event_id?: Id | null;
  blocking_call_id?: Id | null;
  background_event_ids: Id[];
  inventory_id: Id;
  diary_entry_ids: Id[];
  event_history_keys: string[];
}

export interface TileState {
  id: Id;
  coordinates: {
    x: number;
    y: number;
  };
  terrain_type: string;
  tags: string[];
  danger_tags: string[];
  discovery_state: "unknown" | "known" | "visited" | "mapped";
  survey_state: "unsurveyed" | "surveying" | "surveyed" | "depleted";
  visibility: "hidden" | "visible" | "revealed_by_event";
  current_crew_ids: Id[];
  resource_nodes: TileResourceNode[];
  site_objects: SiteObject[];
  buildings: BuildingState[];
  event_marks: EventMark[];
  history_keys: string[];
  proximity_radius?: number;
}

export interface TileResourceNode {
  id: Id;
  resource_id: Id;
  amount: number;
  state: "hidden" | "discovered" | "depleted";
  event_tags?: string[];
}

export interface SiteObject {
  id: Id;
  object_type: string;
  tags: string[];
}

export interface BuildingState {
  id: Id;
  building_type: string;
  status: string;
}

export interface EventMark {
  id: Id;
  event_id: Id;
  label: string;
  created_at: GameSeconds;
}

export interface InventoryState {
  id: Id;
  owner_type: "crew" | "base" | "tile";
  owner_id: Id;
  items: InventoryItemStack[];
  resources: Record<Id, number>;
}

export interface InventoryItemStack {
  item_id: Id;
  quantity: number;
  instance_tags?: string[];
}

export type EventLogImportance = "minor" | "normal" | "major" | "critical";
export type EventLogVisibility = "player_visible" | "hidden_until_resolved";

export interface EventLog {
  id: Id;
  event_id: Id;
  event_definition_id: Id;
  occurred_at: GameSeconds;
  summary: string;
  crew_ids: Id[];
  tile_ids: Id[];
  objective_ids?: Id[];
  result_key?: string | null;
  importance: EventLogImportance;
  visibility: EventLogVisibility;
  history_keys: string[];
}

export type WorldHistoryScope = "world" | "crew" | "tile" | "crew_tile" | "objective" | "event";

export interface WorldHistoryEntry {
  key: string;
  scope: WorldHistoryScope;
  event_definition_id?: Id | null;
  event_id?: Id | null;
  crew_id?: Id | null;
  tile_id?: Id | null;
  objective_id?: Id | null;
  first_triggered_at: GameSeconds;
  last_triggered_at: GameSeconds;
  trigger_count: number;
  last_result?: string | null;
  cooldown_until?: GameSeconds | null;
  value?: unknown;
}

export interface WorldFlag {
  key: string;
  value: boolean | number | string;
  value_type: "boolean" | "number" | "string";
  created_at: GameSeconds;
  updated_at: GameSeconds;
  source_event_id?: Id | null;
  tags?: string[];
}

export interface EventRuntimeState {
  crew_actions: Record<Id, CrewActionState>;
  inventories: Record<Id, InventoryState>;
  active_events: Record<Id, RuntimeEvent>;
  active_calls: Record<Id, RuntimeCall>;
  objectives: Record<Id, Objective>;
  event_logs: EventLog[];
  world_history: Record<string, WorldHistoryEntry>;
  world_flags: Record<string, WorldFlag>;
  rng_state: object | null;
}

export interface SaveState extends EventRuntimeState {
  schema_version: typeof EVENT_SAVE_SCHEMA_VERSION;
  created_at_real_time: string;
  updated_at_real_time: string;
  elapsed_game_seconds: GameSeconds;
  crew: Record<Id, CrewState>;
  tiles: Record<Id, TileState>;
}

export function createEmptyEventRuntimeState(): EventRuntimeState {
  return {
    active_events: {},
    active_calls: {},
    objectives: {},
    event_logs: [],
    world_history: {},
    world_flags: {},
    crew_actions: {},
    inventories: {},
    rng_state: null,
  };
}
