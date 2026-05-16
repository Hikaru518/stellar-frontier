import handlerRegistryContent from "../../../../../content/events/handler_registry.json";
import type {
  Condition,
  ConditionType,
  Effect,
  EffectType,
  EventNode,
  EventNodeType,
  HandlerDefinition,
  TriggerDefinition,
  TriggerType,
} from "../../../../pc-client/src/events/types";
import {
  defineField,
  type CapabilityDefinition,
  type FormFieldConfig,
  type FormSelectOption,
} from "./formRegistry";
import { createDefaultEffectTemplate, createDefaultNodeTemplate, EVENT_NODE_TYPES } from "./templates";

export type TriggerCapability = CapabilityDefinition<"trigger", TriggerType, TriggerDefinition>;
export type ConditionCapability = CapabilityDefinition<"condition", ConditionType, Condition>;
export type EffectCapability = CapabilityDefinition<"effect", EffectType, Effect>;
export type NodeCapability = CapabilityDefinition<"node", EventNodeType, EventNode>;

const triggerTypeOptions = [
  option("arrival", "Arrival", "Crew arrives at a tile."),
  option("proximity", "Proximity", "Crew comes within range of one or more tiles."),
  option("action_complete", "Action complete", "A crew action completes."),
  option("idle_time", "Idle time", "Crew remains idle for a duration."),
  option("call_choice", "Call choice", "Player selects a call option."),
  option("event_node_finished", "Event node finished", "A runtime event node finishes."),
  option("objective_created", "Objective created", "An objective is created."),
  option("objective_completed", "Objective completed", "An objective completes."),
  option("world_flag_changed", "World flag changed", "A world flag changes value."),
  option("time_wakeup", "Time wakeup", "A scheduled wait wakes up."),
] as const satisfies readonly FormSelectOption[];

const conditionTypeOptions = [
  option("all_of", "All of", "All child conditions must pass."),
  option("any_of", "Any of", "At least one child condition must pass."),
  option("not", "Not", "Exactly one child condition is inverted."),
  option("compare_field", "Compare field", "Compare a field on a target object."),
  option("has_tag", "Has tag", "Target includes a tag."),
  option("lacks_tag", "Lacks tag", "Target does not include a tag."),
  option("has_condition", "Has condition", "Crew has a condition tag."),
  option("attribute_check", "Attribute check", "Compare one crew attribute."),
  option("inventory_has_item", "Inventory has item", "Inventory contains at least one item quantity."),
  option("resource_amount", "Resource amount", "Compare a resource amount."),
  option("tile_discovery_state", "Tile discovery state", "Compare a tile discovery state."),
  option("tile_survey_state", "Tile survey state", "Compare a tile survey state."),
  option("world_flag_equals", "World flag equals", "World flag value equals the expected value."),
  option("world_history_exists", "World history exists", "World history key has an entry."),
  option("world_history_count", "World history count", "Compare trigger count for a history key."),
  option("objective_status", "Objective status", "Compare runtime objective status."),
  option("event_status", "Event status", "Compare runtime event status."),
  option("event_current_node", "Event current node", "Compare a runtime event current node id."),
  option("crew_action_status", "Crew action status", "Compare a crew member's current action status."),
  option("time_compare", "Time compare", "Compare elapsed game time or a time field."),
  option("handler_condition", "Handler condition", "Delegate condition evaluation to a registered handler."),
] as const satisfies readonly FormSelectOption[];

const effectTypeOptions = [
  option("add_crew_condition", "Add crew condition", "Add a condition marker to a crew member."),
  option("remove_crew_condition", "Remove crew condition", "Remove a condition marker from a crew member."),
  option("update_crew_attribute", "Update crew attribute", "Patch or set one crew attribute."),
  option("add_personality_tag", "Add personality tag", "Add a personality tag to a crew member."),
  option("remove_personality_tag", "Remove personality tag", "Remove a personality tag from a crew member."),
  option("add_expertise_tag", "Add expertise tag", "Add an expertise tag to a crew member."),
  option("update_crew_location", "Update crew location", "Move runtime crew location state."),
  option("create_crew_action", "Create crew action", "Create a runtime crew action."),
  option("cancel_crew_action", "Cancel crew action", "Cancel a runtime crew action."),
  option("update_crew_action", "Update crew action", "Patch a runtime crew action."),
  option("update_tile_field", "Update tile field", "Patch an authored tile runtime field."),
  option("update_tile_state", "Update tile state", "Patch tile runtime state."),
  option("add_tile_tag", "Add tile tag", "Add a tag to a tile."),
  option("add_danger_tag", "Add danger tag", "Add a danger tag to a tile."),
  option("set_discovery_state", "Set discovery state", "Set a tile discovery state."),
  option("set_survey_state", "Set survey state", "Set a tile survey state."),
  option("add_event_mark", "Add event mark", "Add an event-local mark."),
  option("add_item", "Add item", "Add an item to an inventory."),
  option("remove_item", "Remove item", "Remove an item from an inventory."),
  option("transfer_item", "Transfer item", "Transfer an item between inventories."),
  option("add_resource", "Add resource", "Add resource quantity."),
  option("remove_resource", "Remove resource", "Remove resource quantity."),
  option("update_tile_resource", "Update tile resource", "Patch tile resource data."),
  option("create_objective", "Create objective", "Create a runtime objective."),
  option("update_objective", "Update objective", "Patch a runtime objective."),
  option("complete_objective", "Complete objective", "Complete a runtime objective."),
  option("fail_objective", "Fail objective", "Fail a runtime objective."),
  option("set_world_flag", "Set world flag", "Set a world flag value."),
  option("increment_world_counter", "Increment world counter", "Increment a numeric world counter."),
  option("write_world_history", "Write world history", "Write a world history entry."),
  option("add_event_log", "Add event log", "Add an event log entry."),
  option("add_diary_entry", "Add diary entry", "Add a crew diary entry."),
  option("spawn_event", "Spawn event", "Spawn another event definition."),
  option("unlock_event_definition", "Unlock event definition", "Unlock another event definition."),
  option("handler_effect", "Handler effect", "Delegate effect execution to a registered handler."),
  option("set_feature_status", "Set feature status", "Set a MapFeature runtime status."),
  option("set_feature_revealed", "Set feature revealed", "Set whether a MapFeature is explicitly revealed."),
  option("set_object_status", "Set object status", "Set a map object runtime status."),
] as const satisfies readonly FormSelectOption[];

