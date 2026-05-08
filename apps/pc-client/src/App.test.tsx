import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App, { dispatchTimedLocalAction, mergeEventRuntimeState, resolvePhoneRuntimeCallCrewId, toEventEngineState, validatePhoneMessageEnvelope } from "./App";
import { crewDefinitions, defaultMapConfig, eventProgramDefinitions, itemDefinitions } from "./content/contentData";
import { mapObjectDefinitionById } from "./content/mapObjects";
import { createInitialMapState, initialCrew, initialLogs, initialTiles, resources as initialResources, type GameState } from "./data/gameData";
import { evaluateCondition } from "./events/conditions";
import { executeEffects } from "./events/effects";
import { createEmptyEventRuntimeState, type CrewActionState, type Effect } from "./events/types";
import { GAME_SAVE_KEY, GAME_SAVE_SCHEMA_VERSION, GAME_SAVE_VERSION, LEGACY_GAME_SAVE_KEY } from "./timeSystem";

function readSavedState() {
  return JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "null") as Record<string, unknown> | null;
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
        name: "Mike",
        role: "神秘幸存者",
        currentTile: "4-4",
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
      configVersion: 1,
      rows: 8,
      cols: 8,
      originTileId: "4-4",
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
    tiles: [
      {
        id: "4-4",
        coord: "(0,0)",
        row: 4,
        col: 4,
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
    expect(screen.getByText("未读通讯 0")).toBeInTheDocument();
  });

  it("creates a blank-world save on first load", () => {
    render(<App />);

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(saved.saveVersion).toBe(GAME_SAVE_VERSION);
    expect(saved.map).toMatchObject({ rows: 8, cols: 8, originTileId: "4-4", discoveredTileIds: ["3-3", "3-4", "3-5", "4-3", "4-4", "4-5", "5-3", "5-4", "5-5"] });
    expect(saved.crew.map((member: { id: string }) => member.id)).toEqual(["mike"]);
    expect((saved.crew as Array<{ currentTile: string; location: string }>)[0]).toMatchObject({ currentTile: "4-4", location: "IAFS坠毁点 (0,0)" });
    expect(saved.map.mapObjects).toMatchObject({
      iafs_generator: { status_enum: "damaged" },
      iafs_life_support: { status_enum: "damaged" },
      iafs_shuttle_core: { status_enum: "damaged" },
    });
    expect(saved.tiles).toHaveLength(64);
  });

  it("ignores legacy saves and starts from the new baseline", () => {
    window.localStorage.setItem(LEGACY_GAME_SAVE_KEY, JSON.stringify({ elapsedGameSeconds: 999, crew: [], tiles: [], logs: [], resources: {} }));

    render(<App />);

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(saved.elapsedGameSeconds).toBe(0);
    expect(saved.map.originTileId).toBe("4-4");
    expect(saved.crew.map((member: { id: string }) => member.id)).toEqual(["mike"]);
  });

  it("shows one crew card in the communication station and an empty inventory modal", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const mikeCard = screen.getByText("Mike，神秘幸存者").closest("article");
    expect(mikeCard).not.toBeNull();

    fireEvent.click(within(mikeCard as HTMLElement).getByRole("button", { name: "查看背包" }));
    expect(screen.getByText("未记录携带物。")).toBeInTheDocument();
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
    const mikeTargetTileId = "2-1";
    const action = eventCrewAction({
      id: "mike-initial-move",
      crew_id: "mike",
      source: "player_command",
      type: "move",
      from_tile_id: "1-1",
      to_tile_id: mikeTargetTileId,
      target_tile_id: mikeTargetTileId,
      path_tile_ids: [mikeTargetTileId],
      started_at: 0,
      ends_at: 60,
      duration_seconds: 60,
    });
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [{ id: "mike", currentTile: "1-1", hasIncoming: false }],
        tiles: initialTiles,
        map: createInitialMapState(),
        logs: initialLogs,
        resources: initialResources,
        crew_actions: { [action.id]: action },
      })),
    );

    render(<App />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(mikeTargetTileId).toBeTruthy();
    expect(saved.map.discoveredTileIds).toContain(mikeTargetTileId);
    expect(saved.tiles).toHaveLength(64);
  });

  it("settles Garry gathering on a mineral_deposit tile into Garry's inventory", () => {
    vi.useFakeTimers();
    const mineralTile = findTileWithObjectTag("mineral_deposit");
    const action = garryGatherAction(mineralTile.id, "iron-ridge-deposit");
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [{ id: "garry", currentTile: mineralTile.id, hasIncoming: false }],
        tiles: initialTiles,
        map: createMapWithDiscoveredTiles(mineralTile.id),
        logs: initialLogs,
        resources: initialResources,
        crew_actions: { [action.id]: action },
      })),
    );

    render(<App />);

    const initialSaved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const initialGarry = savedCrew(initialSaved, "garry");
    expect(initialGarry.currentTile).toBe(mineralTile.id);
    expect(initialSaved.crew_actions[action.id]).toMatchObject({ type: "gather", target_tile_id: mineralTile.id });

    act(() => {
      vi.advanceTimersByTime(300_000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const garry = savedCrew(saved, "garry");
    expect(garry.inventory).toContainEqual({ itemId: "iron_ore", quantity: 9 });
    expect(saved.resources.iron).toBe(1240);
    expect(screen.getByText(/Garry 完成采集，获得 5 个 iron_ore/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const contactsPanel = screen.getByText(/通讯录 ·/).closest("section");
    expect(contactsPanel).not.toBeNull();
    const garryCard = within(contactsPanel as HTMLElement).getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "查看背包" }));

    expect(screen.getByRole("heading", { name: "Garry / 背包" })).toBeInTheDocument();
    expect(screen.getByText("铁矿石")).toBeInTheDocument();
    expect(screen.getByText("x9")).toBeInTheDocument();
  });

  it("creates and resolves Garry's mine anomaly call after gathering on a mineral_deposit tile", () => {
    vi.useFakeTimers();
    const mineralTile = findTileWithObjectTag("mineral_deposit");
    const action = garryGatherAction(mineralTile.id, "iron-ridge-deposit");
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [{ id: "garry", currentTile: mineralTile.id, hasIncoming: false }],
        tiles: initialTiles,
        map: createMapWithDiscoveredTiles(mineralTile.id),
        logs: initialLogs,
        resources: initialResources,
        crew_actions: { [action.id]: action },
      })),
    );

    render(<App />);

    act(() => {
      vi.advanceTimersByTime(300_000);
    });

    const gathered = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const mineEvent = findRuntimeEvent(gathered, "mine_anomaly_report");
    expect(mineEvent).toBeDefined();
    const mineCall = gathered.active_calls[mineEvent?.active_call_id ?? ""];
    expect(mineCall).toMatchObject({
      crew_id: "garry",
      status: "awaiting_choice",
    });
    expect(mineCall.severity ?? mineCall.render_context_snapshot?.severity).not.toBe("high");

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    expect(within(runtimeCallPanel as HTMLElement).getByText("普通")).toBeInTheDocument();
    fireEvent.click(within(runtimeCallPanel as HTMLElement).getByRole("button", { name: "接通" }));

    expect(screen.getByText(`Garry 报告 ${mineralTile.id} 的矿脉深处传来异常空声。`)).toBeInTheDocument();
    expect(screen.getByText("敲击回波不像实心矿体，更像有一段被掏空的裂腔。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "记录矿脉异常，采矿流程保持不变。" }));

    const resolved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const garry = savedCrew(resolved, "garry");
    expect(resolved.event_logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ summary: "Garry 记录了铁脊矿带矿脉中的异常空声。" }),
      ]),
    );
    expect(garry.conditions).toContain("noted_mine_anomaly");
    expect(garry.inventory).toContainEqual({ itemId: "iron_ore", quantity: 9 });
  });

  it("does not create Garry's mine anomaly call when gathering lacks the mineral_deposit tag", () => {
    vi.useFakeTimers();
    const untaggedIronObject = mapObjectDefinitionById.get("iron-ridge-outcrop");
    expect(untaggedIronObject?.tags ?? []).not.toContain("mineral_deposit");
    const untaggedIronTile = defaultMapConfig.tiles.find((tile) => tile.objectIds.includes("iron-ridge-outcrop"));
    expect(untaggedIronTile).toBeDefined();
    const action = garryGatherAction(untaggedIronTile!.id, "iron-ridge-outcrop", 180);

    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "amy",
            currentTile: untaggedIronTile?.id,
            location: untaggedIronTile?.areaName,
            coord: `(${untaggedIronTile?.row},${untaggedIronTile?.col})`,
            status: "裸露矿床采集中。",
            statusTone: "accent",
            hasIncoming: false,
          },
        ],
        tiles: initialTiles,
        map: createMapWithDiscoveredTiles(untaggedIronTile?.id ?? "3-4"),
        logs: initialLogs,
        resources: initialResources,
        crew_actions: { [action.id]: action },
      })),
    );

    render(<App />);

    act(() => {
      vi.advanceTimersByTime(180_000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(findRuntimeEvent(saved, "mine_anomaly_report")).toBeUndefined();
    expect(savedCrew(saved, "garry").inventory).toContainEqual({ itemId: "iron_ore", quantity: 9 });
  });

  it("does not expose removed object survey as a call decision", () => {
    vi.useFakeTimers();
    const mineralTile = findTileWithObjectTag("mineral_deposit");
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "garry",
            currentTile: mineralTile.id,
            location: mineralTile.areaName,
            coord: `(${mineralTile.row},${mineralTile.col})`,
            status: "矿带待命。",
            statusTone: "neutral",
            hasIncoming: false,
            activeAction: null,
          },
        ],
        tiles: initialTiles,
        map: createMapWithDiscoveredTiles(mineralTile.id),
        logs: initialLogs,
        resources: initialResources,
      })),
    );
=======
  it("dispatches a repair selection into a timed repair crew action", () => {
    window.localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(createSavedCrashSiteState()));
>>>>>>> 24e5d5a (feat(iafs): wire timed repair actions)

  it("dispatches a repair selection into a timed repair crew action", () => {
    window.localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(createSavedCrashSiteState()));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    fireEvent.click(screen.getByRole("button", { name: "通话" }));
    fireEvent.click(within(screen.getByRole("heading", { name: "发电机" }).closest("section") as HTMLElement).getByRole("button", { name: "维修" }));

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
      activeAction: expect.objectContaining({ actionType: "repair", targetTile: "4-4" }),
    });
    expect(saved?.active_calls).toEqual({});
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
          from_tile_id: "4-4",
          to_tile_id: null,
          target_tile_id: "4-4",
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
