import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App, { dispatchTimedLocalAction, mergeEventRuntimeState, resolvePhoneRuntimeCallCrewId, toEventEngineState, validatePhoneMessageEnvelope } from "./App";
import { buildEventContentIndex } from "./events/contentIndex";
import { crewDefinitions, defaultMapConfig, eventContentLibrary, eventProgramDefinitions, itemDefinitions, questDefinitions } from "./content/contentData";
import { mapObjectDefinitionById } from "./content/mapObjects";
import { createInitialMapState, initialCrew, initialLogs, initialTiles, resources as initialResources, type GameState } from "./data/gameData";
import { evaluateCondition } from "./events/conditions";
import { executeEffects } from "./events/effects";
import { processTrigger } from "./events/eventEngine";
import { createEmptyEventRuntimeState, type CrewActionState, type Effect } from "./events/types";
import { GAME_SAVE_KEY, GAME_SAVE_SCHEMA_VERSION, GAME_SAVE_VERSION, LEGACY_GAME_SAVE_KEY } from "./timeSystem";
import { createInitialQuestState, type QuestRuntimeState } from "./questSystem";

function readSavedState() {
  return JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "null") as Record<string, unknown> | null;
}

function getMikeCrewCard() {
  const card = Array.from(document.querySelectorAll("article.console-crew-card")).find((element) => element.textContent?.includes("麦克"));
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

function createSavedCrashSiteState(overrides: Record<string, unknown> = {}) {
  return {
    saveVersion: GAME_SAVE_VERSION,
    schema_version: GAME_SAVE_SCHEMA_VERSION,
    created_at_real_time: "2026-05-09T00:00:00.000Z",
    updated_at_real_time: "2026-05-09T00:00:00.000Z",
    elapsedGameSeconds: 0,
    crew: [
      {
        id: "mike",
        name: "麦克",
        role: "神秘幸存者",
        currentTile: "129-129",
        location: "IAFS坠毁点",
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
      },
    ],
    baseInventory: [],
      map: {
        configId: "default-map",
        configVersion: defaultMapConfig.version,
      rows: 256,
      cols: 256,
      originTileId: "129-129",
      discoveredTileIds: ["129-129"],
      investigationReportsById: {},
      tilesById: {
        "129-129": {
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
    tiles: [
      {
        id: "129-129",
        coord: "(0,0)",
        row: 129,
        col: 129,
        terrain: "平原",
        crew: ["mike"],
        status: "已发现",
        investigated: true,
      },
    ],
    logs: [],
    resources: { energy: 0, iron: 0, wood: 0, food: 0, water: 0, baseIntegrity: 100, sol: 1, power: 0, commWindow: "稳定" },
    eventHistory: {},
    active_events: {},
    active_calls: {},
    objectives: {},
    event_logs: [],
    world_history: {},
    world_flags: {},
    crew_actions: {},
    inventories: {},
    rng_state: null,
    quest_state: createInitialQuestState(questDefinitions, 0),
    ...overrides,
  };
}

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("renders the control center by default", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "前沿基地控制中心" })).toBeInTheDocument();
    expect(screen.getByText("第 1 日 00 小时 00 分钟 00 秒")).toBeInTheDocument();
    expect(screen.getByText("未读通讯 1")).toBeInTheDocument();
  });

  it("creates a blank-world save on first load", () => {
    render(<App />);

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(saved.saveVersion).toBe(GAME_SAVE_VERSION);
    expect(saved.map).toMatchObject({
      rows: 256,
      cols: 256,
      originTileId: "129-129",
      discoveredTileIds: [
        "128-128",
        "128-129",
        "128-130",
        "129-128",
        "129-129",
        "129-130",
        "129-131",
        "130-128",
        "130-129",
        "130-130",
        "130-131",
        "131-128",
        "131-129",
        "131-130",
      ],
    });
    expect(saved.crew.map((member: { id: string }) => member.id)).toEqual(["mike", "simon", "alice"]);
    expect((saved.crew as Array<{ currentTile: string; location: string }>)[0]).toMatchObject({ currentTile: "129-129", location: "IAFS坠毁点 (0,0)" });
    expect(saved.map.mapObjects).toMatchObject({
      iafs_generator: { status_enum: "damaged" },
      iafs_life_support: { status_enum: "damaged" },
      iafs_shuttle_core: { status_enum: "damaged" },
    });
    expect(Object.keys(saved.quest_state.quests)).toEqual(questDefinitions.map((quest) => quest.id));
    expect(saved.active_events["iafs_opening_mike_crash_call:0"]).toMatchObject({
      event_definition_id: "iafs_opening_mike_crash_call",
      current_node_id: "crash_report",
      status: "waiting_call",
    });
    expect(saved.active_calls["iafs_opening_mike_crash_call:0:crash_report:call"]).toMatchObject({
      crew_id: "mike",
      event_node_id: "crash_report",
      status: "awaiting_choice",
    });
    expect(saved.tiles).toBeUndefined();
  });

  it("restores and normalizes quest state from compatible saves", () => {
    const savedQuestState: QuestRuntimeState = createInitialQuestState(questDefinitions.slice(0, 1), 0);
    savedQuestState.quests.regroup_after_crash.status = "completed";
    savedQuestState.quests.regroup_after_crash.completed_at = 42;
    savedQuestState.quests.regroup_after_crash.current_node_id = "deleted_node";
    savedQuestState.quests.regroup_after_crash.todos.survey_crash_site.status = "completed";
    savedQuestState.quests.regroup_after_crash.todos.survey_crash_site.completed_at = 43;

    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createSavedCrashSiteState({ elapsedGameSeconds: 120, quest_state: savedQuestState })),
    );

    render(<App />);

    const saved = readSavedState();
    expect(saved?.quest_state).toMatchObject({
      quests: {
        regroup_after_crash: {
          status: "completed",
          completed_at: 42,
          current_node_id: "crash_site_unsecured",
          todos: {
            survey_crash_site: {
              status: "completed",
              completed_at: 43,
            },
          },
        },
      },
    });
  });

  it("normalizes renamed crew display names from compatible saves", () => {
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createSavedCrashSiteState({
        crew: [{ ...createSavedCrashSiteState().crew[0], name: "Mike" }],
      })),
    );

    render(<App />);

    const saved = readSavedState();
    expect((saved?.crew as Array<{ id: string; name: string }>).find((member) => member.id === "mike")?.name).toBe("麦克");
  });

  it("treats current-schema saves without quest state as incompatible", () => {
    window.localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(createSavedCrashSiteState({ elapsedGameSeconds: 999, quest_state: undefined })));

    render(<App />);

    const saved = readSavedState();
    expect(saved?.elapsedGameSeconds).toBe(0);
    expect(Object.keys((saved?.quest_state as QuestRuntimeState).quests)).toEqual(questDefinitions.map((quest) => quest.id));
  });

  it("ignores legacy saves and starts from the new baseline", () => {
    window.localStorage.setItem(LEGACY_GAME_SAVE_KEY, JSON.stringify({ elapsedGameSeconds: 999, crew: [], tiles: [], logs: [], resources: {} }));

    render(<App />);

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(saved.elapsedGameSeconds).toBe(0);
    expect(saved.map.originTileId).toBe("129-129");
    expect(saved.crew.map((member: { id: string }) => member.id)).toEqual(["mike", "simon", "alice"]);
  });

  it("ignores compatible-schema saves whose authored map baseline is outdated", () => {
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(
        createSavedCrashSiteState({
          elapsedGameSeconds: 999,
          crew: [
            {
              ...createSavedCrashSiteState().crew[0],
              currentTile: "1-1",
              location: "起点",
              coord: "(-3,3)",
            },
          ],
          map: {
            ...(createSavedCrashSiteState().map as Record<string, unknown>),
            configVersion: 1,
            discoveredTileIds: ["1-1"],
            tilesById: {
              "1-1": {
                discovered: true,
                investigated: false,
                revealedObjectIds: [],
              },
            },
          },
        }),
      ),
    );

    render(<App />);

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(saved.elapsedGameSeconds).toBe(0);
    expect(saved.map.originTileId).toBe("129-129");
    expect((saved.crew as Array<{ currentTile: string }>)[0]?.currentTile).toBe("129-129");
  });

  it("shows task tracking with crew controls and opens an empty inventory return", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /任务/ }));
    expect(screen.getByRole("heading", { name: "任务追踪" })).toBeInTheDocument();
    expect(screen.getAllByText("重整坠毁现场").length).toBeGreaterThan(0);

    const mikeCard = getMikeCrewCard();
    expect(mikeCard).not.toBeNull();

    fireEvent.click(within(mikeCard as HTMLElement).getByRole("button", { name: "查看背包" }));
    expect(screen.getByText("NO CARRIED ITEMS.")).toBeInTheDocument();
  });

  it("uses the console map entry to open the map without creating crew actions", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /地图/ }));

    expect(screen.getByRole("heading", { name: "卫星雷达地图" })).toBeInTheDocument();
    const saved = readSavedState();
    expect(saved?.crew_actions).toEqual({});
  });

  it("advances game time while the app is running", () => {
    vi.useFakeTimers();
    render(<App />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("第 1 日 00 小时 00 分钟 01 秒")).toBeInTheDocument();
  });

  it("does not expose a DOM event bypass for phone basic action intents", () => {
    render(<App />);

    act(() => {
      window.dispatchEvent(new CustomEvent("stellar-phone-choice-select", {
        detail: {
          version: 1,
          kind: "basic_action",
          crewId: "amy",
          actionId: "universal:standby",
          clientRequestId: "test-phone-standby",
        },
      }));
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(Object.values(saved.crew_actions ?? {})).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ crew_id: "amy", type: "standby", source: "player_command" })]),
    );
  });

  it("rejects forged or replayed phone-origin envelopes before PC authority handling", () => {
    const pairing = { roomId: "room-1", phoneTerminalId: "phone-1" };
    const baseMessage = {
      type: "phone.choice.select" as const,
      roomId: "room-1",
      clientId: "phone-1",
      sequence: 2,
      sentAt: 1000,
      payload: {
        version: 1,
        kind: "basic_action",
        crewId: "amy",
        actionId: "universal:standby",
        clientRequestId: "req-1",
      },
    };

    expect(validatePhoneMessageEnvelope(baseMessage, pairing, 1)).toEqual({ ok: true, nextSequence: 2 });
    expect(validatePhoneMessageEnvelope({ ...baseMessage, clientId: "attacker" }, pairing, 1)).toEqual({ ok: false, reason: "client_mismatch" });
    expect(validatePhoneMessageEnvelope({ ...baseMessage, roomId: "other-room" }, pairing, 1)).toEqual({ ok: false, reason: "room_mismatch" });
    expect(validatePhoneMessageEnvelope({ ...baseMessage, sequence: 1 }, pairing, 1)).toEqual({ ok: false, reason: "replayed_sequence" });
  });

  it("derives runtime-call phone intent crew from the authoritative call", () => {
    expect(resolvePhoneRuntimeCallCrewId("amy", "amy")).toEqual({ ok: true, crewId: "amy" });
    expect(resolvePhoneRuntimeCallCrewId(null, "garry")).toEqual({ ok: true, crewId: "garry" });
    expect(resolvePhoneRuntimeCallCrewId("mike", "amy")).toEqual({ ok: false, reason: "crew_mismatch" });
  });

  it("settles arrival event checks against runtime map state without crashing", () => {
    vi.useFakeTimers();
    const mikeTargetTileId = "129-130";
    const action = eventCrewAction({
      id: "mike-initial-move",
      crew_id: "mike",
      source: "player_command",
      type: "move",
      from_tile_id: "129-129",
      to_tile_id: mikeTargetTileId,
      target_tile_id: mikeTargetTileId,
      path_tile_ids: [mikeTargetTileId],
      started_at: 0,
      ends_at: 1,
      duration_seconds: 1,
      action_params: {
        route_step_index: 0,
        step_started_at: 0,
        step_finish_time: 1,
        step_durations_seconds: [1],
      },
    });
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [{ id: "mike", currentTile: "129-129", hasIncoming: false }],
        tiles: initialTiles,
        map: createInitialMapState(),
        logs: initialLogs,
        resources: initialResources,
        crew_actions: { [action.id]: action },
      })),
    );

    render(<App />);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(mikeTargetTileId).toBeTruthy();
    expect(saved.map.discoveredTileIds).toContain(mikeTargetTileId);
    expect(saved.tiles).toBeUndefined();
  });


  it("dispatches a repair selection into a timed repair crew action", () => {
    window.localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(createSavedCrashSiteState()));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /任务/ }));
    fireEvent.click(within(getMikeCrewCard()).getByRole("button", { name: "通话" }));
    fireEvent.click(within(screen.getByRole("heading", { name: /发电机/ }).closest("section") as HTMLElement).getByRole("button", { name: "维修" }));

    const saved = readSavedState();
    expect(saved).not.toBeNull();
    expect(Object.values((saved?.crew_actions ?? {}) as Record<string, { type: string; action_params?: { object_id?: string } }>)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "repair",
          action_params: expect.objectContaining({ object_id: "iafs_generator" }),
        }),
      ]),
    );
    const savedCrew = (saved?.crew ?? []) as Array<{ status: string; activeAction?: { actionType?: string; targetTile?: string } }>;
    expect(savedCrew[0]).toMatchObject({
      status: "正在维修发电机。",
      activeAction: expect.objectContaining({ actionType: "repair", targetTile: "129-129" }),
    });
    expect(saved?.active_calls).toEqual({});
  });

  it("investigating a damaged crash-site object creates a runtime event call", () => {
    window.localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(createSavedCrashSiteState()));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /任务/ }));
    fireEvent.click(within(getMikeCrewCard()).getByRole("button", { name: "通话" }));
    fireEvent.click(within(screen.getByRole("heading", { name: /发电机/ }).closest("section") as HTMLElement).getByRole("button", { name: "调查" }));

    expect(screen.getByText(/外壳撕裂/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收到，继续记录。" })).toBeInTheDocument();
  });

  it("investigating a repaired crash-site object creates a repaired-state runtime event call", () => {
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(
        createSavedCrashSiteState({
          map: {
            ...(createSavedCrashSiteState().map as Record<string, unknown>),
            mapObjects: {
              iafs_generator: { id: "iafs_generator", status_enum: "repaired" },
              iafs_life_support: { id: "iafs_life_support", status_enum: "damaged" },
              iafs_shuttle_core: { id: "iafs_shuttle_core", status_enum: "damaged" },
            },
          },
        }),
      ),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /任务/ }));
    fireEvent.click(within(getMikeCrewCard()).getByRole("button", { name: "通话" }));
    fireEvent.click(within(screen.getByRole("heading", { name: /发电机/ }).closest("section") as HTMLElement).getByRole("button", { name: "调查" }));

    expect(screen.getByText(/供电回路已恢复稳定/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收到，继续记录。" })).toBeInTheDocument();
  });

  it("reveals hidden crash-site objects only after surveying the crash site event", () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(
        createSavedCrashSiteState({
          map: {
            ...(createSavedCrashSiteState().map as Record<string, unknown>),
            tilesById: {
              "129-129": {
                discovered: true,
                investigated: true,
                revealedObjectIds: [],
              },
            },
          },
        }),
      ),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /任务/ }));
    fireEvent.click(within(getMikeCrewCard()).getByRole("button", { name: "通话" }));
    expect(screen.queryByRole("heading", { name: "发电机" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "调查当前区域" }));

    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(screen.getByText(/这里还有几套能辨认出来的关键设施/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "标记这些可用设施。" }));

    const saved = readSavedState();
    expect(saved?.map).toMatchObject({
      tilesById: {
        "129-129": {
          revealedObjectIds: ["iafs_generator", "iafs_life_support", "iafs_shuttle_core"],
        },
      },
    });
  }, 15_000);

  it("routes crash-site inspect triggers into the inspection event definitions", () => {
    const indexResult = buildEventContentIndex(eventContentLibrary);
    expect(indexResult.errors).toEqual([]);

    const result = processTrigger({
      state: toEventEngineState(createSavedCrashSiteState() as never),
      index: indexResult.index,
      context: {
        trigger_type: "action_complete",
        occurred_at: 0,
        source: "call",
        crew_id: "mike",
        tile_id: "129-129",
        action_id: "iafs_generator:inspect",
        event_id: null,
        event_definition_id: "iafs_generator_inspect_damaged",
        node_id: null,
        call_id: null,
        objective_id: null,
        selected_option_id: null,
        world_flag_key: null,
        proximity: null,
        payload: {
          action_type: "inspect",
          action_def_id: "iafs_generator:inspect",
          object_id: "iafs_generator",
          tags: ["iafs", "crash_site", "repair_target", "power_system"],
        },
      },
    });

    expect(result.candidate_report?.selected_event_definition_ids).toEqual(["iafs_generator_inspect_damaged"]);
    expect(result.candidate_report?.created_event_ids.length).toBe(1);
  });

  it("allows retrying a repair after a failed attempt has cleared the lock", () => {
    const retryResult = dispatchTimedLocalAction(
      createSavedCrashSiteState({
        elapsedGameSeconds: 180,
        crew: [
          {
            ...createSavedCrashSiteState().crew[0],
            status: "维修失败，待命中。",
            statusTone: "muted",
            activeAction: undefined,
          },
        ],
      }) as never,
      "mike",
      "iafs_generator:repair",
    );

    expect(retryResult.accepted).toBe(true);
    expect(Object.values(retryResult.state.crew_actions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "repair",
          action_params: expect.objectContaining({ object_id: "iafs_generator" }),
        }),
      ]),
    );
  });

  it("rejects repeat repair submissions when the object is already locked or repaired", () => {
    const lockedResult = dispatchTimedLocalAction(createSavedCrashSiteState({
      crew_actions: {
        "repair:amy:iafs_generator:0": {
          id: "repair:amy:iafs_generator:0",
          crew_id: "amy",
          type: "repair",
          status: "active",
          source: "player_command",
          parent_event_id: null,
          objective_id: null,
          action_request_id: null,
          from_tile_id: "129-129",
          to_tile_id: null,
          target_tile_id: "129-129",
          path_tile_ids: [],
          started_at: 0,
          ends_at: 180,
          progress_seconds: 0,
          duration_seconds: 180,
          action_params: { object_id: "iafs_generator" },
          can_interrupt: true,
          interrupt_duration_seconds: 10,
        },
      },
    }) as never, "mike", "iafs_generator:repair");
    expect(lockedResult.accepted).toBe(false);
    expect(lockedResult.reason).toContain("其他队员");

    const repairedResult = dispatchTimedLocalAction(createSavedCrashSiteState({
      map: {
        ...(createSavedCrashSiteState().map as Record<string, unknown>),
        mapObjects: {
          iafs_generator: { id: "iafs_generator", status_enum: "repaired" },
          iafs_life_support: { id: "iafs_life_support", status_enum: "damaged" },
          iafs_shuttle_core: { id: "iafs_shuttle_core", status_enum: "damaged" },
        },
      },
    }) as never, "mike", "iafs_generator:repair");
    expect(repairedResult.accepted).toBe(false);
    expect(repairedResult.reason).toContain("已经修复");
  });
});