const nodeTypeOptions: readonly FormSelectOption[] = EVENT_NODE_TYPES.map((type) => option(type, nodeLabel(type)));

const compareOperatorOptions = [
  option("equals", "Equals"),
  option("not_equals", "Not equals"),
  option("gt", "Greater than"),
  option("gte", "Greater or equal"),
  option("lt", "Less than"),
  option("lte", "Less or equal"),
  option("includes", "Includes"),
  option("not_includes", "Does not include"),
] as const satisfies readonly FormSelectOption[];

const targetTypeOptions = [
  option("primary_crew", "Primary crew"),
  option("related_crew", "Related crew"),
  option("crew_id", "Crew id"),
  option("event_tile", "Event tile"),
  option("tile_id", "Tile id"),
  option("active_event", "Active event"),
  option("parent_event", "Parent event"),
  option("child_event", "Child event"),
  option("objective_id", "Objective id"),
  option("crew_inventory", "Crew inventory"),
  option("base_inventory", "Base inventory"),
  option("base_resources", "Base resources"),
  option("tile_resources", "Tile resources"),
  option("world_flags", "World flags"),
  option("world_history", "World history"),
  option("event_log", "Event log"),
] as const satisfies readonly FormSelectOption[];

const effectFailurePolicyOptions = [
  option("fail_event", "Fail event"),
  option("skip_effect", "Skip effect"),
  option("skip_group", "Skip group"),
  option("retry_later", "Retry later"),
] as const satisfies readonly FormSelectOption[];

const objectiveStatusOptions = [
  option("available", "Available"),
  option("assigned", "Assigned"),
  option("in_progress", "In progress"),
  option("completed", "Completed"),
  option("failed", "Failed"),
  option("expired", "Expired"),
  option("cancelled", "Cancelled"),
] as const satisfies readonly FormSelectOption[];

const eventStatusOptions = [
  option("active", "Active"),
  option("waiting_call", "Waiting call"),
  option("waiting_time", "Waiting time"),
  option("waiting_action", "Waiting action"),
  option("waiting_objective", "Waiting objective"),
  option("resolving", "Resolving"),
  option("resolved", "Resolved"),
  option("cancelled", "Cancelled"),
  option("expired", "Expired"),
  option("failed", "Failed"),
] as const satisfies readonly FormSelectOption[];

const crewActionStatusOptions = [
  option("queued", "Queued"),
  option("active", "Active"),
  option("paused", "Paused"),
  option("completed", "Completed"),
  option("failed", "Failed"),
  option("interrupted", "Interrupted"),
  option("cancelled", "Cancelled"),
] as const satisfies readonly FormSelectOption[];

const callUrgencyOptions = [
  option("normal", "Normal"),
  option("urgent", "Urgent"),
  option("emergency", "Emergency"),
] as const satisfies readonly FormSelectOption[];

const callDeliveryOptions = [
  option("incoming_call", "Incoming call"),
  option("auto_report", "Auto report"),
  option("queued_message", "Queued message"),
] as const satisfies readonly FormSelectOption[];

const wakeTriggerTypeOptions = [
  option("time_wakeup", "Time wakeup"),
  option("event_node_finished", "Event node finished"),
] as const satisfies readonly FormSelectOption[];

const interruptPolicyOptions = [
  option("not_interruptible", "Not interruptible"),
  option("player_can_cancel", "Player can cancel"),
  option("event_can_cancel", "Event can cancel"),
] as const satisfies readonly FormSelectOption[];

const seedScopeOptions = [
  option("event_instance", "Event instance"),
  option("node_entry", "Node entry"),
  option("trigger_context", "Trigger context"),
] as const satisfies readonly FormSelectOption[];

const actionTypeOptions = [
  option("move", "Move"),
  option("survey", "Survey"),
  option("gather", "Gather"),
  option("build", "Build"),
  option("extract", "Extract"),
  option("return_to_base", "Return to base"),
  option("event_waiting", "Event waiting"),
  option("guarding_event_site", "Guarding event site"),
  option("custom_handler_action", "Custom handler action"),
] as const satisfies readonly FormSelectOption[];

const objectiveModeOptions = [
  option("create_and_wait", "Create and wait"),
  option("create_and_continue", "Create and continue"),
] as const satisfies readonly FormSelectOption[];

const spawnPolicyOptions = [
  option("immediate", "Immediate"),
  option("deferred_until_trigger", "Deferred until trigger"),
] as const satisfies readonly FormSelectOption[];

const terminalResolutionOptions = [
  option("resolved", "Resolved"),
  option("cancelled", "Cancelled"),
  option("expired", "Expired"),
  option("failed", "Failed"),
] as const satisfies readonly FormSelectOption[];

const handlerDefinitions = (handlerRegistryContent.handlers ?? []) as HandlerDefinition[];

export const conditionHandlerOptions = handlerDefinitions
  .filter((handler) => handler.kind === "condition")
  .map((handler) =>
    option(handler.handler_type, labelFromId(handler.handler_type), handler.description, {
      allowedTargetTypes: handler.allowed_target_types,
      paramsSchemaRef: handler.params_schema_ref,
    }),
  );

export const effectHandlerOptions = handlerDefinitions
  .filter((handler) => handler.kind === "effect")
  .map((handler) =>
    option(handler.handler_type, labelFromId(handler.handler_type), handler.description, {
      allowedTargetTypes: handler.allowed_target_types,
      paramsSchemaRef: handler.params_schema_ref,
    }),
  );

