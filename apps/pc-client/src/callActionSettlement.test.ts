import { describe, expect, it } from "vitest";
import { applyImmediateOrCreateAction, settleAction, type SettlementActiveAction } from "./callActionSettlement";
import type { MapObjectDefinition } from "./content/contentData";
import type { CrewMember, GameMapState, GameState, MapTile, ResourceSummary } from "./data/gameData";

type TileWithContent = MapTile & {
  tags?: string[];
  objects?: MapObjectDefinition[];
};

function createMember(overrides: Partial<CrewMember> = {}): CrewMember {
  return {
    id: "amy",
    name: "Amy",
    role: "Scout",
    currentTile: "test-tile",
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

function createTile(overrides: Partial<TileWithContent> = {}): TileWithContent {
  return {
    id: "test-tile",
    coord: "(0,0)",
    row: 1,
    col: 1,
    terrain: "平原",
    resources: [],
    buildings: [],
    instruments: [],
    crew: ["amy"],
    danger: "未发现即时危险",
    status: "已发现",
    investigated: false,
    tags: ["test_tile"],
    objects: [],
    ...overrides,
  };
}

function createObject(overrides: Partial<MapObjectDefinition> = {}): MapObjectDefinition {
  return {
    id: "test-object",
    kind: "resourceNode",
    name: "测试资源点",
    visibility: "onDiscovered",
    tags: ["test_object"],
    legacyResource: "iron_ore",
    candidateActions: ["gather"],
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

function createMap(tileId = "test-tile"): GameMapState {
  return {
    configId: "test-map",
    configVersion: 1,
    rows: 1,
    cols: 1,
    originTileId: tileId,
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
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  const member = createMember();
  const tile = createTile();

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
      id: "amy-survey-test-tile",
      actionType: "survey",
      status: "inProgress",
      startTime: 10,
      durationSeconds: 120,
      finishTime: 130,
      targetTile: "test-tile",
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
        tile_id: "test-tile",
        action_id: "standby",
      }),
    ]);
  });

  it.each([
    ["survey", undefined, "survey"],
    ["gather:test-object", createObject({ candidateActions: ["gather"] }), "gather"],
    ["build:test-object", createObject({ kind: "structure", candidateActions: ["build"], legacyResource: undefined }), "build"],
    ["extract:test-object", createObject({ kind: "structure", candidateActions: ["extract"], legacyResource: undefined }), "extract"],
    ["scan:test-object", createObject({ kind: "signal", candidateActions: ["scan"], legacyResource: undefined }), "scan"],
  ])("creates an in-progress activeAction for %s", (actionViewId, object, actionType) => {
    const tile = createTile({ objects: object ? [object] : [] });
    const state = createGameState({ tiles: [tile] });

    const result = applyImmediateOrCreateAction({ state, crewId: "amy", actionViewId, occurredAt: 100 });

    expect(result.settled).toBe(false);
    expect(result.state.crew[0].activeAction).toEqual(
      expect.objectContaining({
        actionType,
        status: "inProgress",
        startTime: 100,
        finishTime: expect.any(Number),
        targetTile: "test-tile",
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
  it("reveals investigated objects and emits an action_complete trigger with tile and object tags", () => {
    const hiddenObject = createObject({
      id: "buried-cache",
      name: "埋藏缓存",
      visibility: "onInvestigated",
      tags: ["cache"],
      candidateActions: ["survey"],
    });
    const tile = createTile({ tags: ["ruins"], objects: [hiddenObject] });
    const member = createMember();
    const action: SettlementActiveAction = {
      id: "amy-survey-test-tile",
      actionType: "survey",
      status: "inProgress",
      startTime: 0,
      durationSeconds: 120,
      finishTime: 120,
      targetTile: "test-tile",
      params: { surveyLevel: "standard" },
    };

    const patch = settleAction({
      member,
      action,
      occurredAt: 120,
      resources: createResources(),
      baseInventory: [],
      tiles: [tile],
      map: createMap(),
      logs: [],
    });

    expect(patch.map.tilesById["test-tile"]?.revealedObjectIds).toContain("buried-cache");
    expect(patch.triggerContexts).toEqual([
      expect.objectContaining({
        trigger_type: "action_complete",
        occurred_at: 120,
        source: "crew_action",
        crew_id: "amy",
        tile_id: "test-tile",
        action_id: "amy-survey-test-tile",
        payload: expect.objectContaining({
          tags: expect.arrayContaining(["ruins", "cache"]),
        }),
      }),
    ]);
  });

  it("adds mineral deposit yield from action params instead of a hardcoded amount", () => {
    const mineralDeposit = createObject({
      id: "iron-deposit",
      name: "铁矿床",
      tags: ["mineral_deposit"],
      legacyResource: "iron_ore",
      candidateActions: ["gather"],
    });
    const tile = createTile({ objects: [mineralDeposit] });
    const member = createMember();
    const action: SettlementActiveAction = {
      id: "amy-gather-iron-deposit",
      actionType: "gather",
      status: "inProgress",
      startTime: 0,
      durationSeconds: 180,
      finishTime: 180,
      targetTile: "test-tile",
      objectId: "iron-deposit",
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
      tiles: [tile],
      map: createMap(),
      logs: [],
    });

    expect(patch.member.inventory).toContainEqual({ itemId: "iron_ore", quantity: 7 });
  });
});
