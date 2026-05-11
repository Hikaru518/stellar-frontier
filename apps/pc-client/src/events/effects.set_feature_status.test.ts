import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeEffects, type EffectExecutionContext, type EffectGameState } from "./effects";
import type { Effect } from "./types";

describe("set_feature_status and set_feature_revealed effects", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("updates only the target feature status and preserves runtime fields", () => {
    const state: EffectGameState = {
      ...createEmptyState(),
      map: {
        featuresById: {
          iafs_generator: {
            id: "iafs_generator",
            status: "damaged",
            revealed: true,
            investigated: true,
            historyKeys: ["iafs_generator:inspected"],
          },
          iafs_med_bay: { id: "iafs_med_bay", status: "damaged", revealed: false },
        },
      },
    };
    const result = executeEffects([buildStatusEffect("iafs_generator", "repaired")], createContext(state));

    expect(result.status).toBe("success");
    expect(result.errors).toEqual([]);
    expect(result.state.map?.featuresById?.iafs_generator).toEqual({
      id: "iafs_generator",
      status: "repaired",
      revealed: true,
      investigated: true,
      historyKeys: ["iafs_generator:inspected"],
    });
    expect(result.state.map?.featuresById?.iafs_med_bay).toEqual({
      id: "iafs_med_bay",
      status: "damaged",
      revealed: false,
    });
  });

  it("marks a hidden feature as revealed without changing status", () => {
    const state: EffectGameState = {
      ...createEmptyState(),
      map: {
        featuresById: {
          iafs_generator: { id: "iafs_generator", status: "damaged", revealed: false, investigated: false },
        },
      },
    };
    const result = executeEffects([buildRevealedEffect("iafs_generator", true)], createContext(state));

    expect(result.status).toBe("success");
    expect(result.errors).toEqual([]);
    expect(result.state.map?.featuresById?.iafs_generator).toEqual({
      id: "iafs_generator",
      status: "damaged",
      revealed: true,
      investigated: false,
    });
  });

  it("warns and writes minimal feature state when the feature id is unknown", () => {
    const state = createEmptyState();
    const result = executeEffects([buildStatusEffect("unknown-feature", "active")], createContext(state));

    expect(result.status).toBe("success");
    expect(result.errors).toEqual([]);
    expect(result.state.map?.featuresById?.["unknown-feature"]).toEqual({
      id: "unknown-feature",
      status: "active",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Feature definition for unknown-feature not found"),
    );
  });

  it("preserves existing map fields when revealing a feature", () => {
    const state: EffectGameState = {
      ...createEmptyState(),
      map: {
        tilesById: { "129-129": { revealedObjectIds: ["legacy-object"] } },
        featuresById: {
          iafs_generator: { id: "iafs_generator", revealed: false },
        },
      },
    };
    const result = executeEffects([buildRevealedEffect("iafs_generator", true)], createContext(state));

    expect(result.state.map?.tilesById).toEqual({ "129-129": { revealedObjectIds: ["legacy-object"] } });
    expect(result.state.map?.featuresById?.iafs_generator).toEqual({
      id: "iafs_generator",
      revealed: true,
    });
  });

  it("returns missing_value errors when required params are missing", () => {
    const state = createEmptyState();
    const result = executeEffects(
      [
        {
          ...buildStatusEffect("iafs_generator", "repaired"),
          params: { feature_id: "iafs_generator" },
        },
      ],
      createContext(state),
    );

    expect(result.status).toBe("failed");
    expect(result.errors[0]).toEqual(
      expect.objectContaining({ code: "missing_value", path: expect.stringContaining("status") }),
    );
  });
});

function buildStatusEffect(featureId: string, status: string): Effect {
  return {
    id: `fx_status_${featureId}`,
    type: "set_feature_status",
    target: { type: "world_flags" },
    params: { feature_id: featureId, status },
    failure_policy: "fail_event",
    record_policy: { write_event_log: false, write_world_history: false },
  };
}

function buildRevealedEffect(featureId: string, revealed: boolean): Effect {
  return {
    id: `fx_revealed_${featureId}`,
    type: "set_feature_revealed",
    target: { type: "world_flags" },
    params: { feature_id: featureId, revealed },
    failure_policy: "fail_event",
    record_policy: { write_event_log: false, write_world_history: false },
  };
}

function createContext(state: EffectGameState): EffectExecutionContext {
  return {
    state,
    trigger_context: {
      trigger_type: "call_choice",
      occurred_at: 0,
      source: "call",
    },
  };
}

function createEmptyState(): EffectGameState {
  return {
    elapsed_game_seconds: 0,
    crew: {},
    tiles: {},
    inventories: {},
    crew_actions: {},
    active_events: {},
    active_calls: {},
    objectives: {},
    event_logs: [],
    world_history: {},
    world_flags: {},
    rng_state: null,
  };
}