export const triggerCapabilities = [
  triggerCapability({
    type: "arrival",
    label: "Arrival",
    description: "Runs when a crew member arrives at a map tile.",
    requiredContext: ["crew_id", "tile_id"],
    commonUse: "Start tile-local discoveries, hazards, or call-ins after movement completes.",
  }),
  triggerCapability({
    type: "proximity",
    label: "Proximity",
    description: "Runs when a crew member is near authored map locations.",
    requiredContext: ["crew_id", "tile_id", "proximity"],
    commonUse: "Warn about nearby hazards or reveal signals before the crew steps onto a tile.",
  }),
  triggerCapability({
    type: "action_complete",
    label: "Action complete",
    description: "Runs when a crew action finishes and reports its context payload.",
    requiredContext: ["crew_id", "tile_id", "action_id"],
    commonUse: "Branch from survey, gather, build, extract, or other authored action results.",
  }),
  triggerCapability({
    type: "idle_time",
    label: "Idle time",
    description: "Runs after a crew member has stayed idle long enough.",
    requiredContext: ["crew_id", "tile_id"],
    commonUse: "Create ambient interruptions or follow-up reports when a crew member waits.",
  }),
  triggerCapability({
    type: "call_choice",
    label: "Call choice",
    description: "Runs after the player picks an option in a call.",
    requiredContext: ["call_id", "selected_option_id"],
    commonUse: "Start follow-up event definitions from a call decision.",
  }),
  triggerCapability({
    type: "event_node_finished",
    label: "Event node finished",
    description: "Runs when a runtime event node completes.",
    requiredContext: ["event_id", "event_definition_id", "node_id"],
    commonUse: "Chain event definitions after a specific authored node is done.",
  }),
  triggerCapability({
    type: "objective_created",
    label: "Objective created",
    description: "Runs when an objective enters runtime state.",
    requiredContext: ["objective_id"],
    commonUse: "Attach reminders or supporting events to newly created objectives.",
  }),
  triggerCapability({
    type: "objective_completed",
    label: "Objective completed",
    description: "Runs when an objective reaches completed status.",
    requiredContext: ["objective_id"],
    commonUse: "Resolve quest chains or unlock follow-up calls when an objective succeeds.",
  }),
  triggerCapability({
    type: "world_flag_changed",
    label: "World flag changed",
    description: "Runs when a world flag receives a new value.",
    requiredContext: ["world_flag_key"],
    commonUse: "React to global state transitions without binding to a specific map action.",
  }),
  triggerCapability({
    type: "time_wakeup",
    label: "Time wakeup",
    description: "Runs when a scheduled wait or timer wakes.",
    requiredContext: ["event_id", "node_id"],
    commonUse: "Resume delayed events after a wait node or timer expires.",
  }),
] as const satisfies readonly TriggerCapability[];

