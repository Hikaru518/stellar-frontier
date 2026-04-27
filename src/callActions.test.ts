import { describe, expect, it } from "vitest";
import { defaultMapConfig, type MapObjectDefinition } from "./content/contentData";
import { buildCallView, loadCallActions } from "./callActions";
import type { CrewMember, GameState, MapTile, ResourceSummary } from "./data/gameData";
import type { RuntimeCall } from "./events/types";

function createMember(overrides: Partial<CrewMember> = {}): CrewMember {
  return {
    id: "amy",
    name: "Amy",
    role: "Scout",
    currentTile: "2-3",
    location: "黑松林缘",
    coord: "(-1,2)",
    status: "待命中。",
    statusTone: "neutral",
    summary: "Test member",
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

function createTile(tileId: string, overrides: Partial<MapTile> = {}): MapTile {
  const configTile = defaultMapConfig.tiles.find((tile) => tile.id === tileId);

  return {
    id: tileId,
    coord: "(0,0)",
    row: configTile?.row ?? 1,
    col: configTile?.col ?? 1,
    terrain: configTile?.terrain ?? "平原",
    resources: [],
    buildings: [],
    instruments: [],
    crew: [],
    danger: "未发现即时危险",
    status: "已发现",
    investigated: Boolean(overrides.investigated),
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

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    schema_version: "test",
    created_at_real_time: "2026-04-28T00:00:00.000Z",
    updated_at_real_time: "2026-04-28T00:00:00.000Z",
    elapsedGameSeconds: 0,
    crew: [],
    baseInventory: [],
    map: {
      configId: defaultMapConfig.id,
      configVersion: defaultMapConfig.version,
      rows: defaultMapConfig.size.rows,
      cols: defaultMapConfig.size.cols,
      originTileId: defaultMapConfig.originTileId,
      discoveredTileIds: [],
      investigationReportsById: {},
      tilesById: {},
    },
    tiles: [],
    logs: [],
    resources: createResources(),
    eventHistory: {},
    crew_actions: {},
    inventories: {},
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

function createRuntimeCall(overrides: Partial<RuntimeCall> = {}): RuntimeCall {
  return {
    id: "call-1",
    event_id: "event-1",
    event_node_id: "node-1",
    call_template_id: "template-1",
    crew_id: "amy",
    status: "awaiting_choice",
    created_at: 0,
    render_context_snapshot: {},
    rendered_lines: [],
    available_options: [
      {
        option_id: "runtime-option",
        template_variant_id: "variant-1",
        text: "Runtime option",
        is_default: false,
      },
    ],
    ...overrides,
  };
}

describe("buildCallView", () => {
  it("groups universal actions with one revealed object's candidate actions for idle crew", () => {
    const tile = createTile("2-3");
    const object = defaultMapConfig.tiles.find((item) => item.id === "2-3")?.objects.find((item) => item.id === "black-pine-stand");
    const gameState = createGameState({
      map: {
        ...createGameState().map,
        discoveredTileIds: ["2-3"],
        tilesById: {
          "2-3": {
            discovered: true,
            investigated: false,
            revealedObjectIds: ["black-pine-stand"],
          },
        },
      },
    });

    const view = buildCallView({ member: createMember(), tile, gameState });

    expect(view.groups).toHaveLength(2);
    expect(view.groups[0].title).toBe("基础行动");
    expect(view.groups[1]).toMatchObject({ title: "黑松木材带" });
    expect(view.groups[1].actions).toHaveLength(object?.candidateActions?.length ?? 0);
    expect(view.groups[1].actions.map((action) => action.id)).toEqual(["survey:black-pine-stand", "gather:black-pine-stand"]);
  });

  it("only shows universal actions available while busy for crew with an active action", () => {
    const gameState = createGameState();

    const view = buildCallView({
      member: createMember({
        activeAction: {
          id: "amy-gather-2-3",
          actionType: "gather",
          status: "inProgress",
          startTime: 0,
          durationSeconds: 120,
          finishTime: 120,
          targetTile: "2-3",
        },
      }),
      tile: createTile("2-3"),
      gameState,
    });

    const expectedBusyIds = loadCallActions()
      .filter((action) => action.category === "universal" && action.availableWhenBusy)
      .map((action) => action.id);

    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].actions.map((action) => action.defId)).toEqual(expectedBusyIds);
    expect(view.groups[0].actions).toEqual(
      expect.arrayContaining(expectedBusyIds.map((id) => expect.objectContaining({ id, defId: id }))),
    );
  });

  it("does not show onInvestigated object actions before the tile is investigated", () => {
    const gameState = createGameState({
      map: {
        ...createGameState().map,
        discoveredTileIds: ["5-3"],
        tilesById: {
          "5-3": {
            discovered: true,
            investigated: false,
            revealedObjectIds: [],
          },
        },
      },
    });

    const view = buildCallView({ member: createMember({ currentTile: "5-3" }), tile: createTile("5-3", { investigated: false }), gameState });

    expect(view.groups.map((group) => group.title)).not.toContain("潮湿木材");
  });

  it("returns the member's active runtime call without adding runtime options to action groups", () => {
    const runtimeCall = createRuntimeCall();
    const gameState = createGameState({
      active_calls: {
        [runtimeCall.id]: runtimeCall,
      },
    });

    const view = buildCallView({ member: createMember(), tile: createTile("2-3"), gameState });

    expect(view.runtimeCall).toBe(runtimeCall);
    expect(view.groups.flatMap((group) => group.actions).map((action) => action.id)).not.toContain("runtime-option");
  });

  it("skips missing candidate action ids without throwing", () => {
    const missingCandidateObject: MapObjectDefinition = {
      id: "unknown-node",
      kind: "resourceNode",
      name: "未知资源点",
      visibility: "onDiscovered",
      candidateActions: ["gather", "scan"],
    };
    const tile = {
      ...createTile("test-tile"),
      discovered: true,
      objects: [missingCandidateObject],
    } as MapTile & { discovered: boolean; objects: MapObjectDefinition[] };
    const gameState = createGameState({
      map: {
        ...createGameState().map,
        discoveredTileIds: ["test-tile"],
        tilesById: {
          "test-tile": {
            discovered: true,
            investigated: false,
            revealedObjectIds: ["unknown-node"],
          },
        },
      },
    });

    expect(() => buildCallView({ member: createMember({ currentTile: "test-tile" }), tile, gameState })).not.toThrow();

    const view = buildCallView({ member: createMember({ currentTile: "test-tile" }), tile, gameState });

    expect(view.groups.find((group) => group.title === "未知资源点")?.actions.map((action) => action.defId)).toEqual(["gather"]);
  });
});
