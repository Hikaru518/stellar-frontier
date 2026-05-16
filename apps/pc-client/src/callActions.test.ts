import { afterEach, describe, expect, it } from "vitest";

import { buildCallView } from "./callActions";
import { defaultMapConfig, questDefinitions, type MapFeatureDefinition } from "./content/contentData";
import { universalActions } from "./content/mapObjects";
import type { CrewMember, GameState, MapTile, ResourceSummary } from "./data/gameData";
import type { RuntimeCall } from "./events/types";
import { createInitialQuestState } from "./questSystem";

const originalMapFeatures = [...defaultMapConfig.features];

afterEach(() => {
  defaultMapConfig.features = originalMapFeatures;
});

function createMember(overrides: Partial<CrewMember> = {}): CrewMember {
  return {
    id: "mike",
    name: "麦克",
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
    idleChatter: [],
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
    debugSettings: overrides.debugSettings ?? { crewMoveSpeedMultiplier: 1 },
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
  it("hides standby and stop from the blank-map universal actions", () => {
    const view = buildCallView({ member: createMember(), tile: createTile("1-1"), gameState: createGameState() });

    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]).toMatchObject({ title: "基础行动" });
    expect(view.groups[0].actions.map((action) => action.id)).toEqual(
      universalActions.filter((action) => action.id !== "universal:standby" && action.id !== "universal:stop").map((action) => action.id),
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

  it("uses feature runtime status when evaluating feature inline action visibility", () => {
    const member = createMember({ currentTile: "129-129" });
    const tile = createTile("129-129");

    const damagedView = buildCallView({
      member,
      tile,
      gameState: createFeatureState("damaged", { member }),
    });
    expect(findGroup(damagedView, "发电机")?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "iafs_generator:repair",
          label: "维修",
          featureId: "iafs_generator",
        }),
      ]),
    );

    const repairedView = buildCallView({
      member,
      tile,
      gameState: createFeatureState("repaired", { member }),
    });
    const repairedFeatureActions = findGroup(repairedView, "发电机")?.actions ?? [];
    expect(repairedFeatureActions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "iafs_generator:inspect", featureId: "iafs_generator" })]),
    );
    expect(repairedFeatureActions.find((action) => action.id === "iafs_generator:repair")).toBeUndefined();
  });

  it("keeps a failed feature inline action visible with a disabled reason when requested", () => {
    const feature = defaultMapConfig.features.find((entry) => entry.id === "iafs_generator");
    if (feature?.investigatable !== true) {
      throw new Error("Expected iafs_generator to be an investigatable feature.");
    }
    const repairAction = feature.actions.find((action) => action.id === "iafs_generator:repair");
    if (!repairAction) {
      throw new Error("Expected iafs_generator:repair feature action to exist.");
    }
    const originalDisplay = repairAction.display_when_unavailable;
    const originalHint = repairAction.unavailable_hint;

    try {
      repairAction.display_when_unavailable = "disabled";
      repairAction.unavailable_hint = "发电机已经修复。";

      const member = createMember({ currentTile: "129-129" });
      const view = buildCallView({
        member,
        tile: createTile("129-129"),
        gameState: createFeatureState("repaired", { member }),
      });
      const action = findGroup(view, "发电机")?.actions.find((entry) => entry.id === "iafs_generator:repair");

      expect(action).toMatchObject({
        id: "iafs_generator:repair",
        disabled: true,
        disabledReason: "发电机已经修复。",
        featureId: "iafs_generator",
      });
    } finally {
      if (originalDisplay === undefined) {
        delete repairAction.display_when_unavailable;
      } else {
        repairAction.display_when_unavailable = originalDisplay;
      }
      if (originalHint === undefined) {
        delete repairAction.unavailable_hint;
      } else {
        repairAction.unavailable_hint = originalHint;
      }
    }
  });

  it("generates only one feature investigation action for the single top-priority candidate", () => {
    setFeatureFixtures([
      createInvestigatableFeature({ id: "test_top_feature", name: "高优先级目标", priority: 20 }),
      createInvestigatableFeature({ id: "test_low_feature", name: "低优先级目标", priority: 10 }),
    ]);

    const view = buildCallView({ member: createMember(), tile: createTile("1-1"), gameState: createGameState() });
    const featureActions = featureActionViews(view);

    expect(featureActions).toEqual([
      expect.objectContaining({
        id: "test_top_feature:investigate",
        label: "调查高优先级目标",
        featureId: "test_top_feature",
      }),
    ]);
  });

  it("generates distinguishable feature investigation actions for tied top-priority candidates", () => {
    setFeatureFixtures([
      createInvestigatableFeature({ id: "test_alpha_feature", name: "Alpha 目标", priority: 20 }),
      createInvestigatableFeature({ id: "test_zeta_feature", name: "Zeta 目标", priority: 20 }),
      createInvestigatableFeature({ id: "test_low_feature", name: "低优先级目标", priority: 10 }),
    ]);

    const view = buildCallView({ member: createMember(), tile: createTile("1-1"), gameState: createGameState() });

    expect(featureActionViews(view)).toEqual([
      expect.objectContaining({ id: "test_alpha_feature:investigate", featureId: "test_alpha_feature" }),
      expect.objectContaining({ id: "test_zeta_feature:investigate", featureId: "test_zeta_feature" }),
    ]);
  });

  it("does not generate feature investigation actions when every feature at the tile is hidden", () => {
    setFeatureFixtures([
      createInvestigatableFeature({
        id: "test_hidden_high_feature",
        name: "隐藏高优先级目标",
        priority: 30,
        visibility: "hidden",
      }),
      createInvestigatableFeature({
        id: "test_hidden_low_feature",
        name: "隐藏低优先级目标",
        priority: 10,
        visibility: "hidden",
      }),
    ]);

    const view = buildCallView({ member: createMember(), tile: createTile("1-1"), gameState: createGameState() });

    expect(featureActionViews(view)).toEqual([]);
    expect(view.groups.map((group) => group.title)).toEqual(["基础行动"]);
  });
});

