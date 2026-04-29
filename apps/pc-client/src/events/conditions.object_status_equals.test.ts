import { describe, expect, it } from "vitest";
import { evaluateCondition, type ConditionEvaluationContext, type ConditionGameState } from "./conditions";
import type { Condition } from "./types";

describe("object_status_equals handler condition", () => {
  it("passes when the runtime entry's status_enum matches", () => {
    const context = createContext({
      "locked-door": { id: "locked-door", status_enum: "unlocked" },
    });
    const result = evaluateCondition(buildCondition("locked-door", "unlocked"), context);
    expect(result).toEqual({ passed: true, errors: [] });
  });

  it("fails when the runtime entry has a different status_enum", () => {
    const context = createContext({
      "locked-door": { id: "locked-door", status_enum: "locked" },
    });
    const result = evaluateCondition(buildCondition("locked-door", "unlocked"), context);
    expect(result).toEqual({ passed: false, errors: [] });
  });

  it("fails when the runtime entry is missing entirely", () => {
    const context = createContext({});
    const result = evaluateCondition(buildCondition("locked-door", "unlocked"), context);
    expect(result).toEqual({ passed: false, errors: [] });
  });

  it("fails when map.mapObjects is undefined", () => {
    const context: ConditionEvaluationContext = { state: {} as ConditionGameState };
    const result = evaluateCondition(buildCondition("locked-door", "unlocked"), context);
    expect(result).toEqual({ passed: false, errors: [] });
  });

  it("returns an invalid_handler_params error when object_id is missing", () => {
    const context = createContext({});
    const result = evaluateCondition(
      {
        type: "handler_condition",
        handler_type: "object_status_equals",
        params: { status: "unlocked" },
      },
      context,
    );
    expect(result.passed).toBe(false);
    expect(result.errors[0]?.code).toBe("invalid_handler_params");
  });
});

function buildCondition(objectId: string, status: string): Condition {
  return {
    type: "handler_condition",
    handler_type: "object_status_equals",
    params: { object_id: objectId, status },
  };
}

function createContext(
  mapObjects: Record<string, { id: string; status_enum: string }>,
): ConditionEvaluationContext {
  return {
    state: {
      map: { mapObjects },
    } as ConditionGameState,
  };
}