export const conditionCapabilities = [
  conditionCapability({
    type: "all_of",
    label: "All of",
    description: "Passes only when every child condition passes.",
    fields: [conditionsField("Child conditions that must all pass.")],
    requiredFields: ["conditions"],
    template: { type: "all_of", conditions: [placeholderCondition()] },
    commonUse: "Gate an option or branch behind multiple requirements.",
  }),
  conditionCapability({
    type: "any_of",
    label: "Any of",
    description: "Passes when at least one child condition passes.",
    fields: [conditionsField("Child conditions where one passing child is enough.")],
    requiredFields: ["conditions"],
    template: { type: "any_of", conditions: [placeholderCondition()] },
    commonUse: "Allow alternate resources, tags, or previous discoveries to satisfy a branch.",
  }),
  conditionCapability({
    type: "not",
    label: "Not",
    description: "Passes when its single child condition does not pass.",
    fields: [conditionsField("Exactly one child condition to invert.")],
    requiredFields: ["conditions"],
    template: { type: "not", conditions: [placeholderCondition()] },
    commonUse: "Hide choices that are already resolved or unavailable.",
  }),
  conditionCapability({
    type: "compare_field",
    label: "Compare field",
    description: "Reads a field from a target and compares it with a value.",
    fields: [targetField("Target object to read."), fieldPathField("Field path on the target."), compareField(), valueField("Expected value.")],
    requiredFields: ["target", "field", "op", "value"],
    template: { type: "compare_field", target: { type: "world_flags" }, field: "TODO_FIELD.value", op: "equals", value: true },
    commonUse: "Compare world flag payloads, counters, or authored runtime fields.",
  }),
  conditionCapability({
    type: "has_tag",
    label: "Has tag",
    description: "Passes when the target contains the requested tag.",
    fields: [targetField("Target object whose tags are checked."), fieldPathField("Optional tag array field override.", false), valueTextField("Tag id.")],
    requiredFields: ["target", "value"],
    template: { type: "has_tag", target: { type: "primary_crew" }, value: "TODO_TAG" },
    commonUse: "Gate options by crew personality, expertise, condition, tile, or object tags.",
  }),
  conditionCapability({
    type: "lacks_tag",
    label: "Lacks tag",
    description: "Passes when the target does not contain the requested tag.",
    fields: [targetField("Target object whose tags are checked."), fieldPathField("Optional tag array field override.", false), valueTextField("Tag id.")],
    requiredFields: ["target", "value"],
    template: { type: "lacks_tag", target: { type: "primary_crew" }, value: "TODO_TAG" },
    commonUse: "Block duplicate beats or risky options when a tag is already present.",
  }),
  conditionCapability({
    type: "has_condition",
    label: "Has condition",
    description: "Passes when a crew target has the requested condition tag.",
    fields: [targetField("Crew target to inspect.", false), valueTextField("Condition tag id.")],
    requiredFields: ["value"],
    template: { type: "has_condition", target: { type: "primary_crew" }, value: "TODO_CONDITION" },
    commonUse: "Check wounded, trained, learned, or other crew condition markers.",
  }),
  conditionCapability({
    type: "attribute_check",
    label: "Attribute check",
    description: "Compares a crew attribute against an expected value.",
    fields: [targetField("Crew target to inspect.", false), fieldPathField("Attribute id."), compareField(), valueField("Expected numeric value.")],
    requiredFields: ["field", "op", "value"],
    template: { type: "attribute_check", target: { type: "primary_crew" }, field: "intellect", op: "gte", value: 3 },
    commonUse: "Gate success paths by physical, agility, intellect, perception, or luck.",
  }),
  conditionCapability({
    type: "inventory_has_item",
    label: "Inventory has item",
    description: "Passes when an inventory contains at least the requested item quantity.",
    fields: [
      targetField("Inventory target to inspect.", false),
      valueTextField("Item id."),
      jsonField("params", "Params", "Handler-style params, usually { \"min_quantity\": 1 }.", false),
    ],
    requiredFields: ["value", "params.min_quantity"],
    template: { type: "inventory_has_item", target: { type: "crew_inventory" }, value: "TODO_ITEM", params: { min_quantity: 1 } },
    commonUse: "Require a tool, traded item, sample, or consumable before offering an option.",
  }),
  conditionCapability({
    type: "resource_amount",
    label: "Resource amount",
    description: "Compares a resource amount on base or tile resources.",
    fields: [targetField("Resource target to inspect.", false), fieldPathField("Resource id."), compareField(), valueField("Expected numeric amount.")],
    requiredFields: ["field", "op", "value"],
    template: { type: "resource_amount", target: { type: "base_resources" }, field: "TODO_RESOURCE", op: "gte", value: 1 },
    commonUse: "Check whether the base or a tile has enough authored resource stock.",
  }),
  conditionCapability({
    type: "tile_discovery_state",
    label: "Tile discovery state",
    description: "Compares a tile's discovery_state field.",
    fields: [targetField("Tile target to inspect.", false), compareField("Comparison operator.", false), valueTextField("Expected discovery state.")],
    requiredFields: ["value"],
    template: { type: "tile_discovery_state", target: { type: "event_tile" }, op: "equals", value: "discovered" },
    commonUse: "Gate events by whether a tile has been discovered.",
  }),
  conditionCapability({
    type: "tile_survey_state",
    label: "Tile survey state",
    description: "Compares a tile's survey_state field.",
    fields: [targetField("Tile target to inspect.", false), compareField("Comparison operator.", false), valueTextField("Expected survey state.")],
    requiredFields: ["value"],
    template: { type: "tile_survey_state", target: { type: "event_tile" }, op: "equals", value: "surveyed" },
    commonUse: "Gate follow-up content by tile survey progress.",
  }),
  conditionCapability({
    type: "world_flag_equals",
    label: "World flag equals",
    description: "Passes when a world flag value equals the expected value.",
    fields: [fieldPathField("World flag key."), valueField("Expected flag value.")],
    requiredFields: ["field", "value"],
    template: { type: "world_flag_equals", field: "TODO_FLAG", value: true },
    commonUse: "Check authored global state switches and booleans.",
  }),
  conditionCapability({
    type: "world_history_exists",
    label: "World history exists",
    description: "Passes when a world history key exists.",
    fields: [fieldPathField("World history key.")],
    requiredFields: ["field"],
    template: { type: "world_history_exists", field: "TODO_HISTORY_KEY" },
    commonUse: "Avoid replaying once-only beats or check prior discoveries.",
  }),
  conditionCapability({
    type: "world_history_count",
    label: "World history count",
    description: "Compares trigger_count for a world history key.",
    fields: [fieldPathField("World history key."), compareField(), valueField("Expected count.")],
    requiredFields: ["field", "op", "value"],
    template: { type: "world_history_count", field: "TODO_HISTORY_KEY", op: "gte", value: 1 },
    commonUse: "Branch on how many times a repeatable event has fired.",
  }),
  conditionCapability({
    type: "objective_status",
    label: "Objective status",
    description: "Compares a runtime objective's status.",
    fields: [targetField("Objective target to inspect.", false), compareField("Comparison operator.", false), valueSelectField("Expected objective status.", objectiveStatusOptions)],
    requiredFields: ["value"],
    template: { type: "objective_status", target: { type: "objective_id" }, op: "equals", value: "completed" },
    commonUse: "Wait for or react to objective progress.",
  }),
  conditionCapability({
    type: "event_status",
    label: "Event status",
    description: "Compares a runtime event's status.",
    fields: [targetField("Event target to inspect.", false), compareField("Comparison operator.", false), valueSelectField("Expected event status.", eventStatusOptions)],
    requiredFields: ["value"],
    template: { type: "event_status", target: { type: "active_event" }, op: "equals", value: "active" },
    commonUse: "Coordinate parent, child, or active event chains.",
  }),
  conditionCapability({
    type: "event_current_node",
    label: "Event current node",
    description: "Compares a runtime event's current_node_id.",
    fields: [targetField("Event target to inspect.", false), compareField("Comparison operator.", false), valueTextField("Expected node id.")],
    requiredFields: ["value"],
    template: { type: "event_current_node", target: { type: "active_event" }, op: "equals", value: "TODO_NODE_ID" },
    commonUse: "Gate content while another event is sitting on a specific node.",
  }),
  conditionCapability({
    type: "crew_action_status",
    label: "Crew action status",
    description: "Compares the status of a crew member's current action.",
    fields: [targetField("Crew target to inspect.", false), compareField("Comparison operator.", false), valueSelectField("Expected action status.", crewActionStatusOptions)],
    requiredFields: ["value"],
    template: { type: "crew_action_status", target: { type: "primary_crew" }, op: "equals", value: "active" },
    commonUse: "Check whether a crew member is busy, paused, completed, or interrupted.",
  }),
  conditionCapability({
    type: "time_compare",
    label: "Time compare",
    description: "Compares elapsed game time, or a time field when a target and field are supplied.",
    fields: [targetField("Optional target with a time field.", false), fieldPathField("Optional time field path.", false), compareField(), valueField("Expected game seconds.")],
    requiredFields: ["op", "value"],
    template: { type: "time_compare", op: "gte", value: 0 },
    commonUse: "Gate delayed branches, deadlines, or time-window checks.",
  }),
  conditionCapability({
    type: "handler_condition",
    label: "Handler condition",
    description: "Evaluates a registered condition handler with optional target and params.",
    fields: [
      selectField("handler_type", "Handler type", "Condition handler from content/events/handler_registry.json.", conditionHandlerOptions),
      targetField("Optional target allowed by the selected handler.", false),
      jsonField("params", "Params", "JSON params accepted by the selected handler.", false),
    ],
    requiredFields: ["handler_type", "params"],
    template: { type: "handler_condition", handler_type: conditionHandlerOptions[0]?.value ?? "TODO_HANDLER", params: {} },
    commonUse: "Use bespoke runtime checks while keeping editor choices limited to condition handlers.",
  }),
] as const satisfies readonly ConditionCapability[];