function setFeatureFixtures(features: MapFeatureDefinition[]): void {
  defaultMapConfig.features = [...originalMapFeatures, ...features];
}

function createInvestigatableFeature({
  id,
  name,
  priority,
  visibility = "always",
}: {
  id: string;
  name: string;
  priority: number;
  visibility?: MapFeatureDefinition["visibility"];
}): MapFeatureDefinition {
  return {
    id,
    name,
    kind: "test:feature",
    priority,
    visibility,
    footprint: { type: "row_spans", spans: [{ row: 1, colStart: 1, colEnd: 1 }] },
    investigatable: true,
    status_options: ["available"],
    initial_status: "available",
    actions: [
      {
        id: `${id}:investigate`,
        category: "feature",
        label: "调查{featureName}",
        tone: "neutral",
        conditions: [],
        event_id: `${id}:event`,
      },
    ],
  };
}

function featureActionViews(view: ReturnType<typeof buildCallView>) {
  return view.groups.flatMap((group) => group.actions).filter((action) => action.featureId);
}

function createFeatureState(status: "damaged" | "repaired", { member }: { member: CrewMember }): GameState {
  const tile = createTile("129-129");
  return createGameState({
    crew: [member],
    map: {
      configId: defaultMapConfig.id,
      configVersion: defaultMapConfig.version,
      rows: defaultMapConfig.size.rows,
      cols: defaultMapConfig.size.cols,
      originTileId: defaultMapConfig.originTileId,
      discoveredTileIds: [tile.id],
      investigationReportsById: {},
      tilesById: {
        [tile.id]: {
          discovered: true,
          investigated: true,
          revealedObjectIds: [],
        },
      },
      featuresById: {
        iafs_generator: {
          id: "iafs_generator",
          status,
          revealed: true,
        },
      },
      mapObjects: {},
    },
    tiles: [tile],
  });
}

function findGroup(view: ReturnType<typeof buildCallView>, name: string) {
  return view.groups.find((group) => group.title === name || group.title.startsWith(`${name}（`));
}
