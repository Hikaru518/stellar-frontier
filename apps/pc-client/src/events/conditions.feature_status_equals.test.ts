import { describe, expect, it } from "vitest";
import { evaluateCondition, type ConditionEvaluationContext, type ConditionGameState } from "./conditions";
import type { Condition } from "./types";

describe("feature_status_equals handler condition", () => {
  it("passes when the runtime feature status matches", () => {
    const context = createContext({
      iafs_generator: { id: "iafs_generator", status: "repaired" },
    });
    const result = evaluateCondition(buildCondition("iafs_generator", "repaired"), context);

    expect(result).toEqual({ passed: true, errors: [] });
  });

  it("falls back to the authored initial_status when runtime state is missing", () => {
    const context = createContext({});
    const result = evaluateCondition(buildCondition("iafs_generator", "damaged"), context);

    expect(result).toEqual({ passed: true, errors: [] });
  });

  it("fails when the runtime feature status differs", () => {
    const context = createContext({
      iafs_generator: { id: "iafs_generator", status: "damaged" },
    });
    const result = evaluateCondition(buildCondition("iafs_generator", "repaired"), context);

    expect(result).toEqual({ passed: false, errors: [] });
  });

  it("fails without throwing when the feature id is unknown", () => {
    const context = createContext({});
    const result = evaluateCondition(buildCondition("unknown-feature", "damaged"), context);

    expect(result).toEqual({ passed: false, errors: [] });
  });

  it("returns an invalid_handler_params error when feature_id is missing", () => {
    const context = createContext({});
    const result = evaluateCondition(
      {
        type: "handler_condition",
        handler_type: "feature_status_equals",
        params: { status: "damaged" },
      },
      context,
    );

    expect(result.passed).toBe(false);
    expect(result.errors[0]?.code).toBe("invalid_handler_params");
  });
});

function buildCondition(featureId: string, status: string): Condition {
  return {
    type: "handler_condition",
    handler_type: "feature_status_equals",
    params: { feature_id: featureId, status },
  };
}

function createContext(
  featuresById: Record<string, { id: string; status?: string; revealed?: boolean; investigated?: boolean } | undefined>,
): ConditionEvaluationContext {
  return {
    state: {
      map: { featuresById },
    } as ConditionGameState,
  };
}
