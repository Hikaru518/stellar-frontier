import { describe, expect, it } from "vitest";
import handlerRegistryContent from "../../../../../content/events/handler_registry.json";
import {
  conditionCapabilities,
  conditionHandlerOptions,
  effectHandlerOptions,
  getConditionCapability,
  getNodeCapability,
  nodeCapabilities,
  triggerCapabilities,
} from "./capabilityCatalog";

const EXPECTED_TRIGGER_TYPES = [
  "arrival",
  "proximity",
  "action_complete",
  "idle_time",
  "call_choice",
  "event_node_finished",
  "objective_created",
  "objective_completed",
  "world_flag_changed",
  "time_wakeup",
] as const;

const EXPECTED_CONDITION_TYPES = [
  "all_of",
  "any_of",
  "not",
  "compare_field",
  "has_tag",
  "lacks_tag",
  "has_condition",
  "attribute_check",
  "inventory_has_item",
  "resource_amount",
  "tile_discovery_state",
  "tile_survey_state",
  "world_flag_equals",
  "world_history_exists",
  "world_history_count",
  "objective_status",
  "event_status",
  "event_current_node",
  "crew_action_status",
  "time_compare",
  "handler_condition",
] as const;

const EXPECTED_NODE_TYPES = [
  "call",
  "wait",
  "check",
  "skill_check",
  "random",
  "action_request",
  "objective",
  "spawn_event",
  "log_only",
  "end",
] as const;

describe("event capability catalog", () => {
  it("covers every current trigger type id", () => {
    expectCoverage(
      "trigger capabilities",
      triggerCapabilities.map((capability) => capability.type),
      EXPECTED_TRIGGER_TYPES,
    );
  });

  it("covers every current condition type id", () => {
    expectCoverage(
      "condition capabilities",
      conditionCapabilities.map((capability) => capability.type),
      EXPECTED_CONDITION_TYPES,
    );
  });

  it("covers every current node type id", () => {
    expectCoverage(
      "node capabilities",
      nodeCapabilities.map((capability) => capability.type),
      EXPECTED_NODE_TYPES,
    );
  });

  it("defines complete trigger metadata and insert templates", () => {
    for (const capability of triggerCapabilities) {
      expect(capability.kind).toBe("trigger");
      expect(capability.label).not.toHaveLength(0);
      expect(capability.description).not.toHaveLength(0);
      expect(capability.commonUse).not.toHaveLength(0);
      expect(capability.fields.length).toBeGreaterThan(0);
      expect(capability.requiredFields).toContain("type");
      expect(capability.template).toMatchObject({ type: capability.type });
      expect(typeof capability.template).toBe("object");
      expect(Array.isArray(capability.template)).toBe(false);
    }
  });

  it("defines complete condition metadata and insert templates", () => {
    for (const capability of conditionCapabilities) {
      expect(capability.kind).toBe("condition");
      expect(capability.label).not.toHaveLength(0);
      expect(capability.description).not.toHaveLength(0);
      expect(capability.commonUse).not.toHaveLength(0);
      expect(capability.fields.length).toBeGreaterThan(0);
      expect(capability.requiredFields).toContain("type");
      expect(capability.template).toMatchObject({ type: capability.type });
      expect(typeof capability.template).toBe("object");
      expect(Array.isArray(capability.template)).toBe(false);
    }
  });

  it("defines complete node metadata and insert templates", () => {
    for (const capability of nodeCapabilities) {
      expect(capability.kind).toBe("node");
      expect(capability.label).not.toHaveLength(0);
      expect(capability.description).not.toHaveLength(0);
      expect(capability.commonUse).not.toHaveLength(0);
      expect(capability.fields.length).toBeGreaterThan(0);
      expect(capability.requiredFields).toEqual(expect.arrayContaining(["id", "type", "title", "blocking"]));
      expect(capability.template).toMatchObject({
        id: expect.any(String),
        type: capability.type,
        title: expect.any(String),
        blocking: {
          occupies_crew_action: expect.any(Boolean),
          occupies_communication: expect.any(Boolean),
        },
      });
    }
  });

  it("looks up node capabilities by type", () => {
    expect(getNodeCapability("call").template.type).toBe("call");
    expect(getNodeCapability("end").template.type).toBe("end");
  });

  it("exposes only condition handler entries to handler_condition", () => {
    const expectedConditionHandlers = handlerRegistryContent.handlers
      .filter((handler) => handler.kind === "condition")
      .map((handler) => handler.handler_type);
    const expectedEffectHandlers = handlerRegistryContent.handlers
      .filter((handler) => handler.kind === "effect")
      .map((handler) => handler.handler_type);
    const handlerCondition = getConditionCapability("handler_condition");
    const handlerTypeField = handlerCondition.fields.find((field) => field.path === "handler_type");

    expectCoverage(
      "condition handler options",
      conditionHandlerOptions.map((option) => option.value),
      expectedConditionHandlers,
    );
    expect(handlerTypeField?.input).toBe("select");
    expect(handlerTypeField?.options?.map((option) => option.value)).toEqual(conditionHandlerOptions.map((option) => option.value));
    expect(intersection(conditionHandlerOptions.map((option) => option.value), expectedEffectHandlers)).toEqual([]);
    expect(effectHandlerOptions.map((option) => option.value)).toEqual(expectedEffectHandlers);
  });
});

function expectCoverage(label: string, actual: readonly string[], expected: readonly string[]): void {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((typeId) => !actualSet.has(typeId));
  const extra = actual.filter((typeId) => !expectedSet.has(typeId));

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`${label} coverage mismatch. Missing: ${formatIds(missing)}. Extra: ${formatIds(extra)}.`);
  }
}

function formatIds(typeIds: readonly string[]): string {
  return typeIds.length > 0 ? typeIds.join(", ") : "(none)";
}

function intersection(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}