export const effectCapabilities = [
  effectCapability({
    type: "add_crew_condition",
    label: "Add crew condition",
    description: "Adds a condition marker to a crew member.",
    commonUse: "Record temporary injuries, learned state, or authored crew status markers.",
  }),
  effectCapability({
    type: "remove_crew_condition",
    label: "Remove crew condition",
    description: "Removes a condition marker from a crew member.",
    commonUse: "Clear temporary crew state after treatment, rest, or resolution.",
  }),
  effectCapability({
    type: "update_crew_attribute",
    label: "Update crew attribute",
    description: "Updates a crew attribute value.",
    commonUse: "Apply authored stat changes from special event outcomes.",
  }),
  effectCapability({
    type: "add_personality_tag",
    label: "Add personality tag",
    description: "Adds a personality tag to a crew member.",
    commonUse: "Record a lasting personality beat unlocked by an event.",
  }),
  effectCapability({
    type: "remove_personality_tag",
    label: "Remove personality tag",
    description: "Removes a personality tag from a crew member.",
    commonUse: "Replace or clear personality state after a story resolution.",
  }),
  effectCapability({
    type: "add_expertise_tag",
    label: "Add expertise tag",
    description: "Adds an expertise tag to a crew member.",
    commonUse: "Grant a lightweight specialty from training, discovery, or practice.",
  }),
  effectCapability({
    type: "update_crew_location",
    label: "Update crew location",
    description: "Updates runtime crew location state.",
    commonUse: "Move a crew member through event-driven relocation or rescue outcomes.",
  }),
  effectCapability({
    type: "create_crew_action",
    label: "Create crew action",
    description: "Creates a runtime crew action.",
    commonUse: "Start an authored action from an event effect.",
  }),
  effectCapability({
    type: "cancel_crew_action",
    label: "Cancel crew action",
    description: "Cancels a runtime crew action.",
    commonUse: "Interrupt or resolve a crew action after event consequences.",
  }),
  effectCapability({
    type: "update_crew_action",
    label: "Update crew action",
    description: "Patches a runtime crew action.",
    commonUse: "Change action status, metadata, or progress from authored outcomes.",
  }),
  effectCapability({
    type: "update_tile_field",
    label: "Update tile field",
    description: "Updates a tile field.",
    commonUse: "Patch authored tile state such as terrain notes or runtime annotations.",
  }),
  effectCapability({
    type: "update_tile_state",
    label: "Update tile state",
    description: "Updates a tile runtime state field.",
    commonUse: "Record tile-level progress, hazards, or authored state transitions.",
  }),
  effectCapability({
    type: "add_tile_tag",
    label: "Add tile tag",
    description: "Adds a tag to a tile.",
    commonUse: "Mark a tile with authored state that later conditions can inspect.",
  }),
  effectCapability({
    type: "add_danger_tag",
    label: "Add danger tag",
    description: "Adds a danger tag to a tile.",
    commonUse: "Record discovered or spawned hazards on the map.",
  }),
  effectCapability({
    type: "set_discovery_state",
    label: "Set discovery state",
    description: "Sets a tile discovery state.",
    commonUse: "Reveal, rediscover, or hide tile discovery state through an event.",
  }),
  effectCapability({
    type: "set_survey_state",
    label: "Set survey state",
    description: "Sets a tile survey state.",
    commonUse: "Record partial or complete survey progress on a tile.",
  }),
  effectCapability({
    type: "add_event_mark",
    label: "Add event mark",
    description: "Adds a marker to event runtime state.",
    commonUse: "Store event-local markers used by later branches or cleanup.",
  }),
  effectCapability({
    type: "add_item",
    label: "Add item",
    description: "Adds an item to an inventory.",
    commonUse: "Reward samples, tools, or traded goods from an event.",
  }),
  effectCapability({
    type: "remove_item",
    label: "Remove item",
    description: "Removes an item from an inventory.",
    commonUse: "Consume tools, samples, or trade goods during an event.",
  }),
  effectCapability({
    type: "transfer_item",
    label: "Transfer item",
    description: "Transfers an item between inventories.",
    commonUse: "Move loot, samples, or tools between crew and base inventory.",
  }),
  effectCapability({
    type: "add_resource",
    label: "Add resource",
    description: "Adds resource quantity.",
    commonUse: "Reward base or tile resources after gathering, repair, or trade.",
  }),
  effectCapability({
    type: "remove_resource",
    label: "Remove resource",
    description: "Removes resource quantity.",
    commonUse: "Spend resources as an event cost or repair requirement.",
  }),
  effectCapability({
    type: "update_tile_resource",
    label: "Update tile resource",
    description: "Updates resource data on a tile.",
    commonUse: "Patch authored resource availability at a map location.",
  }),
  effectCapability({
    type: "create_objective",
    label: "Create objective",
    description: "Creates a runtime objective.",
    commonUse: "Turn an event result into follow-up work visible to the player.",
  }),
  effectCapability({
    type: "update_objective",
    label: "Update objective",
    description: "Patches a runtime objective.",
    commonUse: "Change objective status, text, or metadata from event progress.",
  }),
  effectCapability({
    type: "complete_objective",
    label: "Complete objective",
    description: "Marks a runtime objective completed.",
    commonUse: "Resolve player-facing follow-up work after success.",
  }),
  effectCapability({
    type: "fail_objective",
    label: "Fail objective",
    description: "Marks a runtime objective failed.",
    commonUse: "Resolve player-facing follow-up work after failure or expiry.",
  }),
  effectCapability({
    type: "set_world_flag",
    label: "Set world flag",
    description: "Sets a world flag value.",
    commonUse: "Record global switches that later conditions and events can read.",
  }),
  effectCapability({
    type: "increment_world_counter",
    label: "Increment world counter",
    description: "Increments a numeric world counter.",
    commonUse: "Track repeated discoveries, encounters, or authored global tallies.",
  }),
  effectCapability({
    type: "write_world_history",
    label: "Write world history",
    description: "Writes a world history entry.",
    commonUse: "Persist hidden history used for dedupe, branching, or future context.",
  }),
  effectCapability({
    type: "add_event_log",
    label: "Add event log",
    description: "Adds an event log entry.",
    commonUse: "Write player-visible or internal event records.",
  }),
  effectCapability({
    type: "add_diary_entry",
    label: "Add diary entry",
    description: "Adds a diary entry to a crew member.",
    commonUse: "Unlock crew narrative notes after important outcomes.",
  }),
  effectCapability({
    type: "spawn_event",
    label: "Spawn event",
    description: "Spawns another event definition.",
    commonUse: "Start follow-up or child events from a resolved branch.",
  }),
  effectCapability({
    type: "unlock_event_definition",
    label: "Unlock event definition",
    description: "Unlocks another event definition.",
    commonUse: "Enable later content after a discovery or milestone.",
  }),
  effectCapability({
    type: "handler_effect",
    label: "Handler effect",
    description: "Executes a registered effect handler with optional target and params.",
    fields: [
      selectField("handler_type", "Handler type", "Effect handler from content/events/handler_registry.json.", effectHandlerOptions),
    ],
    requiredFields: ["handler_type"],
    template: createDefaultEffectTemplate({
      type: "handler_effect",
      handlerType: effectHandlerOptions[0]?.value ?? "TODO_HANDLER",
    }),
    commonUse: "Use bespoke runtime effects while keeping editor choices limited to effect handlers.",
  }),
  effectCapability({
    type: "set_feature_status",
    label: "Set feature status",
    description: "Sets a MapFeature runtime status.",
    fields: [
      textField("params.feature_id", "Feature id", "Feature id in the authored map."),
      textField("params.status", "Status", "Runtime status value to write."),
    ],
    requiredFields: ["params.feature_id", "params.status"],
    template: createDefaultEffectTemplate({ type: "set_feature_status" }),
    commonUse: "Record repair, investigation, damage, or other feature-level state changes.",
  }),
  effectCapability({
    type: "set_feature_revealed",
    label: "Set feature revealed",
    description: "Sets whether a MapFeature is explicitly revealed.",
    fields: [
      textField("params.feature_id", "Feature id", "Feature id in the authored map."),
      booleanField("params.revealed", "Revealed", "Whether the feature should be visible from runtime reveal state.", true, true),
    ],
    requiredFields: ["params.feature_id", "params.revealed"],
    template: createDefaultEffectTemplate({ type: "set_feature_revealed" }),
    commonUse: "Reveal or hide feature-specific map signals without changing feature status.",
  }),
  effectCapability({
    type: "set_object_status",
    label: "Set object status",
    description: "Sets a map object runtime status.",
    commonUse: "Update authored map object state after repair, damage, activation, or discovery.",
  }),
] as const satisfies readonly EffectCapability[];

