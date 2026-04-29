/**
 * Integration coverage for the new map-object-action pipeline:
 *
 * - PS-002: a tool-gated action (`inventory_has_item`) is hidden / disabled
 *   when the crew member lacks the item, and visible+enabled once the item is
 *   added to the crew inventory.
 * - PS-003: an action whose visibility depends on an object's `status_enum`
 *   updates after `set_object_status` writes a new status into
 *   `gameState.map.mapObjects` — i.e. the runtime state-change loop is closed.
 *
 * The tests use synthetic injected `MapObjectDefinition` entries so they stay
 * decoupled from real content drift.
 */
import { afterEach, describe, expect, it } from "vitest";
import { buildCallView } from "./callActions";
import { defaultMapConfig } from "./content/contentData";
import { mapObjectDefinitionById } from "./content/mapObjects";
import { executeEffects, type EffectExecutionContext, type EffectGameState } from "./events/effects";
import type { CrewMember, GameState, MapTile, ResourceSummary } from "./data/gameData";
import type { Condition, Effect } from "./events/types";

const STUB_TILE_ID = "2-3";
const STUB_OBJECT_ID = "__integration_locked_door__";

afterEach(() => {
  mapObjectDefinitionById.delete(STUB_OBJECT_ID);
});

function createMember(overrides: Partial<CrewMember> = {}): CrewMember {
  return {
    id: "amy",
    name: "Amy",
    role: "Scout",
    currentTile: STUB_TILE_ID,
    location: "Test",
    coord: "(0,0)",
    status: "待命中。",
    statusTone: "neutral",
    attributes: {
      physical: 3,
      agility: 3,
      intellect: 3,
      perception: 3,
      luck: 3,
    },
    skills: [],
    inventory: [],
    profile: {
      originWorld: "Test",
      originProfession: "Test",
      experience: "Test",
      selfIntro: "Test",
    },
    voiceTone: "calm",
    personalityTags: [],
    expertise: [],
    diaryEntries: [],
    conditions: [],
    hasIncoming: false,
    canCommunicate: true,
    lastContactTime: 0,
    ...overrides,
  };
}

function createTile(): MapTile {
  const configTile = defaultMapConfig.tiles.find((tile) => tile.id === STUB_TILE_ID)!;
  return {
    id: STUB_TILE_ID,
    coord: "(0,0)",
    row: configTile.row,
    col: configTile.col,
    terrain: configTile.terrain,
    resources: [],
    buildings: [],
    instruments: [],
    crew: [],
    danger: "未发现即时危险",
    status: "已发现",
    investigated: false,
  };
}

function createResources(): ResourceSummary {
  return {
    energy: 0,
    iron: 0,
    wood: 0,
    food: 0,
    water: 0,
    baseIntegrity: 100,
    sol: 1,
    power: 0,
    commWindow: "稳定",
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    schema_version: "test",
    created_at_real_time: "2026-04-28T00:00:00.000Z",
    updated_at_real_time: "2026-04-28T00:00:00.000Z",
    elapsedGameSeconds: 0,
    crew: [createMember()],
    baseInventory: [],
    map: {
      configId: defaultMapConfig.id,
      configVersion: defaultMapConfig.version,
      rows: defaultMapConfig.size.rows,
      cols: defaultMapConfig.size.cols,
      originTileId: defaultMapConfig.originTileId,
      discoveredTileIds: [STUB_TILE_ID],
      investigationReportsById: {},
      tilesById: {
        [STUB_TILE_ID]: {
          discovered: true,
          investigated: false,
          revealedObjectIds: [STUB_OBJECT_ID],
        },
      },
      mapObjects: { [STUB_OBJECT_ID]: { id: STUB_OBJECT_ID, status_enum: "locked" } },
    },
    tiles: [createTile()],
    logs: [],
    resources: createResources(),
    eventHistory: {},
    crew_actions: {},
    inventories: {
      "crew:amy": {
        id: "crew:amy",
        owner_type: "crew",
        owner_id: "amy",
        items: [],
        resources: {},
      },
    },
    active_events: {},
    active_calls: {},
    objectives: {},
    event_logs: [],
    world_history: {},
    world_flags: {},
    rng_state: null,
    ...overrides,
  };
}