function lastElement<T>(items: T[]): T {
  return items[items.length - 1];
}

type SavedCrewForTest = {
  id: string;
  currentTile?: string;
  activeAction?: Record<string, unknown>;
  inventory?: Array<{ itemId: string; quantity: number }>;
  unavailable?: boolean;
  conditions?: string[];
};

function savedCrew(saved: { crew?: SavedCrewForTest[] }, crewId: string) {
  const member = saved.crew?.find((item) => item.id === crewId);
  expect(member).toBeDefined();
  return member!;
}

function hasCrewItemCondition(itemId: string, minQuantity = 1) {
  return {
    type: "inventory_has_item" as const,
    target: { type: "crew_inventory" as const },
    value: itemId,
    params: { min_quantity: minQuantity },
  };
}

function addCrewItemEffect(itemId: string, quantity: number): Effect {
  return inventoryEffect("add_item", itemId, quantity);
}

function removeCrewItemEffect(itemId: string, quantity: number): Effect {
  return inventoryEffect("remove_item", itemId, quantity);
}

function inventoryEffect(type: "add_item" | "remove_item", itemId: string, quantity: number): Effect {
  return {
    id: `${type}:${itemId}`,
    type,
    target: { type: "crew_inventory" },
    params: { item_id: itemId, quantity },
    failure_policy: "fail_event",
    record_policy: { write_event_log: false, write_world_history: false },
  };
}