export const nodeCapabilities = [
  nodeCapability({
    type: "call",
    label: "Call",
    description: "Presents a communication beat with player-selectable options.",
    fields: [
      textField("call_template_id", "Call template", "Call template id bound to this node."),
      targetRefField("speaker_crew_ref", "Speaker", "Crew or target reference used as the call speaker."),
      selectField("urgency", "Urgency", "Call urgency.", callUrgencyOptions, true, "normal"),
      selectField("delivery", "Delivery", "How the call is delivered to the player.", callDeliveryOptions, true, "queued_message"),
      jsonField("options", "Options", "Call options available to the player.", true),
      jsonField("option_node_mapping", "Option mapping", "Map option ids to next node ids.", true),
    ],
    requiredFields: ["call_template_id", "speaker_crew_ref", "urgency", "delivery", "options", "option_node_mapping"],
    commonUse: "Ask for a player decision, deliver a report, or route the graph from a communication choice.",
  }),
  nodeCapability({
    type: "wait",
    label: "Wait",
    description: "Pauses graph progress until a timer or node-finished trigger resumes it.",
    fields: [
      numberField("duration_seconds", "Duration", "Wait duration in game seconds.", true, 60),
      selectField("wake_trigger_type", "Wake trigger", "Trigger that wakes the wait node.", wakeTriggerTypeOptions, true, "time_wakeup"),
      textField("next_node_id", "Next node", "Node to enter when the wait completes."),
      booleanField("set_next_wakeup_at", "Set wakeup", "Whether runtime should store the next wakeup timestamp.", true, true),
      selectField("interrupt_policy", "Interrupt policy", "How this wait can be interrupted.", interruptPolicyOptions, true, "not_interruptible"),
      jsonField("on_interrupted", "On interrupted", "Optional interruption transition.", false),
    ],
    requiredFields: ["duration_seconds", "wake_trigger_type", "next_node_id", "set_next_wakeup_at", "interrupt_policy"],
    commonUse: "Delay follow-up calls, staged hazards, or objective checks without resolving the event.",
  }),
  nodeCapability({
    type: "check",
    label: "Check",
    description: "Evaluates ordered condition branches and routes to the first match.",
    fields: [
      jsonField("branches", "Branches", "Ordered condition branches.", true),
      textField("default_next_node_id", "Default next node", "Fallback node when no branch matches."),
      selectField("evaluation_order", "Evaluation order", "How branches are evaluated.", [option("first_match", "First match")], true, "first_match"),
    ],
    requiredFields: ["branches", "default_next_node_id", "evaluation_order"],
    commonUse: "Branch graph flow by world state, crew state, tags, objectives, or prior choices.",
  }),
  nodeCapability({
    type: "skill_check",
    label: "Skill check",
    description: "Rolls a visible d20 check against a crew attribute and routes by success or failure.",
    fields: [
      selectField(
        "attribute",
        "Attribute",
        "Crew attribute added to the d20 roll.",
        [
          option("strength", "Strength"),
          option("agility", "Agility"),
          option("intelligence", "Intelligence"),
          option("perception", "Perception"),
          option("luck", "Luck"),
        ],
        true,
        "perception",
      ),
      textField("attribute_label", "Attribute label", "Player-facing attribute label in transcript."),
      numberField("dc", "DC", "Required total for success.", true, 12),
      numberField("die_sides", "Die sides", "Number of die sides; visible checks normally use d20.", true, 20),
      textField("store_result_as", "Store result as", "Runtime key for this check result."),
      textField("success_node_id", "Success node", "Node entered when d20 + modifier >= DC."),
      textField("failure_node_id", "Failure node", "Node entered when the check fails."),
      jsonField("success_effect_refs", "Success effect refs", "Optional effects applied on success.", false),
      jsonField("failure_effect_refs", "Failure effect refs", "Optional effects applied on failure.", false),
    ],
    requiredFields: ["attribute", "attribute_label", "dc", "die_sides", "store_result_as", "success_node_id", "failure_node_id"],
    commonUse: "Expose DND-style player-visible checks inside call-driven event branches.",
  }),
  nodeCapability({
    type: "random",
    label: "Random",
    description: "Chooses a weighted branch with deterministic seed scoping.",
    fields: [
      selectField("seed_scope", "Seed scope", "Stable seed source for the roll.", seedScopeOptions, true, "event_instance"),
      jsonField("branches", "Branches", "Weighted random branches.", true),
      textField("default_next_node_id", "Default next node", "Optional fallback node when no branch applies.", false),
      textField("store_result_as", "Store result as", "Runtime key for the selected branch result."),
    ],
    requiredFields: ["seed_scope", "branches", "default_next_node_id", "store_result_as"],
    commonUse: "Vary outcomes while keeping replayable event instances deterministic.",
  }),
  nodeCapability({
    type: "action_request",
    label: "Action request",
    description: "Requests a crew action and waits for accepted, completed, or failed outcomes.",
    fields: [
      textField("request_id", "Request id", "Stable request id authored for this action request."),
      selectField("action_type", "Action type", "Crew action type to request.", actionTypeOptions, true, "survey"),
      targetRefField("target_crew_ref", "Target crew", "Crew target that should perform the action."),
      targetRefField("target_tile_ref", "Target tile", "Optional tile target for the action.", false),
      jsonField("action_params", "Action params", "Action-specific parameter object.", true),
      jsonField("acceptance_conditions", "Acceptance conditions", "Optional conditions for accepting this request.", false),
      jsonField("completion_trigger", "Completion trigger", "Trigger that completes this request.", true),
      textField("on_accepted_node_id", "Accepted node", "Optional node entered when the action is accepted.", false),
      textField("on_completed_node_id", "Completed node", "Node entered when the action completes."),
      textField("on_failed_node_id", "Failed node", "Node entered when the action fails."),
      booleanField("occupies_crew_action", "Occupies crew action", "Whether this request claims the crew action slot.", true, true),
    ],
    requiredFields: [
      "request_id",
      "action_type",
      "target_crew_ref",
      "action_params",
      "completion_trigger",
      "on_completed_node_id",
      "on_failed_node_id",
      "occupies_crew_action",
    ],
    commonUse: "Turn an event choice into a concrete crew task such as survey, gather, or repair.",
  }),
  nodeCapability({
    type: "objective",
    label: "Objective",
    description: "Creates an objective and optionally waits for objective completion or failure.",
    fields: [
      jsonField("objective_template", "Objective template", "Objective title, summary, target, and required action.", true),
      selectField("mode", "Mode", "Whether the graph waits after creating the objective.", objectiveModeOptions, true, "create_and_wait"),
      textField("on_created_node_id", "Created node", "Optional node entered immediately after objective creation.", false),
      textField("on_completed_node_id", "Completed node", "Node entered when the objective completes."),
      textField("on_failed_node_id", "Failed node", "Optional node entered when the objective fails.", false),
      booleanField("parent_event_link", "Parent event link", "Whether the objective is linked to the parent event.", true, true),
    ],
    requiredFields: ["objective_template", "mode", "on_completed_node_id", "parent_event_link"],
    commonUse: "Create player-facing follow-up work that can outlive the immediate call.",
  }),
  nodeCapability({
    type: "spawn_event",
    label: "Spawn event",
    description: "Starts another event definition and then continues this graph.",
    fields: [
      textField("event_definition_id", "Event definition", "Event definition id to spawn."),
      selectField("spawn_policy", "Spawn policy", "When the child event is spawned.", spawnPolicyOptions, true, "immediate"),
      jsonField("context_mapping", "Context mapping", "Mapping from child context fields to parent context fields.", true),
      booleanField("parent_event_link", "Parent event link", "Whether the child is linked to this parent event.", true, true),
      textField("dedupe_key_template", "Dedupe key", "Optional dedupe key for the spawned event.", false),
      textField("next_node_id", "Next node", "Node entered after spawning."),
    ],
    requiredFields: ["event_definition_id", "spawn_policy", "context_mapping", "parent_event_link", "next_node_id"],
    commonUse: "Split larger arcs into reusable child events while preserving parent context.",
  }),
  nodeCapability({
    type: "log_only",
    label: "Log only",
    description: "Writes event log or history records, then immediately continues.",
    fields: [
      textField("event_log_template_id", "Event log template", "Event log template id to write."),
      jsonField("effect_refs", "Effect refs", "Optional effect refs executed with this log node.", false),
      jsonField("history_writes", "History writes", "Optional history writes.", false),
      textField("next_node_id", "Next node", "Node entered after writing the log."),
    ],
    requiredFields: ["event_log_template_id", "next_node_id"],
    commonUse: "Record a beat, marker, or hidden state transition without interrupting graph flow.",
  }),
  nodeCapability({
    type: "end",
    label: "End",
    description: "Terminates the event with final result and cleanup behavior.",
    fields: [
      selectField("resolution", "Resolution", "Terminal event status.", terminalResolutionOptions, true, "resolved"),
      textField("result_key", "Result key", "Stable result key stored on runtime history."),
      jsonField("final_effect_refs", "Final effect refs", "Optional final effect refs.", false),
      textField("event_log_template_id", "Event log template", "Event log template id written on resolution."),
      jsonField("history_writes", "History writes", "History entries written on resolution.", true),
      jsonField("cleanup_policy", "Cleanup policy", "Blocking and call cleanup behavior.", true),
    ],
    requiredFields: ["resolution", "result_key", "event_log_template_id", "history_writes", "cleanup_policy"],
    commonUse: "Resolve, cancel, expire, or fail the active event and release runtime claims.",
  }),
] as const satisfies readonly NodeCapability[];

