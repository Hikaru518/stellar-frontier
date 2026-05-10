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
import type { Condition, CrewActionState, Effect } from "./events/types";

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
    crew: [],
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

function createCrashSiteTile(): MapTile {
  const configTile = defaultMapConfig.tiles.find((tile) => tile.id === "4-4")!;
  return {
    id: "4-4",
    coord: "(0,0)",
    row: configTile.row,
    col: configTile.col,
    terrain: configTile.terrain,
    crew: [],
    status: "已发现",
    investigated: true,
  };
}

function createCrashSiteMember(overrides: Partial<CrewMember> = {}): CrewMember {
  return createMember({
    id: "mike",
    name: "Mike",
    role: "神秘幸存者",
    currentTile: "4-4",
    ...overrides,
  });
}

function createRepairCrewAction(overrides: Partial<CrewActionState> = {}): CrewActionState {
  return {
    id: "repair:amy:iafs_generator:0",
    crew_id: "amy",
    type: "repair",
    status: "active",
    source: "player_command",
    parent_event_id: null,
    objective_id: null,
    action_request_id: null,
    from_tile_id: "4-4",
    to_tile_id: null,
    target_tile_id: "4-4",
    path_tile_ids: [],
    started_at: 0,
    ends_at: 180,
    progress_seconds: 0,
    duration_seconds: 180,
    action_params: {
      object_id: "iafs_generator",
    },
    can_interrupt: true,
    interrupt_duration_seconds: 10,
    ...overrides,
  };
}

function createCrashSiteState(overrides: Partial<GameState> = {}): GameState {
  const mike = createCrashSiteMember();
  return createGameState({
    crew: [mike],
    map: {
      configId: defaultMapConfig.id,
      configVersion: defaultMapConfig.version,
      rows: defaultMapConfig.size.rows,
      cols: defaultMapConfig.size.cols,
      originTileId: defaultMapConfig.originTileId,
      discoveredTileIds: ["4-4"],
      investigationReportsById: {},
      tilesById: {
        "4-4": {
          discovered: true,
          investigated: true,
          revealedObjectIds: ["iafs_generator", "iafs_life_support", "iafs_shuttle_core"],
        },
      },
      mapObjects: {
        iafs_generator: { id: "iafs_generator", status_enum: "damaged" },
        iafs_life_support: { id: "iafs_life_support", status_enum: "damaged" },
        iafs_shuttle_core: { id: "iafs_shuttle_core", status_enum: "damaged" },
      },
    },
    tiles: [createCrashSiteTile()],
    ...overrides,
  });
}