function findRuntimeEvent(saved: { active_events?: Record<string, unknown> }, eventDefinitionId: string) {
  return Object.values(saved.active_events ?? {}).find(
    (event) => (event as { event_definition_id: string }).event_definition_id === eventDefinitionId,
  ) as { active_call_id: string | null } | undefined;
}

function readSavedGameState() {
  return JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
}

function findSavedEvent(saved: { active_events?: Record<string, unknown> }, eventDefinitionId: string) {
  const event = Object.values(saved.active_events ?? {}).find(
    (item) => (item as { event_definition_id?: string }).event_definition_id === eventDefinitionId,
  );
  expect(event).toBeDefined();
  return event as {
    active_call_id?: string | null;
    blocking_claim_ids: string[];
    current_node_id: string;
    status: string;
  };
}

function startAmyBeastEmergencyFromSurvey() {
  window.localStorage.setItem(
    GAME_SAVE_KEY,
    JSON.stringify(createCompatibleSavedGameState({
      elapsedGameSeconds: 0,
      crew: [
        {
          id: "amy",
          currentTile: "2-3",
          location: "森林 / 山",
          coord: "(2,3)",
          status: "森林边缘待命。",
          statusTone: "neutral",
          hasIncoming: false,
          canCommunicate: true,
          unavailable: false,
          activeAction: null,
        },
      ],
      tiles: initialTiles,
      map: createInitialMapState(),
      logs: initialLogs,
      resources: initialResources,
    })),
  );

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /任务/ }));
  const amyCard = screen.getByText("Amy，千金大小姐").closest("article");
  expect(amyCard).not.toBeNull();
  fireEvent.click(within(amyCard as HTMLElement).getByRole("button", { name: "通话" }));
  fireEvent.click(screen.getByRole("button", { name: "调查当前区域" }));
}