const conditionCapabilityByType = new Map<ConditionType, ConditionCapability>(
  conditionCapabilities.map((capability) => [capability.type, capability]),
);

const effectCapabilityByType = new Map<EffectType, EffectCapability>(
  effectCapabilities.map((capability) => [capability.type, capability]),
);

const nodeCapabilityByType = new Map<EventNodeType, NodeCapability>(
  nodeCapabilities.map((capability) => [capability.type, capability]),
);

export function getConditionCapability(type: ConditionType): ConditionCapability {
  const capability = conditionCapabilityByType.get(type);
  if (!capability) {
    throw new Error(`Unknown condition capability: ${type}`);
  }
  return capability;
}

export function getEffectCapability(type: EffectType): EffectCapability {
  const capability = effectCapabilityByType.get(type);
  if (!capability) {
    throw new Error(`Unknown effect capability: ${type}`);
  }
  return capability;
}

export function getNodeCapability(type: EventNodeType): NodeCapability {
  const capability = nodeCapabilityByType.get(type);
  if (!capability) {
    throw new Error(`Unknown node capability: ${type}`);
  }
  return capability;
}

function triggerCapability(config: {
  type: TriggerType;
  label: string;
  description: string;
  requiredContext: string[];
  commonUse: string;
}): TriggerCapability {
  return {
    kind: "trigger",
    type: config.type,
    label: config.label,
    description: config.description,
    fields: triggerFields(config.type),
    requiredFields: ["type"],
    template: {
      type: config.type,
      required_context: config.requiredContext,
      conditions: [],
    },
    commonUse: config.commonUse,
  };
}

