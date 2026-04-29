import { describe, expect, it } from "vitest";
import { defaultMapConfig } from "./content/contentData";
import { mapObjectDefinitionById, universalActions } from "./content/mapObjects";
import { buildCallView } from "./callActions";
import type { CrewMember, GameState, MapTile, ResourceSummary } from "./data/gameData";
import type { ActionDef } from "./content/mapObjects";
import type { Condition, RuntimeCall } from "./events/types";

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
      mapObjects: {},
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
  it("groups universal actions without exposing retired legacy object actions", () => {
    // tile `2-3` exists in default-map.json and lists `black-pine-stand` as one
    // of its objectIds. Its old object actions are intentionally no longer
    // call decisions; current-area survey owns the structured investigation path.
    const tile = createTile("2-3");
    const blackPine = mapObjectDefinitionById.get("black-pine-stand");
    expect(blackPine).toBeDefined();
    const gameState = createGameState({
      crew: [createMember()],
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

    expect(view.groups[0].title).toBe("基础行动");
    expect(view.groups[0].actions.map((action) => action.id)).toEqual(
      universalActions.filter((action) => action.id !== "universal:stop").map((action) => action.id),
    );

    expect(view.groups.find((group) => group.title === blackPine!.name)).toBeUndefined();
  });

  it("does not render retired generic object action buttons", () => {
    const tile = createTile("3-2");
    const gameState = createGameState({
      crew: [createMember({ currentTile: "3-2" })],
      map: {
        ...createGameState().map,
        discoveredTileIds: ["3-2"],
        tilesById: {
          "3-2": {
            discovered: true,
            investigated: true,
            revealedObjectIds: ["mainline-damaged-forge", "mainline-damaged-warp-pod", "iron-ridge-deposit"],
          },
        },
      },
    });

    const view = buildCallView({ member: createMember({ currentTile: "3-2" }), tile, gameState });
    const actionIds = view.groups.flatMap((group) => group.actions.map((action) => action.id));

    expect(actionIds.some((id) => !id.startsWith("universal:") && /:(survey|gather|build|extract|scan)$/.test(id))).toBe(false);
  });

  it("does not render an object's actions before its visibility is satisfied", () => {
    // tile `5-3` carries `southwest-timber` with visibility=onInvestigated; the
    // group should not appear until the tile is investigated.
    const gameState = createGameState({
      crew: [createMember({ currentTile: "5-3" })],
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

    const view = buildCallView({
      member: createMember({ currentTile: "5-3" }),
      tile: createTile("5-3", { investigated: false }),
      gameState,
    });

    expect(view.groups.map((group) => group.title)).not.toContain("潮湿木材");
  });

  it("returns the member's active runtime call without injecting runtime options into action groups", () => {
    const runtimeCall = createRuntimeCall();
    const gameState = createGameState({
      crew: [createMember()],
      active_calls: {
        [runtimeCall.id]: runtimeCall,
      },
    });

    const view = buildCallView({ member: createMember(), tile: createTile("2-3"), gameState });

    expect(view.runtimeCall).toBe(runtimeCall);
    expect(view.groups.flatMap((group) => group.actions).map((action) => action.id)).not.toContain("runtime-option");
  });

  it("ignores object ids that have no definition in the by-id index without throwing", () => {
    const gameState = createGameState({
      crew: [createMember({ currentTile: "2-3" })],
      map: {
        ...createGameState().map,
        discoveredTileIds: ["2-3"],
        tilesById: {
          "2-3": {
            discovered: true,
            investigated: false,
            // include a known good id plus an unknown id (e.g. removed content)
            revealedObjectIds: ["black-pine-stand", "ghost-object"],
          },
        },
      },
    });

    expect(() => buildCallView({ member: createMember({ currentTile: "2-3" }), tile: createTile("2-3"), gameState })).not.toThrow();
    const view = buildCallView({ member: createMember({ currentTile: "2-3" }), tile: createTile("2-3"), gameState });
    expect(view.groups.map((group) => group.title)).not.toContain("黑松木材带");
    expect(view.groups.map((group) => group.title)).not.toContain("ghost-object");
  });

  it("hides actions whose conditions fail unless display_when_unavailable is set to disabled", () => {
    const stubObjectId = "__test_inline_object__";
    const passingAction = createTestAction("passing", []);
    const hiddenAction = createTestAction("hidden", [
      {
        type: "inventory_has_item",
        target: { type: "crew_inventory" },
        value: "welder",
      } as Condition,
    ]);
    const disabledAction = createTestAction(
      "needs-welder",
      [
        {
          type: "inventory_has_item",
          target: { type: "crew_inventory" },
          value: "welder",
        } as Condition,
      ],
      { display_when_unavailable: "disabled" },
    );

    // Inject a synthetic definition into the by-id index for the duration of
    // the test (clean up at the end).
    mapObjectDefinitionById.set(stubObjectId, {
      id: stubObjectId,
      kind: "structure",
      name: "测试舱门",
      visibility: "onDiscovered",
      status_options: ["locked", "unlocked"],
      initial_status: "locked",
      actions: [passingAction, hiddenAction, disabledAction],
    });
    try {
      const tile = createTile("2-3");
      const gameState = createGameState({
        crew: [createMember()],
        map: {
          ...createGameState().map,
          discoveredTileIds: ["2-3"],
          tilesById: {
            "2-3": {
              discovered: true,
              investigated: false,
              revealedObjectIds: [stubObjectId],
            },
          },
        },
      });

      const view = buildCallView({ member: createMember(), tile, gameState });
      const group = view.groups.find((entry) => entry.title === "测试舱门");
      expect(group).toBeDefined();
      const actionIds = group!.actions.map((action) => action.id);
      expect(actionIds).toContain(`${stubObjectId}:passing`);
      expect(actionIds).not.toContain(`${stubObjectId}:hidden`);
      expect(actionIds).toContain(`${stubObjectId}:needs-welder`);
      const disabledView = group!.actions.find((action) => action.id === `${stubObjectId}:needs-welder`);
      expect(disabledView?.disabled).toBe(true);
      expect(disabledView?.disabledReason).toContain("welder");
    } finally {
      mapObjectDefinitionById.delete(stubObjectId);
    }
  });

  it("evaluates object_status_equals via the runtime mapObjects table", () => {
    const stubObjectId = "__test_door__";
    const enterAction = createTestAction(
      "enter",
      [
        {
          type: "handler_condition",
          handler_type: "object_status_equals",
          params: { object_id: stubObjectId, status: "unlocked" },
        } as Condition,
      ],
      { display_when_unavailable: "disabled", ownerId: stubObjectId },
    );

    mapObjectDefinitionById.set(stubObjectId, {
      id: stubObjectId,
      kind: "structure",
      name: "实验舱门",
      visibility: "onDiscovered",
      status_options: ["locked", "unlocked"],
      initial_status: "locked",
      actions: [enterAction],
    });
    try {
      const tile = createTile("2-3");
      const baseGameState = createGameState({
        crew: [createMember()],
        map: {
          ...createGameState().map,
          discoveredTileIds: ["2-3"],
          tilesById: {
            "2-3": {
              discovered: true,
              investigated: false,
              revealedObjectIds: [stubObjectId],
            },
          },
        },
      });

      const lockedView = buildCallView({
        member: createMember(),
        tile,
        gameState: {
          ...baseGameState,
          map: {
            ...baseGameState.map,
            mapObjects: { [stubObjectId]: { id: stubObjectId, status_enum: "locked" } },
          },
        },
      });
      const lockedGroup = lockedView.groups.find((group) => group.title === "实验舱门");
      expect(lockedGroup?.actions[0].disabled).toBe(true);

      const unlockedView = buildCallView({
        member: createMember(),
        tile,
        gameState: {
          ...baseGameState,
          map: {
            ...baseGameState.map,
            mapObjects: { [stubObjectId]: { id: stubObjectId, status_enum: "unlocked" } },
          },
        },
      });
      const unlockedGroup = unlockedView.groups.find((group) => group.title === "实验舱门");
      expect(unlockedGroup?.actions[0].disabled).toBeFalsy();
    } finally {
      mapObjectDefinitionById.delete(stubObjectId);
    }
  });
});

function createTestAction(
  verb: string,
  conditions: Condition[],
  extras: Partial<Pick<ActionDef, "display_when_unavailable" | "unavailable_hint">> & { ownerId?: string } = {},
): ActionDef {
  const ownerId = extras.ownerId ?? "__test_inline_object__";
  const action: ActionDef = {
    id: `${ownerId}:${verb}`,
    category: "object",
    label: `测试动作 ${verb}`,
    tone: "neutral",
    conditions,
    event_id: `test.${verb}`,
  };
  if (extras.display_when_unavailable) {
    action.display_when_unavailable = extras.display_when_unavailable;
  }
  if (extras.unavailable_hint) {
    action.unavailable_hint = extras.unavailable_hint;
  }
  return action;
}