function findTileWithObjectTag(tag: string, filters: { visibility?: string } = {}) {
  const tile = defaultMapConfig.tiles.find((item) =>
    item.objectIds.some((objectId) => {
      const object = mapObjectDefinitionById.get(objectId);
      return Boolean(object?.tags?.includes(tag) && (!filters.visibility || object.visibility === filters.visibility));
    }),
  );
  expect(tile).toBeDefined();
  return tile!;
}

function createMapWithDiscoveredTiles(...tileIds: string[]) {
  const map = createInitialMapState();
  for (const tileId of tileIds) {
    map.discoveredTileIds = Array.from(new Set([...map.discoveredTileIds, tileId]));
    map.tilesById[tileId] = {
      ...map.tilesById[tileId],
      discovered: true,
    };
  }
  return map;
}

function createMapWithHiddenObject(tileId: string, objectId: string) {
  const map = createMapWithDiscoveredTiles(tileId);
  map.tilesById[tileId] = {
    ...map.tilesById[tileId],
    investigated: false,
    revealedObjectIds: (map.tilesById[tileId]?.revealedObjectIds ?? []).filter((id) => id !== objectId),
  };
  return map;
}

function createCompatibleSavedGameState(state: Record<string, unknown>) {
  return {
    saveVersion: GAME_SAVE_VERSION,
    schema_version: GAME_SAVE_SCHEMA_VERSION,
    created_at_real_time: "2026-04-27T00:00:00.000Z",
    updated_at_real_time: "2026-04-27T00:00:00.000Z",
    map: createInitialMapState(),
    ...createEmptyEventRuntimeState(),
    quest_state: createInitialQuestState(questDefinitions, 0),
    ...state,
  };
}