describe("map-object-action pipeline integration", () => {
  it("PS-002: tool-gated action greys out without the item and enables once delivered", () => {
    const inventoryCondition: Condition = {
      type: "inventory_has_item",
      target: { type: "crew_inventory" },
      value: "welder",
    } as Condition;

    mapObjectDefinitionById.set(STUB_OBJECT_ID, {
      id: STUB_OBJECT_ID,
      kind: "structure",
      name: "锁住的舱门",
      visibility: "onDiscovered",
      status_options: ["locked", "unlocked"],
      initial_status: "locked",
      actions: [
        {
          id: `${STUB_OBJECT_ID}:cut_door`,
          category: "object",
          label: "切割舱门",
          tone: "danger",
          conditions: [inventoryCondition],
          event_id: "test.cut_door",
          display_when_unavailable: "disabled",
        },
      ],
    });

    const member = createMember({ inventory: [] });
    const tile = createTile();
    const stateNoTool = createGameState({
      crew: [member],
      inventories: {
        "crew:amy": {
          id: "crew:amy",
          owner_type: "crew",
          owner_id: "amy",
          items: [],
          resources: {},
        },
      },
    });

    const greyView = buildCallView({ member, tile, gameState: stateNoTool });
    const greyAction = greyView.groups
      .flatMap((group) => group.actions)
      .find((action) => action.id === `${STUB_OBJECT_ID}:cut_door`);
    expect(greyAction).toBeDefined();
    expect(greyAction!.disabled).toBe(true);
    expect(greyAction!.disabledReason).toContain("welder");

    const stateWithTool = createGameState({
      crew: [{ ...member, inventory: [{ itemId: "welder", quantity: 1 }] }],
      inventories: {
        "crew:amy": {
          id: "crew:amy",
          owner_type: "crew",
          owner_id: "amy",
          items: [{ item_id: "welder", quantity: 1 }],
          resources: {},
        },
      },
    });

    const enabledView = buildCallView({ member: { ...member, inventory: [{ itemId: "welder", quantity: 1 }] }, tile, gameState: stateWithTool });
    const enabledAction = enabledView.groups
      .flatMap((group) => group.actions)
      .find((action) => action.id === `${STUB_OBJECT_ID}:cut_door`);
    expect(enabledAction).toBeDefined();
    expect(enabledAction!.disabled).toBeFalsy();
  });

  it("PS-003: set_object_status writes a new status that flips action visibility on the next view build", () => {
    mapObjectDefinitionById.set(STUB_OBJECT_ID, {
      id: STUB_OBJECT_ID,
      kind: "structure",
      name: "实验舱门",
      visibility: "onDiscovered",
      status_options: ["locked", "unlocked"],
      initial_status: "locked",
      actions: [
        {
          id: `${STUB_OBJECT_ID}:enter`,
          category: "object",
          label: "穿过舱门",
          tone: "accent",
          conditions: [
            {
              type: "handler_condition",
              handler_type: "object_status_equals",
              params: { object_id: STUB_OBJECT_ID, status: "unlocked" },
            } as Condition,
          ],
          event_id: "test.enter_door",
        },
      ],
    });

    const member = createMember();
    const tile = createTile();
    const initial = createGameState({ crew: [member] });

    const lockedView = buildCallView({ member, tile, gameState: initial });
    expect(lockedView.groups.find((group) => group.title === "实验舱门")).toBeUndefined();

    // Apply a `set_object_status` effect to flip the status to unlocked.
    const effect: Effect = {
      id: "fx-unlock-door",
      type: "set_object_status",
      target: { type: "tile_id", id: STUB_TILE_ID },
      params: { object_id: STUB_OBJECT_ID, status: "unlocked" },
      failure_policy: "skip_effect",
      record_policy: { write_event_log: false, write_world_history: false },
    } as unknown as Effect;
    const effectState: EffectGameState = {
      crew: {},
      tiles: {
        [STUB_TILE_ID]: {
          id: STUB_TILE_ID,
          coordinates: { x: 0, y: 0 },
          terrain_type: "test",
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
      active_events: {},
      active_calls: {},
      objectives: {},
      event_logs: [],
      world_history: {},
      world_flags: {},
      crew_actions: {},
      inventories: {},
      rng_state: null,
      map: { mapObjects: { ...initial.map.mapObjects } },
    } as unknown as EffectGameState;
    const effectContext: EffectExecutionContext = { state: effectState } as EffectExecutionContext;
    const result = executeEffects([effect], effectContext);
    expect(result.errors).toEqual([]);
    expect(result.status).toBe("success");
    const nextMapObjects = (result.state.map?.mapObjects ?? {}) as Record<string, { id: string; status_enum: string }>;
    expect(nextMapObjects[STUB_OBJECT_ID]?.status_enum).toBe("unlocked");

    const updatedState: GameState = {
      ...initial,
      map: {
        ...initial.map,
        mapObjects: nextMapObjects as GameState["map"]["mapObjects"],
      },
    };

    const unlockedView = buildCallView({ member, tile, gameState: updatedState });
    const unlockedGroup = unlockedView.groups.find((group) => group.title === "实验舱门");
    expect(unlockedGroup).toBeDefined();
    const enterAction = unlockedGroup!.actions.find((action) => action.id === `${STUB_OBJECT_ID}:enter`);
    expect(enterAction).toBeDefined();
    expect(enterAction!.disabled).toBeFalsy();
  });
});
