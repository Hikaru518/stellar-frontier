import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeEffects, type EffectExecutionContext, type EffectGameState } from "./effects";
import type { Effect } from "./types";
import type { MapObjectDefinition } from "../content/mapObjects";

declare global {
  // eslint-disable-next-line no-var
  var __mapObjectDefinitionById: Map<string, MapObjectDefinition> | undefined;
}

describe("set_object_status effect", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.__mapObjectDefinitionById = new Map<string, MapObjectDefinition>([
      [
        "locked-door",
        {
          id: "locked-door",
          kind: "structure",
          name: "锁闭舱门",
          status_options: ["locked", "unlocked"],
          initial_status: "locked",
          actions: [],
          visibility: "onDiscovered",
        },
      ],
    ]);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    globalThis.__mapObjectDefinitionById = undefined;
  });

  it("writes a new entry into map.mapObjects when none exists", () => {
    const state = createEmptyState();
    const result = executeEffects([buildEffect("locked-door", "unlocked")], createContext(state));

    expect(result.status).toBe("success");
    expect(result.errors).toEqual([]);
    expect(result.state.map?.mapObjects).toEqual({
      "locked-door": { id: "locked-door", status_enum: "unlocked" },
    });
  });

  it("updates status_enum on an existing entry without dropping tags", () => {
    const state: EffectGameState = {
      ...createEmptyState(),
      map: {
        mapObjects: {
          "locked-door": { id: "locked-door", status_enum: "locked", tags: ["scanned"] },
        },
      },
    };
    const result = executeEffects([buildEffect("locked-door", "unlocked")], createContext(state));

    expect(result.status).toBe("success");
    expect(result.state.map?.mapObjects?.["locked-door"]).toEqual({
      id: "locked-door",
      status_enum: "unlocked",
      tags: ["scanned"],
    });
  });

  it("warns and still writes when status is not in def.status_options", () => {
    const state = createEmptyState();
    const result = executeEffects(
      [buildEffect("locked-door", "exploded")],
      createContext(state),
    );

    expect(result.status).toBe("success");
    expect(result.state.map?.mapObjects?.["locked-door"]).toEqual({
      id: "locked-door",
      status_enum: "exploded",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("status exploded not in options"),
    );
  });

  it("warns and writes when no definition is registered (Task 1 placeholder)", () => {
    globalThis.__mapObjectDefinitionById = new Map();
    const state = createEmptyState();
    const result = executeEffects(
      [buildEffect("ghost-object", "active")],
      createContext(state),
    );

    expect(result.status).toBe("success");
    expect(result.state.map?.mapObjects?.["ghost-object"]).toEqual({
      id: "ghost-object",
      status_enum: "active",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Object definition for ghost-object not found"),
    );
  });

  it("preserves an existing tilesById field on map", () => {
    const state: EffectGameState = {
      ...createEmptyState(),
      map: {
        tilesById: { "2-3": { revealedObjectIds: ["locked-door"] } },
      },
    };
    const result = executeEffects([buildEffect("locked-door", "unlocked")], createContext(state));

    expect(result.state.map?.tilesById).toEqual({ "2-3": { revealedObjectIds: ["locked-door"] } });
    expect(result.state.map?.mapObjects?.["locked-door"]?.status_enum).toBe("unlocked");
  });

  it("returns missing_value errors when params are missing", () => {
    const state = createEmptyState();
    const result = executeEffects(
      [
        {
          ...buildEffect("locked-door", "unlocked"),
          params: { object_id: "locked-door" },
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

function buildEffect(objectId: string, status: string): Effect {
  return {
    id: `fx_${objectId}`,
    type: "set_object_status",
    target: { type: "tile_id", id: "2-3" },
    params: { object_id: objectId, status },
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
    tiles: {
      "2-3": {
        id: "2-3",
        coordinates: { x: 2, y: 3 },
        terrain_type: "forest",
        tags: [],
        danger_tags: [],
        discovery_state: "known",
        survey_state: "unsurveyed",
        visibility: "visible",
        current_crew_ids: [],
        resource_nodes: [],
        site_objects: [],
        buildings: [],
        event_marks: [],
        history_keys: [],
      },
    },
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