function conditionCapability(config: {
  type: ConditionType;
  label: string;
  description: string;
  fields: readonly FormFieldConfig[];
  requiredFields: readonly string[];
  template: Condition;
  commonUse: string;
}): ConditionCapability {
  return {
    kind: "condition",
    type: config.type,
    label: config.label,
    description: config.description,
    fields: [conditionTypeField(config.type), ...config.fields],
    requiredFields: ["type", ...config.requiredFields],
    template: config.template,
    commonUse: config.commonUse,
  };
}

function effectCapability(config: {
  type: EffectType;
  label: string;
  description: string;
  fields?: readonly FormFieldConfig[];
  requiredFields?: readonly string[];
  template?: Effect;
  commonUse: string;
}): EffectCapability {
  return {
    kind: "effect",
    type: config.type,
    label: config.label,
    description: config.description,
    fields: [...effectCommonFields(config.type), ...(config.fields ?? [])],
    requiredFields: ["id", "type", "target", "params", "failure_policy", "record_policy", ...(config.requiredFields ?? [])],
    template: config.template ?? createDefaultEffectTemplate({ type: config.type }),
    commonUse: config.commonUse,
  };
}

function nodeCapability(config: {
  type: EventNodeType;
  label: string;
  description: string;
  fields: readonly FormFieldConfig[];
  requiredFields: readonly string[];
  commonUse: string;
}): NodeCapability {
  return {
    kind: "node",
    type: config.type,
    label: config.label,
    description: config.description,
    fields: [...nodeCommonFields(config.type), ...config.fields],
    requiredFields: ["id", "type", "title", "blocking", ...config.requiredFields],
    template: createDefaultNodeTemplate({ type: config.type }),
    commonUse: config.commonUse,
  };
}

function triggerFields(type: TriggerType): readonly FormFieldConfig[] {
  return [
    selectField("type", "Type", "Trigger type id.", triggerTypeOptions, true, type),
    jsonField("required_context", "Required context", "Trigger context fields the event expects.", false),
    defineField({
      path: "conditions",
      label: "Conditions",
      input: "condition_list",
      description: "Optional conditions checked against the trigger context and game state.",
    }),
    jsonField("probability", "Probability", "Optional probability object with base, modifiers, min, and max.", false),
    defineField({
      path: "dedupe_key_template",
      label: "Dedupe key",
      input: "text",
      description: "Optional dedupe key template for suppressing duplicate trigger candidates.",
    }),
  ];
}

function conditionTypeField(type: ConditionType): FormFieldConfig {
  return selectField("type", "Type", "Condition type id.", conditionTypeOptions, true, type);
}

function effectCommonFields(type: EffectType): readonly FormFieldConfig[] {
  return [
    textField("id", "Effect id", "Unique effect id within this effect group."),
    selectField("type", "Type", "Effect type id.", effectTypeOptions, true, type),
    targetField("Target object affected by this effect."),
    jsonField("params", "Params", "Effect-specific params object.", true),
    selectField("failure_policy", "Failure policy", "How runtime should continue if this effect fails.", effectFailurePolicyOptions, true, "fail_event"),
    jsonField("record_policy", "Record policy", "Event log and world history write policy.", true),
  ];
}

function nodeCommonFields(type: EventNodeType): readonly FormFieldConfig[] {
  return [
    textField("id", "Node id", "Unique node id within this event graph."),
    selectField("type", "Type", "Event node type id.", nodeTypeOptions, true, type),
    textField("title", "Title", "Short node title shown in the graph."),
    jsonField("blocking", "Blocking", "Blocking claims requested while this node is active.", true),
  ];
}

function conditionsField(description: string): FormFieldConfig {
  return defineField({
    path: "conditions",
    label: "Conditions",
    input: "condition_list",
    description,
    required: true,
  });
}

function targetField(description: string, required = true): FormFieldConfig {
  return defineField({
    path: "target",
    label: "Target",
    input: "target_ref",
    description,
    required,
    options: targetTypeOptions,
  });
}

function targetRefField(path: string, label: string, description: string, required = true): FormFieldConfig {
  return defineField({
    path,
    label,
    input: "target_ref",
    description,
    required,
    options: targetTypeOptions,
  });
}

function fieldPathField(description: string, required = true): FormFieldConfig {
  return defineField({
    path: "field",
    label: "Field",
    input: "text",
    description,
    required,
  });
}

function compareField(description = "Comparison operator.", required = true): FormFieldConfig {
  return selectField("op", "Operator", description, compareOperatorOptions, required, "equals");
}

function valueField(description: string): FormFieldConfig {
  return jsonField("value", "Value", description, true);
}

function valueTextField(description: string): FormFieldConfig {
  return defineField({
    path: "value",
    label: "Value",
    input: "text",
    description,
    required: true,
  });
}

function valueSelectField(description: string, options: readonly FormSelectOption[]): FormFieldConfig {
  return selectField("value", "Value", description, options, true);
}

function textField(path: string, label: string, description: string, required = true): FormFieldConfig {
  return defineField({
    path,
    label,
    input: "text",
    description,
    required,
  });
}

function numberField(path: string, label: string, description: string, required = true, defaultValue?: number): FormFieldConfig {
  return defineField({
    path,
    label,
    input: "number",
    description,
    required,
    defaultValue,
  });
}

function booleanField(path: string, label: string, description: string, required = true, defaultValue?: boolean): FormFieldConfig {
  return defineField({
    path,
    label,
    input: "boolean",
    description,
    required,
    defaultValue,
  });
}

function jsonField(path: string, label: string, description: string, required = false): FormFieldConfig {
  return defineField({
    path,
    label,
    input: "json",
    description,
    required,
  });
}

function selectField(
  path: string,
  label: string,
  description: string,
  options: readonly FormSelectOption[],
  required = true,
  defaultValue?: string,
): FormFieldConfig {
  return defineField({
    path,
    label,
    input: "select",
    description,
    required,
    options,
    defaultValue,
  });
}

function placeholderCondition(): Condition {
  return { type: "world_flag_equals", field: "TODO_FLAG", value: true };
}

function option(value: string, label: string, description?: string, meta?: unknown): FormSelectOption {
  return { value, label, description, meta };
}

function nodeLabel(type: EventNodeType): string {
  return labelFromId(type);
}

function labelFromId(id: string): string {
  return id
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