describe("map-object-action pipeline integration", () => {
  it("shows the three crash-site repair actions on a normal call at 4-4", () => {
    const member = createCrashSiteMember();
    const view = buildCallView({ member, tile: createCrashSiteTile(), gameState: createCrashSiteState() });

    const generatorAction = findGroup(view, "发电机")?.actions.find((action) => action.id === "iafs_generator:repair");
    const lifeSupportAction = findGroup(view, "维生装置")?.actions.find((action) => action.id === "iafs_life_support:repair");
    const shuttleCoreAction = findGroup(view, "穿梭机核心")?.actions.find((action) => action.id === "iafs_shuttle_core:repair");

    expect(generatorAction).toMatchObject({ id: "iafs_generator:repair", label: "维修" });
    expect(generatorAction?.disabled).toBeUndefined();
    expect(lifeSupportAction).toMatchObject({ id: "iafs_life_support:repair", label: "维修" });
    expect(lifeSupportAction?.disabled).toBeUndefined();
    expect(shuttleCoreAction).toMatchObject({ id: "iafs_shuttle_core:repair", label: "维修" });
    expect(shuttleCoreAction?.disabled).toBeUndefined();
  });

  it("shows inspect actions for crash-site objects regardless of repair status", () => {
    const member = createCrashSiteMember();
    const damagedView = buildCallView({ member, tile: createCrashSiteTile(), gameState: createCrashSiteState() });

    expect(findGroup(damagedView, "发电机")?.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "iafs_generator:inspect", label: "调查" })]),
    );

    const repairedView = buildCallView({
      member,
      tile: createCrashSiteTile(),
      gameState: createCrashSiteState({
        map: {
          ...createCrashSiteState().map,
          mapObjects: {
            iafs_generator: { id: "iafs_generator", status_enum: "repaired" },
            iafs_life_support: { id: "iafs_life_support", status_enum: "damaged" },
            iafs_shuttle_core: { id: "iafs_shuttle_core", status_enum: "damaged" },
          },
        },
      }),
    });

    expect(findGroup(repairedView, "发电机")?.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "iafs_generator:inspect", label: "调查" })]),
    );
  });

  it("hides crash-site object groups before a survey event reveals them", () => {
    const member = createCrashSiteMember();
    const hiddenView = buildCallView({
      member,
      tile: createCrashSiteTile(),
      gameState: createCrashSiteState({
        map: {
          ...createCrashSiteState().map,
          tilesById: {
            "4-4": {
              discovered: true,
              investigated: true,
              revealedObjectIds: [],
            },
          },
        },
      }),
    });

    expect(hiddenView.groups.map((group) => group.title)).toEqual(["基础行动"]);
  });

  it("keeps repair visible but disables it when another crew member is already repairing the object", () => {
    const member = createCrashSiteMember();
    const state = createCrashSiteState({
      crew: [member, createCrashSiteMember({ id: "amy", name: "Amy" })],
      crew_actions: {
        "repair:amy:iafs_generator:0": createRepairCrewAction(),
      },
    });

    const action = buildCallView({ member, tile: createCrashSiteTile(), gameState: state }).groups
      .flatMap((group) => group.actions)
      .find((entry) => entry.id === "iafs_generator:repair");

    expect(action).toBeDefined();
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toContain("其他队员");

    const unlockedRepairTargets = buildCallView({ member, tile: createCrashSiteTile(), gameState: state }).groups
      .flatMap((group) => group.actions)
      .filter((entry) => entry.id === "iafs_life_support:repair" || entry.id === "iafs_shuttle_core:repair");
    expect(unlockedRepairTargets).toHaveLength(2);
    expect(unlockedRepairTargets[0]).toMatchObject({ id: "iafs_life_support:repair" });
    expect(unlockedRepairTargets[0]?.disabled).toBeUndefined();
    expect(unlockedRepairTargets[1]).toMatchObject({ id: "iafs_shuttle_core:repair" });
    expect(unlockedRepairTargets[1]?.disabled).toBeUndefined();
  });

  it("keeps repair visible but disables it with a self-repair reason when the same crew is already repairing it", () => {
    const member = createCrashSiteMember();
    const state = createCrashSiteState({
      crew_actions: {
        "repair:mike:iafs_generator:0": createRepairCrewAction({
          id: "repair:mike:iafs_generator:0",
          crew_id: "mike",
        }),
      },
    });

    const action = buildCallView({ member, tile: createCrashSiteTile(), gameState: state }).groups
      .flatMap((group) => group.actions)
      .find((entry) => entry.id === "iafs_generator:repair");

    expect(action).toBeDefined();
    expect(action?.disabled).toBe(true);
    expect(action?.disabledReason).toContain("已在维修");
  });

  it("hides the repair action after the object has been repaired", () => {
    const member = createCrashSiteMember();
    const state = createCrashSiteState({
      map: {
        ...createCrashSiteState().map,
        mapObjects: {
          iafs_generator: { id: "iafs_generator", status_enum: "repaired" },
          iafs_life_support: { id: "iafs_life_support", status_enum: "damaged" },
          iafs_shuttle_core: { id: "iafs_shuttle_core", status_enum: "damaged" },
        },
      },
    });

    const action = buildCallView({ member, tile: createCrashSiteTile(), gameState: state }).groups
      .flatMap((group) => group.actions)
      .find((entry) => entry.id === "iafs_generator:repair");

    expect(action).toBeUndefined();
  });

  it("keeps repair available for retry after a failed attempt leaves the object damaged", () => {
    const member = createCrashSiteMember({ status: "维修失败，待命中。", statusTone: "muted" });
    const action = buildCallView({ member, tile: createCrashSiteTile(), gameState: createCrashSiteState({ crew: [member] }) }).groups
      .flatMap((group) => group.actions)
      .find((entry) => entry.id === "iafs_generator:repair");

    expect(action).toMatchObject({ id: "iafs_generator:repair", label: "维修" });
    expect(action?.disabled).toBeUndefined();
  });

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
    const unlockedGroup = findGroup(unlockedView, "实验舱门");
    expect(unlockedGroup).toBeDefined();
    const enterAction = unlockedGroup!.actions.find((action) => action.id === `${STUB_OBJECT_ID}:enter`);
    expect(enterAction).toBeDefined();
    expect(enterAction!.disabled).toBeFalsy();
  });
});

function findGroup(view: ReturnType<typeof buildCallView>, objectName: string) {
  return view.groups.find((group) => group.title === objectName || group.title.startsWith(`${objectName}（`));
}
