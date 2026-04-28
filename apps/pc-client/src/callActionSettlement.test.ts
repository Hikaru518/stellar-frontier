import { describe, expect, it } from "vitest";
import { applyImmediateOrCreateAction, settleAction, type SettlementActiveAction } from "./callActionSettlement";
import { defaultMapConfig } from "./content/contentData";
import { mapObjectDefinitionById } from "./content/mapObjects";
import type { CrewMember, GameMapState, GameState, MapTile, ResourceSummary } from "./data/gameData";

type TileWithContent = MapTile & {
  tags?: string[];
};

function createMember(overrides: Partial<CrewMember> = {}): CrewMember {
  return {
    id: "amy",
    name: "Amy",
    role: "Scout",
    currentTile: "3-3",
    location: "Test Tile",
    coord: "(0,0)",
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

function createTile(tileId: string, overrides: Partial<TileWithContent> = {}): TileWithContent {
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
    crew: ["amy"],
    danger: "未发现即时危险",
    status: "已发现",
    investigated: false,
    tags: ["test_tile"],
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

function createMap(tileId = "3-3"): GameMapState {
  return {
    configId: defaultMapConfig.id,
    configVersion: defaultMapConfig.version,
    rows: defaultMapConfig.size.rows,
    cols: defaultMapConfig.size.cols,
    originTileId: defaultMapConfig.originTileId,
    discoveredTileIds: [tileId],
    investigationReportsById: {},
    tilesById: {
      [tileId]: {
        discovered: true,
        investigated: false,
        revealedObjectIds: [],
        revealedSpecialStateIds: [],
      },
    },
    mapObjects: {},
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  const member = createMember();
  const tile = createTile("3-3");

  return {
    schema_version: "test",
    created_at_real_time: "2026-04-28T00:00:00.000Z",
    updated_at_real_time: "2026-04-28T00:00:00.000Z",
    elapsedGameSeconds: 0,
    crew: [member],
    baseInventory: [],
    map: createMap(),
    tiles: [tile],
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

describe("applyImmediateOrCreateAction", () => {
  it("settles standby immediately and emits an idle_time trigger", () => {
    const activeAction: SettlementActiveAction = {
      id: "amy-survey-3-3",
      actionType: "survey",
      status: "inProgress",
      startTime: 10,
      durationSeconds: 120,
      finishTime: 130,
      targetTile: "3-3",
      params: {},
    };
    const state = createGameState({
      crew: [createMember({ activeAction: activeAction as unknown as CrewMember["activeAction"], status: "调查中。", statusTone: "accent" })],
    });

    const result = applyImmediateOrCreateAction({ state, crewId: "amy", actionViewId: "standby", occurredAt: 42 });

    const member = result.state.crew[0];
    expect(result.settled).toBe(true);
    expect(member.activeAction).toBeUndefined();
    expect(member.status).toContain("待命");
    expect(member.statusTone).toBe("muted");
    expect(result.patch.triggerContexts).toEqual([
      expect.objectContaining({
        trigger_type: "idle_time",
        occurred_at: 42,
        source: "crew_action",
        crew_id: "amy",
        tile_id: "3-3",
        action_id: "standby",
      }),
    ]);
  });

  it.each([
    ["survey", "survey"],
    ["gather:iron-ridge-deposit", "gather"],
    ["build:mainline-damaged-warp-pod", "build"],
    ["extract:mainline-damaged-warp-pod", "extract"],
  ])("creates an in-progress activeAction for %s", (actionViewId, actionType) => {
    const state = createGameState();

    const result = applyImmediateOrCreateAction({ state, crewId: "amy", actionViewId, occurredAt: 100 });

    expect(result.settled).toBe(false);
    expect(result.state.crew[0].activeAction).toEqual(
      expect.objectContaining({
        actionType,
        status: "inProgress",
        startTime: 100,
        finishTime: expect.any(Number),
        params: expect.any(Object),
      }),
    );
  });

  it("returns a danger log instead of throwing when the action handler is not registered", () => {
    const state = createGameState();

    expect(() => applyImmediateOrCreateAction({ state, crewId: "amy", actionViewId: "move", occurredAt: 5 })).not.toThrow();

    const result = applyImmediateOrCreateAction({ state, crewId: "amy", actionViewId: "move", occurredAt: 5 });
    expect(result.settled).toBe(false);
    expect(result.patch.logs).toEqual([expect.objectContaining({ tone: "danger" })]);
    expect(result.state.logs).toEqual([expect.objectContaining({ tone: "danger" })]);
  });
});

describe("settleAction", () => {
  it("reveals onInvestigated objects and emits an action_complete trigger with tile and object tags", () => {
    // tile `5-3` carries `southwest-timber` (visibility: onInvestigated) per the
    // migrated default-map.json — surveying it should flip that object into
    // revealedObjectIds.
    const tileId = "5-3";
    const investigatedObject = mapObjectDefinitionById.get("southwest-timber");
    expect(investigatedObject).toBeDefined();

    const tile = createTile(tileId, { tags: ["forest_marsh"] });
    const member = createMember({ currentTile: tileId });
    const action: SettlementActiveAction = {
      id: "amy-survey-5-3",
      actionType: "survey",
      status: "inProgress",
      startTime: 0,
      durationSeconds: 120,
      finishTime: 120,
      targetTile: tileId,
      params: { surveyLevel: "standard" },
    };

    const patch = settleAction({
      member,
      action,
      occurredAt: 120,
      resources: createResources(),
      baseInventory: [],
      tiles: [tile],
      map: createMap(tileId),
      logs: [],
    });

    expect(patch.map.tilesById[tileId]?.revealedObjectIds).toContain("southwest-timber");
    expect(patch.triggerContexts).toEqual([
      expect.objectContaining({
        trigger_type: "action_complete",
        occurred_at: 120,
        source: "crew_action",
        crew_id: "amy",
        tile_id: tileId,
        action_id: "amy-survey-5-3",
        payload: expect.objectContaining({
          tags: expect.arrayContaining(["forest_marsh"]),
        }),
      }),
    ]);
  });

  it("adds mineral deposit yield from action params instead of a hardcoded amount", () => {
    const member = createMember();
    const action: SettlementActiveAction = {
      id: "amy-gather-iron-ridge-deposit",
      actionType: "gather",
      status: "inProgress",
      startTime: 0,
      durationSeconds: 180,
      finishTime: 180,
      targetTile: "3-3",
      objectId: "iron-ridge-deposit",
      params: {
        perRoundYieldByResource: {
          iron_ore: 7,
        },
      },
    };

    const patch = settleAction({
      member,
      action,
      occurredAt: 180,
      resources: createResources(),
      baseInventory: [],
      tiles: [createTile("3-3")],
      map: createMap("3-3"),
      logs: [],
    });

    expect(patch.member.inventory).toContainEqual({ itemId: "iron_ore", quantity: 7 });
  });
});
