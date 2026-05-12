import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import handlerRegistryContent from "../../../../../content/events/handler_registry.json";
import conditionSchema from "../../../../../content/schemas/events/condition.schema.json";
import effectSchema from "../../../../../content/schemas/events/effect.schema.json";
import type { EffectType } from "../../../../pc-client/src/events/types";
import {
  conditionHandlerOptions,
  effectCapabilities,
  effectHandlerOptions,
  getEffectCapability,
} from "./capabilityCatalog";
import { createDefaultEffectTemplate } from "./templates";

const EXPECTED_EFFECT_TYPES = [
  "add_crew_condition",
  "remove_crew_condition",
  "update_crew_attribute",
  "add_personality_tag",
  "remove_personality_tag",
  "add_expertise_tag",
  "update_crew_location",
  "create_crew_action",
  "cancel_crew_action",
  "update_crew_action",
  "update_tile_field",
  "update_tile_state",
  "add_tile_tag",
  "add_danger_tag",
  "set_discovery_state",
  "set_survey_state",
  "add_event_mark",
  "add_item",
  "remove_item",
  "transfer_item",
  "add_resource",
  "remove_resource",
  "update_tile_resource",
  "create_objective",
  "update_objective",
  "complete_objective",
  "fail_objective",
  "set_world_flag",
  "increment_world_counter",
  "write_world_history",
  "add_event_log",
  "add_diary_entry",
  "spawn_event",
  "unlock_event_definition",
  "handler_effect",
  "set_feature_status",
  "set_feature_revealed",
  "set_object_status",
] as const satisfies readonly EffectType[];

