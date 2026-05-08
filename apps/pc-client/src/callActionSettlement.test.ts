import { afterEach, describe, expect, it, vi } from "vitest";

import { settleAction } from "./callActionSettlement";
import { defaultMapConfig } from "./content/contentData";
import type { CrewMember, GameMapState, GameState, MapTile, ResourceSummary } from "./data/gameData";
import type { CrewActionState } from "./events/types";

type TileWithContent = MapTile & { tags?: string[] };

function createMember(overrides: Partial<CrewMember> = {}): CrewMember {
  return {
    id: "mike",
    name: "Mike",
    role: "神秘幸存者",
    currentTile: "1-1",
    location: "起点",
    coord: "(0,0)",
    status: "待命中。",
    statusTone: "neutral",
    attributes: { physical: 3, agility: 3, intellect: 3, perception: 3, luck: 3 },
    skills: [],
    inventory: [],
    profile: { originWorld: "未知", originProfession: "未知", experience: "未知", selfIntro: "未知" },
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

function createTile(tileId: string, overrides: Partial<TileWithContent> = {}): TileWithContent {
  const configTile = defaultMapConfig.tiles.find((tile) => tile.id === tileId)!;
  return {
    id: tileId,
    coord: "(0,0)",
    row: configTile.row,
    col: configTile.col,
    terrain: configTile.terrain,
    crew: ["mike"],
    status: "已发现",
    investigated: false,
    tags: ["blank_tile"],
    ...overrides,
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

function createMap(tileId = "1-1"): GameMapState {
  return {
    configId: defaultMapConfig.id,
    configVersion: defaultMapConfig.version,
    rows: defaultMapConfig.size.rows,
    cols: defaultMapConfig.size.cols,
    originTileId: defaultMapConfig.originTileId,
    discoveredTileIds: [tileId],
    investigationReportsById: {},
    tilesById: {
      [tileId]: { discovered: true, investigated: false, revealedObjectIds: [], revealedSpecialStateIds: [] },
    },
    mapObjects: {},
  };
}

function createRepairMap(tileId = "4-4", objectId = "iafs_generator", status = "damaged"): GameMapState {
  return {
    ...createMap(tileId),
    mapObjects: {
      [objectId]: {
        id: objectId,
        status_enum: status,
      },
    },
  };
}

function createCrewAction(overrides: Partial<CrewActionState> = {}): CrewActionState {
  return {
    id: "mike-survey-1-1",
    crew_id: "mike",
    type: "survey",
    status: "active",
    source: "player_command",
    parent_event_id: null,
    objective_id: null,
    action_request_id: null,
    from_tile_id: "1-1",
    to_tile_id: null,
    target_tile_id: "1-1",
    path_tile_ids: [],
    started_at: 0,
    ends_at: 120,
    progress_seconds: 0,
    duration_seconds: 120,
    action_params: {},
    can_interrupt: true,
    interrupt_duration_seconds: 10,
    ...overrides,
  };
}

describe("settleAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks a surveyed blank tile as investigated and emits tile tags only", () => {
    const patch = settleAction({
      member: createMember(),
      action: createCrewAction(),
      occurredAt: 120,
      resources: createResources(),
      baseInventory: [],
      tiles: [createTile("1-1")],
      map: createMap("1-1"),
      logs: [],
    });

    expect(patch.map.tilesById["1-1"]?.investigated).toBe(true);
    expect(patch.map.tilesById["1-1"]?.revealedObjectIds).toEqual([]);
    expect(patch.triggerContexts).toEqual([
      expect.objectContaining({
        trigger_type: "action_complete",
        crew_id: "mike",
        tile_id: "1-1",
        payload: expect.objectContaining({ object_id: null, tags: ["blank_tile"] }),
      }),
    ]);
  });

  it("adds gather yield from action params into inventory", () => {
    const patch = settleAction({
      member: createMember(),
      action: createCrewAction({
        id: "mike-gather-scrap",
        type: "gather",
        duration_seconds: 180,
        action_params: { perRoundYieldByResource: { scrap: 7 } },
      }),
      occurredAt: 180,
      resources: createResources(),
      baseInventory: [],
      tiles: [createTile("1-1")],
      map: createMap("1-1"),
      logs: [],
    });

    expect(patch.member.inventory).toContainEqual({ itemId: "scrap", quantity: 7 });
  });

  it("settles a repair success, writes repaired status, and emits repair context", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const patch = settleAction({
      member: createMember({ currentTile: "4-4", attributes: { physical: 3, agility: 5, intellect: 3, perception: 3, luck: 3 } }),
      action: createCrewAction({
        id: "mike-repair-generator",
        type: "repair",
        target_tile_id: "4-4",
        duration_seconds: 180,
        action_params: {
          object_id: "iafs_generator",
          success_check: {
            attribute: "agility",
            base: 0,
            ratio: 0.2,
            bias: 0,
            difficulty: 0,
            min: 0,
            max: 1,
          },
          success_effects: [{ type: "set_object_status", object_id: "iafs_generator", status: "repaired" }],
          failure_effects: [],
        },
      }),
      occurredAt: 180,
      resources: createResources(),
      baseInventory: [],
      tiles: [createTile("4-4", { tags: ["crash_site"] })],
      map: createRepairMap(),
      logs: [],
    });

    expect(patch.map.mapObjects?.["iafs_generator"]?.status_enum).toBe("repaired");
    expect(patch.triggerContexts).toEqual([
      expect.objectContaining({
        trigger_type: "action_complete",
        crew_id: "mike",
        tile_id: "4-4",
        payload: expect.objectContaining({
          action_type: "repair",
          object_id: "iafs_generator",
          repair_result: "success",
        }),
      }),
    ]);
  });

  it("settles a repair failure without changing object status or adding penalties", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    const resources = createResources();

    const patch = settleAction({
      member: createMember({ currentTile: "4-4", attributes: { physical: 3, agility: 1, intellect: 3, perception: 3, luck: 3 } }),
      action: createCrewAction({
        id: "mike-repair-generator-fail",
        type: "repair",
        target_tile_id: "4-4",
        duration_seconds: 180,
        action_params: {
          object_id: "iafs_generator",
          success_check: {
            attribute: "agility",
            base: 0,
            ratio: 0.2,
            bias: 0,
            difficulty: 1,
            min: 0,
            max: 1,
          },
          success_effects: [{ type: "set_object_status", object_id: "iafs_generator", status: "repaired" }],
          failure_effects: [],
        },
      }),
      occurredAt: 180,
      resources,
      baseInventory: [],
      tiles: [createTile("4-4", { tags: ["crash_site"] })],
      map: createRepairMap(),
      logs: [],
    });

    expect(patch.map.mapObjects?.["iafs_generator"]?.status_enum).toBe("damaged");
    expect(patch.resources).toEqual(resources);
    expect(patch.baseInventory).toEqual([]);
    expect(patch.triggerContexts).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          object_id: "iafs_generator",
          repair_result: "failure",
        }),
      }),
    ]);
  });

  it("clamps repair success chance to the configured maximum before rolling", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const patch = settleAction({
      member: createMember({ currentTile: "4-4", attributes: { physical: 3, agility: 5, intellect: 3, perception: 3, luck: 3 } }),
      action: createCrewAction({
        id: "mike-repair-generator-clamp",
        type: "repair",
        target_tile_id: "4-4",
        duration_seconds: 180,
        action_params: {
          object_id: "iafs_generator",
          success_check: {
            attribute: "agility",
            base: 0,
            ratio: 0.5,
            bias: 0,
            difficulty: 0,
            min: 0,
            max: 0.4,
          },
          success_effects: [{ type: "set_object_status", object_id: "iafs_generator", status: "repaired" }],
          failure_effects: [],
        },
      }),
      occurredAt: 180,
      resources: createResources(),
      baseInventory: [],
      tiles: [createTile("4-4", { tags: ["crash_site"] })],
      map: createRepairMap(),
      logs: [],
    });

    expect(patch.map.mapObjects?.["iafs_generator"]?.status_enum).toBe("damaged");
    expect(patch.triggerContexts[0]?.payload).toEqual(
      expect.objectContaining({ object_id: "iafs_generator", repair_result: "failure" }),
    );
  });
});
