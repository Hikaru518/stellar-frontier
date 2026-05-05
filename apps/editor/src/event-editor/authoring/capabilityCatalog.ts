import handlerRegistryContent from "../../../../../content/events/handler_registry.json";
import type {
  Condition,
  ConditionType,
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

export type TriggerCapability = CapabilityDefinition<"trigger", TriggerType, TriggerDefinition>;
export type ConditionCapability = CapabilityDefinition<"condition", ConditionType, Condition>;

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

const handlerDefinitions = (handlerRegistryContent.handlers ?? []) as HandlerDefinition[];

export const conditionHandlerOptions = handlerDefinitions
  .filter((handler) => handler.kind === "condition")
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

const conditionCapabilityByType = new Map<ConditionType, ConditionCapability>(
  conditionCapabilities.map((capability) => [capability.type, capability]),
);

export function getConditionCapability(type: ConditionType): ConditionCapability {
  const capability = conditionCapabilityByType.get(type);
  if (!capability) {
    throw new Error(`Unknown condition capability: ${type}`);
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

function labelFromId(id: string): string {
  return id
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