describe("event effect capability registry", () => {
  it("covers every current EffectType value from runtime types", () => {
    expectCoverage(
      "effect capabilities",
      effectCapabilities.map((capability) => capability.type),
      EXPECTED_EFFECT_TYPES,
    );
  });

  it("defines complete effect metadata and insert templates", () => {
    for (const capability of effectCapabilities) {
      expect(capability.kind).toBe("effect");
      expect(capability.label).not.toHaveLength(0);
      expect(capability.description).not.toHaveLength(0);
      expect(capability.commonUse).not.toHaveLength(0);
      expect(capability.fields.length).toBeGreaterThan(0);
      expect(capability.requiredFields).toEqual(
        expect.arrayContaining(["id", "type", "target", "params", "failure_policy", "record_policy"]),
      );
      expect(capability.template).toMatchObject({
        id: expect.any(String),
        type: capability.type,
        target: { type: expect.any(String) },
        params: expect.any(Object),
        failure_policy: expect.any(String),
        record_policy: {
          write_event_log: expect.any(Boolean),
          write_world_history: expect.any(Boolean),
        },
      });
      expect(Array.isArray(capability.template)).toBe(false);
    }
  });

  it("creates reusable default effect templates with common required fields", () => {
    expect(createDefaultEffectTemplate({ type: "set_world_flag", effectId: "mark_flag" })).toEqual({
      id: "mark_flag",
      type: "set_world_flag",
      target: { type: "world_flags" },
      params: {},
      failure_policy: "fail_event",
      record_policy: {
        write_event_log: false,
        write_world_history: false,
      },
    });
    expect(createDefaultEffectTemplate({ type: "add_item" })).toMatchObject({
      id: "add_item",
      type: "add_item",
      target: { type: "crew_inventory" },
      params: expect.any(Object),
    });
  });

  it("looks up effect capabilities by type", () => {
    expect(getEffectCapability("set_world_flag").template.type).toBe("set_world_flag");
    expect(getEffectCapability("set_feature_status").template).toMatchObject({
      type: "set_feature_status",
      target: { type: "event_tile" },
      params: { feature_id: "TODO_FEATURE", status: "TODO_STATUS" },
    });
    expect(getEffectCapability("set_feature_revealed").template).toMatchObject({
      type: "set_feature_revealed",
      target: { type: "event_tile" },
      params: { feature_id: "TODO_FEATURE", revealed: true },
    });
    expect(getEffectCapability("set_object_status").template.type).toBe("set_object_status");
  });

  it("accepts feature condition and effect contracts in event schemas", () => {
    const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
    ajv.addSchema(conditionSchema);
    ajv.addSchema(effectSchema);
    const validateCondition = ajv.getSchema(conditionSchema.$id);
    const validateEffect = ajv.getSchema(effectSchema.$id);

    expect(validateCondition).toBeDefined();
    expect(validateEffect).toBeDefined();
    expectValid(
      "feature_status_equals condition",
      validateCondition?.({
        type: "handler_condition",
        handler_type: "feature_status_equals",
        params: { feature_id: "iafs_generator", status: "damaged" },
      }),
      validateCondition?.errors,
    );
    expectInvalid(
      "feature_status_equals condition without status",
      validateCondition?.({
        type: "handler_condition",
        handler_type: "feature_status_equals",
        params: { feature_id: "iafs_generator" },
      }),
    );
    expectValid(
      "set_feature_status effect",
      validateEffect?.(
        createFeatureEffect("set_feature_status", {
          feature_id: "iafs_generator",
          status: "repaired",
        }),
      ),
      validateEffect?.errors,
    );
    expectValid(
      "set_feature_revealed effect",
      validateEffect?.(
        createFeatureEffect("set_feature_revealed", {
          feature_id: "iafs_generator",
          revealed: true,
        }),
      ),
      validateEffect?.errors,
    );
    expectInvalid(
      "set_feature_revealed effect without boolean revealed",
      validateEffect?.(
        createFeatureEffect("set_feature_revealed", {
          feature_id: "iafs_generator",
          revealed: "yes",
        }),
      ),
    );
  });

  it("exposes the feature condition handler with a resolvable params schema ref", () => {
    const featureConditionHandler = handlerRegistryContent.handlers.find(
      (handler) => handler.handler_type === "feature_status_equals",
    );
    const handlerOption = conditionHandlerOptions.find((option) => option.value === "feature_status_equals");

    expect(featureConditionHandler).toMatchObject({
      handler_type: "feature_status_equals",
      kind: "condition",
      params_schema_ref: "#/$defs/feature_status_equals_params",
    });
    expect(handlerOption?.meta).toMatchObject({
      paramsSchemaRef: "#/$defs/feature_status_equals_params",
    });
    expect(resolveJsonPointer(conditionSchema, featureConditionHandler?.params_schema_ref ?? "")).toMatchObject({
      required: ["feature_id", "status"],
    });
  });

  it("exposes only effect handler entries to handler_effect", () => {
    const expectedEffectHandlers = handlerRegistryContent.handlers
      .filter((handler) => handler.kind === "effect")
      .map((handler) => handler.handler_type);
    const expectedConditionHandlers = handlerRegistryContent.handlers
      .filter((handler) => handler.kind === "condition")
      .map((handler) => handler.handler_type);
    const handlerEffect = getEffectCapability("handler_effect");
    const handlerTypeField = handlerEffect.fields.find((field) => field.path === "handler_type");

    expectCoverage(
      "effect handler options",
      effectHandlerOptions.map((option) => option.value),
      expectedEffectHandlers,
    );
    expect(handlerTypeField?.input).toBe("select");
    expect(handlerTypeField?.options?.map((option) => option.value)).toEqual(effectHandlerOptions.map((option) => option.value));
    expect(intersection(effectHandlerOptions.map((option) => option.value), expectedConditionHandlers)).toEqual([]);
  });
});

function createFeatureEffect(type: EffectType, params: Record<string, unknown>) {
  return {
    id: type,
    type,
    target: { type: "event_tile" },
    params,
    failure_policy: "fail_event",
    record_policy: {
      write_event_log: false,
      write_world_history: false,
    },
  };
}

function expectValid(label: string, valid: unknown, errors: unknown): void {
  if (valid !== true) {
    throw new Error(`${label} should be valid. Errors: ${JSON.stringify(errors)}`);
  }
}

function expectInvalid(label: string, valid: unknown): void {
  if (valid !== false) {
    throw new Error(`${label} should be invalid.`);
  }
}

function resolveJsonPointer(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith("#/")) {
    throw new Error(`Expected local JSON pointer, got ${pointer}`);
  }

  return pointer
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((value, segment) => {
      if (!isRecord(value) || !(segment in value)) {
        throw new Error(`Unresolved JSON pointer ${pointer}`);
      }
      return value[segment];
    }, root);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

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