function eventCrewAction(overrides: Partial<CrewActionState>): CrewActionState {
  return {
    id: "event-action",
    crew_id: "mike",
    type: "move",
    status: "active",
    source: "event_action_request",
    parent_event_id: "event-1",
    objective_id: null,
    action_request_id: null,
    from_tile_id: "1-1",
    to_tile_id: null,
    target_tile_id: "1-2",
    path_tile_ids: [],
    started_at: 0,
    ends_at: null,
    progress_seconds: 0,
    duration_seconds: 60,
    can_interrupt: true,
    interrupt_duration_seconds: 10,
    action_params: {},
    ...overrides,
  };
}

function garryGatherAction(tileId: string, objectId: string, durationSeconds = 300): CrewActionState {
  return eventCrewAction({
    id: `gather:${objectId}:${tileId}:0`,
    crew_id: "garry",
    source: "player_command",
    type: "gather",
    target_tile_id: tileId,
    started_at: 0,
    ends_at: durationSeconds,
    duration_seconds: durationSeconds,
    action_params: {
      object_id: objectId,
      resource_id: "iron_ore",
      perRoundYieldByResource: {
        iron_ore: 5,
      },
    },
  });
}

function createRuntimeCall(overrides: Record<string, unknown> = {}) {
  return {
    id: "runtime-call",
    event_id: "event-call-test",
    event_node_id: "call-node",
    call_template_id: "test.call",
    crew_id: "garry",
    status: "incoming",
    created_at: 0,
    connected_at: null,
    ended_at: null,
    expires_at: null,
    render_context_snapshot: {},
    rendered_lines: [runtimeLine("事件通话等待接入。", "garry")],
    available_options: [
      {
        option_id: "acknowledge",
        template_variant_id: "acknowledge-default",
        text: "收到。",
        is_default: true,
      },
    ],
    selected_option_id: null,
    blocking_claim_id: null,
    ...overrides,
  };
}

