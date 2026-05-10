import { describe, expect, it } from "vitest";

import { buildCallView } from "./callActions";
import { defaultMapConfig, questDefinitions } from "./content/contentData";
import { universalActions } from "./content/mapObjects";
import type { CrewMember, GameState, MapTile, ResourceSummary } from "./data/gameData";
import type { RuntimeCall } from "./events/types";
import { createInitialQuestState } from "./questSystem";

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

function createTile(tileId: string): MapTile {
  const configTile = defaultMapConfig.tiles.find((tile) => tile.id === tileId)!;
  return {
    id: tileId,
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
    created_at_real_time: "2026-05-08T00:00:00.000Z",
    updated_at_real_time: "2026-05-08T00:00:00.000Z",
    elapsedGameSeconds: 0,
    crew: [createMember()],
    baseInventory: [],
    map: {
      configId: defaultMapConfig.id,
      configVersion: defaultMapConfig.version,
      rows: defaultMapConfig.size.rows,
      cols: defaultMapConfig.size.cols,
      originTileId: defaultMapConfig.originTileId,
      discoveredTileIds: ["1-1"],
      investigationReportsById: {},
      tilesById: { "1-1": { discovered: true, investigated: false, revealedObjectIds: [] } },
      mapObjects: {},
    },
    tiles: [createTile("1-1")],
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
    quest_state: createInitialQuestState(questDefinitions, 0),
    ...overrides,
  };
}

function createRuntimeCall(overrides: Partial<RuntimeCall> = {}): RuntimeCall {
  return {
    id: "call-1",
    event_id: "event-1",
    event_node_id: "node-1",
    call_template_id: "template-1",
    crew_id: "mike",
    status: "awaiting_choice",
    created_at: 0,
    render_context_snapshot: {},
    rendered_lines: [],
    available_options: [],
    ...overrides,
  };
}

describe("buildCallView", () => {
  it("shows only the four universal actions on the blank map", () => {
    const view = buildCallView({ member: createMember(), tile: createTile("1-1"), gameState: createGameState() });

    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]).toMatchObject({ title: "基础行动" });
    expect(view.groups[0].actions.map((action) => action.id)).toEqual(
      universalActions.filter((action) => action.id !== "universal:stop").map((action) => action.id),
    );
  });

  it("returns an active runtime call without mixing its options into action groups", () => {
    const runtimeCall = createRuntimeCall();
    const view = buildCallView({
      member: createMember(),
      tile: createTile("1-1"),
      gameState: createGameState({ active_calls: { [runtimeCall.id]: runtimeCall } }),
    });

    expect(view.runtimeCall).toBe(runtimeCall);
    expect(view.groups.flatMap((group) => group.actions).map((action) => action.id)).not.toContain("runtime-option");
  });
});