function runtimeLine(text: string, speakerCrewId: string) {
  return {
    template_variant_id: `${speakerCrewId}-line`,
    text,
    speaker_crew_id: speakerCrewId,
  };
}

function createVolcanicObjectiveState() {
  const eventId = "volcanic_ash_trace:480";
  const objectiveId = `${eventId}:ash_cross_crew_objective:objective`;
  const actionId = "amy-ash-survey";

  return {
    eventId,
    objectiveId,
    actionId,
    eventState: {
      active_events: {
        [eventId]: {
          id: eventId,
          event_definition_id: "volcanic_ash_trace",
          event_definition_version: 1,
          status: "waiting_objective",
          current_node_id: "ash_cross_crew_objective",
          primary_crew_id: "garry",
          related_crew_ids: [],
          primary_tile_id: "4-3",
          related_tile_ids: [],
          parent_event_id: null,
          child_event_ids: [],
          objective_ids: [objectiveId],
          active_call_id: null,
          selected_options: {
            ash_trace_call: "assign_probe",
          },
          random_results: {},
          blocking_claim_ids: [],
          created_at: 480,
          updated_at: 480,
          deadline_at: null,
          next_wakeup_at: null,
          trigger_context_snapshot: {
            trigger_type: "action_complete",
            occurred_at: 480,
            source: "crew_action",
            crew_id: "garry",
            tile_id: "4-3",
            action_id: "garry-survey-4-3",
            event_id: eventId,
            event_definition_id: "volcanic_ash_trace",
            node_id: null,
            call_id: null,
            objective_id: null,
            selected_option_id: null,
            world_flag_key: null,
            proximity: null,
            payload: {
              action_type: "survey",
            },
          },
          history_keys: [],
          result_key: null,
          result_summary: null,
        },
      },
      objectives: {
        [objectiveId]: {
          id: objectiveId,
          status: "assigned",
          parent_event_id: eventId,
          created_by_node_id: "ash_cross_crew_objective",
          title: "Survey the volcanic ash trace",
          summary: "Send another crew member to verify the ash line before it blows over.",
          target_tile_id: "4-3",
          eligible_crew_conditions: [],
          required_action_type: "survey",
          required_action_params: {
            duration_seconds: 45,
            can_interrupt: true,
          },
          assigned_crew_id: "amy",
          action_id: actionId,
          created_at: 481,
          assigned_at: 482,
          completed_at: null,
          deadline_at: 1080,
          completion_trigger_type: "objective_completed",
          result_key: null,
        },
      },
    },
  };
}

function volcanicTiles() {
  return initialTiles.map((tile) =>
    tile.id === "4-3"
      ? {
          ...tile,
          terrain: "火山灰沙漠",
          crew: ["garry", "amy"],
          status: "复核中",
        }
      : tile,
  );
}
