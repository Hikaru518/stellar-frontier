import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App, { mergeEventRuntimeState, toEventEngineState } from "./App";
import { crewDefinitions, defaultMapConfig, eventProgramDefinitions, itemDefinitions } from "./content/contentData";
import { createInitialMapState, initialCrew, initialLogs, initialTiles, resources as initialResources, type GameState } from "./data/gameData";
import { evaluateCondition } from "./events/conditions";
import { executeEffects } from "./events/effects";
import { createEmptyEventRuntimeState, type CrewActionState, type Effect } from "./events/types";
import { GAME_SAVE_KEY, GAME_SAVE_SCHEMA_VERSION, GAME_SAVE_VERSION, LEGACY_GAME_SAVE_KEY } from "./timeSystem";

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
    expect(screen.getByRole("button", { name: /通讯台/ })).toBeInTheDocument();
  });

  it("enters the ending page when return home is completed", async () => {
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 3723,
        crew: initialCrew,
        tiles: initialTiles,
        map: createInitialMapState(),
        logs: initialLogs,
        resources: initialResources,
        world_flags: {
          return_home_completed: {
            key: "return_home_completed",
            value: true,
            value_type: "boolean",
            created_at: 3600,
            updated_at: 3600,
          },
          return_home_completed_at: {
            key: "return_home_completed_at",
            value: 3600,
            value_type: "number",
            created_at: 3600,
            updated_at: 3600,
          },
        },
      })),
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "返航完成" })).toBeInTheDocument();
    expect(screen.getByText("完成时间：第 1 日 01 小时 00 分钟 00 秒")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重置游戏" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "回控制中心查看记录" }));
    expect(screen.getByRole("heading", { name: "前沿基地控制中心" })).toBeInTheDocument();
  });

  it("creates the initial runtime map state from the default map config", () => {
    render(<App />);

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(saved.saveVersion).toBe(GAME_SAVE_VERSION);
    expect(saved.map).toMatchObject({
      configId: "default-map",
      configVersion: 1,
      rows: 8,
      cols: 8,
      originTileId: "4-4",
      discoveredTileIds: ["4-4"],
      investigationReportsById: {},
    });
    expect(saved.map.tilesById["4-4"].discovered).toBe(true);
  });

  it("ignores old v1 saves when starting a v2 game", () => {
    window.localStorage.setItem(
      LEGACY_GAME_SAVE_KEY,
      JSON.stringify({ elapsedGameSeconds: 999, crew: [], tiles: initialTiles.slice(0, 16), logs: [], resources: initialResources }),
    );

    render(<App />);

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(saved.elapsedGameSeconds).toBe(0);
    expect(saved.map.rows).toBe(8);
    expect(saved.tiles).toHaveLength(64);
  });

  it("shows empty event log and objective states without crashing", () => {
    render(<App />);

    expect(screen.getByText("暂无事件记录。")).toBeInTheDocument();
    expect(screen.getByText("暂无事件目标。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));

    expect(screen.getByText("暂无可分配目标。")).toBeInTheDocument();
  });

  it("advances game time while the app is running", () => {
    vi.useFakeTimers();

    render(<App />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("第 1 日 00 小时 00 分钟 01 秒")).toBeInTheDocument();
  });

  it("settles arrival event checks against derived legacy tiles without crashing", () => {
    vi.useFakeTimers();
    const mikeTargetTileId = crewDefinitions.find((member) => member.crewId === "mike")?.activeAction?.targetTile;

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

    render(<App />);

    const initialSaved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const initialGarry = savedCrew(initialSaved, "garry");
    expect(initialGarry.currentTile).toBe(mineralTile.id);
    expect(initialGarry.activeAction).toMatchObject({ actionType: "gather", targetTile: mineralTile.id });

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
    const untaggedIronTile = defaultMapConfig.tiles.find((tile) =>
      tile.objects.some(
        (object) =>
          object.legacyResource === "iron_ore" &&
          object.candidateActions?.includes("gather") &&
          !object.tags?.includes("mineral_deposit"),
      ),
    );
    expect(untaggedIronTile).toBeDefined();

    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "garry",
            currentTile: untaggedIronTile?.id,
            location: untaggedIronTile?.areaName,
            coord: `(${untaggedIronTile?.row},${untaggedIronTile?.col})`,
            status: "裸露矿床采集中。",
            statusTone: "accent",
            hasIncoming: false,
            activeAction: {
              id: "gather:iron-ridge-outcrop:3-4:0",
              actionType: "gather",
              status: "inProgress",
              startTime: 0,
              durationSeconds: 180,
              finishTime: 180,
              targetTile: untaggedIronTile?.id,
              objectId: "iron-ridge-outcrop",
              handler: "gather",
              actionDefId: "gather",
              params: {
                perRoundYieldByResource: {
                  iron_ore: 5,
                },
              },
            },
          },
        ],
        tiles: initialTiles,
        map: createMapWithDiscoveredTiles(untaggedIronTile?.id ?? "3-4"),
        logs: initialLogs,
        resources: initialResources,
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

  it("settles Garry survey on the current mineral_deposit tile through content action metadata", () => {
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

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));
    fireEvent.click(screen.getByRole("button", { name: "调查 铁矿床" }));

    const actionStarted = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(savedCrew(actionStarted, "garry").activeAction).toMatchObject({
      actionType: "survey",
      targetTile: mineralTile.id,
      durationSeconds: 120,
    });

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const garry = savedCrew(saved, "garry");
    expect(garry.activeAction).toBeUndefined();
    expect(saved.map.tilesById[mineralTile.id].investigated).toBe(true);
    expect(saved.resources.iron).toBe(1240);
    expect(saved.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Garry 完成一轮调查。" }),
      ]),
    );
  });

  it("reveals investigated map objects through a tag-selected survey target", () => {
    vi.useFakeTimers();
    const signalTile = findTileWithObjectTag("signal", { visibility: "onInvestigated" });
    const signalObject = signalTile.objects.find((object) => object.tags?.includes("signal") && object.visibility === "onInvestigated");
    const map = createInitialMapState();
    map.discoveredTileIds = ["4-4", signalTile.id];
    map.tilesById[signalTile.id] = {
      ...map.tilesById[signalTile.id],
      discovered: true,
      investigated: false,
      revealedObjectIds: [],
      revealedSpecialStateIds: [],
    };
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify({
        schema_version: GAME_SAVE_SCHEMA_VERSION,
        elapsedGameSeconds: 0,
        saveVersion: GAME_SAVE_VERSION,
        ...createEmptyEventRuntimeState(),
        crew: [{ id: "garry", currentTile: signalTile.id, activeAction: null }],
        tiles: initialTiles,
        map,
        logs: initialLogs,
        resources: initialResources,
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));
    fireEvent.click(screen.getByRole("button", { name: "调查当前区域" }));

    act(() => {
      vi.advanceTimersByTime(180_000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const runtimeTile = saved.map.tilesById[signalTile.id];
    expect(runtimeTile.investigated).toBe(true);
    expect(runtimeTile.revealedObjectIds).toContain(signalObject?.id);
    expect(saved.logs).toEqual(expect.arrayContaining([expect.objectContaining({ text: "Garry 完成一轮调查。" })]));
  });

  it("creates a runtime call when a forest-tagged survey finishes", () => {
    vi.useFakeTimers();
    const forestTile = findTileWithObjectTag("forest");
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "garry",
            currentTile: forestTile.id,
            location: forestTile.areaName,
            coord: `(${forestTile.row},${forestTile.col})`,
            status: "森林边缘待命。",
            statusTone: "neutral",
            hasIncoming: false,
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

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));
    fireEvent.click(screen.getByRole("button", { name: "调查当前区域" }));

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const forestEvent = Object.values(saved.active_events).find(
      (event) => (event as { event_definition_id: string }).event_definition_id === "forest_trace_small_camp",
    ) as { active_call_id: string } | undefined;
    expect(forestEvent).toBeDefined();
    expect(saved.active_calls[forestEvent?.active_call_id ?? ""].status).toBe("awaiting_choice");

    fireEvent.click(lastElement(screen.getAllByRole("button", { name: "结束通话" })));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    fireEvent.click(within(runtimeCallPanel as HTMLElement).getByRole("button", { name: "接通" }));

    expect(screen.getByText(new RegExp(`Garry 报告 ${forestTile.id} 附近有一处小型营地痕迹。`))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "标记这处营地痕迹。" })).toBeInTheDocument();
  });

  it("triggers idle_time events after a standby decision", () => {
    const forestTile = findTileWithObjectTag("forest");
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "garry",
            currentTile: forestTile.id,
            location: forestTile.areaName,
            coord: `(${forestTile.row},${forestTile.col})`,
            status: "森林边缘待命。",
            statusTone: "neutral",
            hasIncoming: false,
            activeAction: null,
          },
        ],
        tiles: initialTiles.map((tile) =>
          tile.id === forestTile.id ? { ...tile, crew: ["garry"], dangerTags: ["beast_tracks"] } : tile,
        ),
        map: createInitialMapState(),
        logs: initialLogs,
        resources: initialResources,
      })),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));
    fireEvent.click(screen.getByRole("button", { name: "原地待命" }));

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(Object.values(saved.active_events).map((event) => (event as { event_definition_id: string }).event_definition_id)).toContain(
      "forest_beast_emergency",
    );
  });

  it("surfaces Amy's forest beast emergency as a blocking high-severity runtime call", () => {
    startAmyBeastEmergencyFromStandby();

    const saved = readSavedGameState();
    const event = findSavedEvent(saved, "forest_beast_emergency");
    const call = saved.active_calls[event.active_call_id ?? ""];
    const amy = savedCrew(saved, "amy");

    expect(event.status).toBe("waiting_call");
    expect(call).toMatchObject({
      crew_id: "amy",
      call_template_id: "forest_beast_emergency.call.report",
      expires_at: 180,
      render_context_snapshot: expect.objectContaining({ severity: "high" }),
    });
    expect(amy.activeAction).toMatchObject({ actionType: "event" });
    expect(amy.unavailable).toBe(true);

    fireEvent.click(lastElement(screen.getAllByRole("button", { name: "结束通话" })));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    expect(within(runtimeCallPanel as HTMLElement).getByText("紧急")).toBeInTheDocument();
    expect(within(runtimeCallPanel as HTMLElement).getByText("剩余 03:00")).toBeInTheDocument();
    expect(within(runtimeCallPanel as HTMLElement).getByRole("button", { name: "接通" })).toBeInTheDocument();
  });

  it.each([
    ["evacuate", "撤离到开阔地。"],
    ["engage", "用随身武器和噪声驱赶它。"],
    ["stay_hidden", "继续隐藏，保持安静。"],
  ])("resolves Amy's forest beast emergency option %s and releases her event action", (_optionId, optionLabel) => {
    startAmyBeastEmergencyFromStandby();
    fireEvent.click(lastElement(screen.getAllByRole("button", { name: "结束通话" })));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    fireEvent.click(within(runtimeCallPanel as HTMLElement).getByRole("button", { name: "接通" }));

    fireEvent.click(screen.getByRole("button", { name: optionLabel }));

    const saved = readSavedGameState();
    const event = findSavedEvent(saved, "forest_beast_emergency");
    const amy = savedCrew(saved, "amy");
    expect(event.status).toBe("resolved");
    expect(event.blocking_claim_ids).toEqual([]);
    expect(amy.activeAction).toBeUndefined();
    expect(amy.unavailable).toBe(false);
  });

  it("expires Amy's unanswered forest beast emergency through the missed-call consequence path", () => {
    vi.useFakeTimers();
    startAmyBeastEmergencyFromStandby();

    act(() => {
      vi.advanceTimersByTime(181_000);
    });

    const saved = readSavedGameState();
    const event = findSavedEvent(saved, "forest_beast_emergency");
    const amy = savedCrew(saved, "amy");

    expect(event.status).toBe("failed");
    expect(event.current_node_id).toBe("beast_missed_end");
    expect(amy.activeAction).toBeUndefined();
    expect(amy.unavailable).toBe(false);
    expect(amy.conditions).toContain("animal_aggro");
    expect(saved.event_logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_definition_id: "forest_beast_emergency",
          importance: "critical",
          summary: expect.stringContaining("野兽被通讯延误激怒"),
        }),
      ]),
    );
  });

  it("keeps items and approved event program samples wired through content data", () => {
    const lightItem = itemDefinitions.find((item) => item.tags.includes("light") && item.usableInResponse);
    expect(lightItem).toBeDefined();
    expect(
      crewDefinitions.some((member) => member.inventory.some((entry) => entry.itemId === lightItem?.itemId && entry.quantity > 0)),
    ).toBe(true);

    expect(itemDefinitions.some((item) => item.tags.includes("clue"))).toBe(true);

    expect(eventProgramDefinitions.map((definition) => definition.id)).toEqual(
      expect.arrayContaining([
        "forest_trace_small_camp",
        "forest_beast_emergency",
        "mine_anomaly_report",
        "mountain_signal_probe",
        "volcanic_ash_trace",
        "lost_relic_argument",
      ]),
    );
    expect(
      eventProgramDefinitions
        .find((definition) => definition.id === "volcanic_ash_trace")
        ?.event_graph.nodes.some((node) => node.type === "objective"),
    ).toBe(true);
  });

  it("syncs event inventory item changes back to crew inventory for later conditions", () => {
    const mike = initialCrew.find((member) => member.id === "mike");
    expect(mike).toBeDefined();
    const state = createCompatibleSavedGameState({
      elapsedGameSeconds: 0,
      crew: [
        {
          ...mike,
          inventory: [{ itemId: "ration", quantity: 1 }],
          conditions: ["steady"],
          personalityTags: ["baseline"],
        },
      ],
      tiles: initialTiles,
      map: createInitialMapState(),
      logs: initialLogs,
      resources: initialResources,
      baseInventory: [{ itemId: "iron_ore", quantity: 1240 }],
      inventories: {
        base: {
          id: "base",
          owner_type: "base",
          owner_id: "base",
          items: [{ item_id: "iron_ore", quantity: 1 }],
          resources: { ...initialResources, iron: 1 },
        },
        "crew:mike": {
          id: "crew:mike",
          owner_type: "crew",
          owner_id: "mike",
          items: [{ item_id: "old_compass", quantity: 99 }],
          resources: {},
        },
      },
    }) as unknown as GameState;

    const runtimeState = toEventEngineState(state);
    expect(runtimeState.inventories["crew:mike"].items).toEqual([{ item_id: "ration", quantity: 1 }]);
    expect(
      evaluateCondition(hasCrewItemCondition("ration"), {
        state: runtimeState,
        trigger_context: { trigger_type: "call_choice", source: "call", occurred_at: 0, crew_id: "mike" },
      }).passed,
    ).toBe(true);

    const executed = executeEffects([removeCrewItemEffect("ration", 1), addCrewItemEffect("iron_ore", 2)], {
      state: {
        ...runtimeState,
        crew: {
          ...runtimeState.crew,
          mike: {
            ...runtimeState.crew.mike,
            condition_tags: [...runtimeState.crew.mike.condition_tags, "runtime_condition"],
            personality_tags: [...runtimeState.crew.mike.personality_tags, "runtime_tag"],
          },
        },
      },
      trigger_context: { trigger_type: "call_choice", source: "call", occurred_at: 0, crew_id: "mike" },
    });
    expect(executed.status).toBe("success");

    const merged = mergeEventRuntimeState(state, executed.state);
    const mergedMike = merged.crew.find((member) => member.id === "mike");
    expect(mergedMike).toBeDefined();
    expect(mergedMike!.inventory).toEqual([{ itemId: "iron_ore", quantity: 2 }]);
    expect(mergedMike!.conditions).toContain("runtime_condition");
    expect(mergedMike!.personalityTags).toContain("runtime_tag");
    expect(merged.baseInventory).toEqual([{ itemId: "iron_ore", quantity: 1240 }]);
    expect(merged.resources.iron).toBe(1240);

    const nextRuntimeState = toEventEngineState(merged);
    expect(
      evaluateCondition(hasCrewItemCondition("iron_ore", 2), {
        state: nextRuntimeState,
        trigger_context: { trigger_type: "call_choice", source: "call", occurred_at: 1, crew_id: "mike" },
      }).passed,
    ).toBe(true);
    expect(
      evaluateCondition(hasCrewItemCondition("ration"), {
        state: nextRuntimeState,
        trigger_context: { trigger_type: "call_choice", source: "call", occurred_at: 1, crew_id: "mike" },
      }).passed,
    ).toBe(false);
  });

  it("creates the seeded forest trace sample when Garry is placed on a forest tile", () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        saveVersion: GAME_SAVE_VERSION,
        crew: [
          {
            id: "garry",
            currentTile: "2-3",
            location: "木材",
            coord: "(2,3)",
            status: "森林边缘待命。",
            statusTone: "neutral",
            hasIncoming: false,
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

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));
    fireEvent.click(screen.getByRole("button", { name: "调查当前区域" }));

    act(() => {
      vi.advanceTimersByTime(180_000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(Object.values(saved.active_events).map((event) => (event as { event_definition_id: string }).event_definition_id)).toContain(
      "forest_trace_small_camp",
    );
    expect(
      Object.values(saved.active_calls).some(
        (call) => (call as { event_id: string; event_node_id: string }).event_id.startsWith("forest_trace_small_camp:") && (call as { event_node_id: string }).event_node_id === "trace_report",
      ),
    ).toBe(true);
  });

  it("opens the seeded forest trace runtime call from the station and submits its stable option_id", () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        saveVersion: GAME_SAVE_VERSION,
        crew: [
          {
            id: "garry",
            currentTile: "2-3",
            location: "木材",
            coord: "(2,3)",
            status: "森林边缘待命。",
            statusTone: "neutral",
            hasIncoming: false,
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

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    let garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));
    fireEvent.click(screen.getByRole("button", { name: "调查当前区域" }));

    act(() => {
      vi.advanceTimersByTime(180_000);
    });

    const endButtons = screen.getAllByRole("button", { name: "结束通话" });
    fireEvent.click(endButtons[endButtons.length - 1]);
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    fireEvent.click(within(runtimeCallPanel as HTMLElement).getByRole("button", { name: "接通" }));

    expect(screen.getByText("Garry 报告 2-3 附近有一处小型营地痕迹。")).toBeInTheDocument();
    expect(screen.getByText("没有活动迹象，只有冷灰和一根被绑过的树枝。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "标记这处营地痕迹。" }));

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const call = Object.values(saved.active_calls).find(
      (item) => (item as { event_id: string; event_node_id: string }).event_id.startsWith("forest_trace_small_camp:") && (item as { event_node_id: string }).event_node_id === "trace_report",
    ) as { status: string; selected_option_id: string | null; event_id: string } | undefined;
    const event = call ? saved.active_events[call.event_id] : undefined;

    expect(call?.status).toBe("ended");
    expect(call?.selected_option_id).toBe("mark_camp");
    expect(event?.status).toBe("resolved");
    expect(event?.current_node_id).toBe("trace_resolved");
    expect(event?.selected_options).toEqual({ trace_report: "mark_camp" });
  });

  it("opens Mike's crash site recon call and marks the wreckage signal", () => {
    vi.useFakeTimers();
    const crashTile = findTileWithObjectTag("crash_site");
    const crashObject = crashTile.objects.find((object) => object.tags?.includes("crash_site"));
    expect(crashObject).toBeDefined();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        saveVersion: GAME_SAVE_VERSION,
        crew: [
          {
            id: "mike",
            currentTile: crashTile.id,
            location: crashTile.areaName,
            coord: `(${crashTile.row},${crashTile.col})`,
            status: "残骸附近待命。",
            statusTone: "neutral",
            hasIncoming: false,
            activeAction: null,
          },
        ],
        tiles: initialTiles,
        map: createMapWithHiddenObject(crashTile.id, crashObject?.id ?? ""),
        logs: initialLogs,
        resources: initialResources,
      })),
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const mikeCard = screen.getByText("Mike，特战干员").closest("article");
    expect(mikeCard).not.toBeNull();
    fireEvent.click(within(mikeCard as HTMLElement).getByRole("button", { name: "通话" }));
    fireEvent.click(screen.getByRole("button", { name: "调查当前区域" }));

    act(() => {
      vi.advanceTimersByTime(180_000);
    });

    let saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const crashEvent = Object.values(saved.active_events).find(
      (event) => (event as { event_definition_id: string }).event_definition_id === "crash_site_wreckage_recon",
    ) as { active_call_id: string } | undefined;
    expect(crashEvent).toBeDefined();
    expect(saved.active_calls[crashEvent?.active_call_id ?? ""].status).toBe("awaiting_choice");

    fireEvent.click(lastElement(screen.getAllByRole("button", { name: "结束通话" })));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    fireEvent.click(within(runtimeCallPanel as HTMLElement).getByRole("button", { name: "接通" }));

    expect(screen.getByText(new RegExp(`Mike 报告 ${crashTile.id} 的残骸内部仍有微弱信号。`))).toBeInTheDocument();
    expect(screen.getByText("信号像是从断裂舱段深处反射出来，无法确认是否还在移动。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "标记残骸内部信号。" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂时撤出，保持观测距离。" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "标记残骸内部信号。" }));
    saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");

    expect(saved.map.tilesById[crashTile.id].revealedObjectIds).toContain(crashObject?.id);
    expect(saved.event_logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ summary: "Mike 已标记坠毁残骸内部的微弱信号。" }),
      ]),
    );
  });

  it("lets Mike withdraw from crash site recon without revealing the wreckage signal", () => {
    vi.useFakeTimers();
    const crashTile = findTileWithObjectTag("crash_site");
    const crashObject = crashTile.objects.find((object) => object.tags?.includes("crash_site"));
    expect(crashObject).toBeDefined();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        saveVersion: GAME_SAVE_VERSION,
        crew: [
          {
            id: "mike",
            currentTile: crashTile.id,
            location: crashTile.areaName,
            coord: `(${crashTile.row},${crashTile.col})`,
            status: "残骸附近待命。",
            statusTone: "neutral",
            hasIncoming: false,
            activeAction: null,
          },
        ],
        tiles: initialTiles,
        map: createMapWithHiddenObject(crashTile.id, crashObject?.id ?? ""),
        logs: initialLogs,
        resources: initialResources,
      })),
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const mikeCard = screen.getByText("Mike，特战干员").closest("article");
    expect(mikeCard).not.toBeNull();
    fireEvent.click(within(mikeCard as HTMLElement).getByRole("button", { name: "通话" }));
    fireEvent.click(screen.getByRole("button", { name: "调查当前区域" }));

    act(() => {
      vi.advanceTimersByTime(180_000);
    });

    fireEvent.click(lastElement(screen.getAllByRole("button", { name: "结束通话" })));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    fireEvent.click(within(runtimeCallPanel as HTMLElement).getByRole("button", { name: "接通" }));
    fireEvent.click(screen.getByRole("button", { name: "暂时撤出，保持观测距离。" }));

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const crashEvent = Object.values(saved.active_events).find(
      (event) => (event as { event_definition_id: string }).event_definition_id === "crash_site_wreckage_recon",
    ) as { status: string; current_node_id: string; result_key: string } | undefined;

    expect(crashEvent).toMatchObject({
      status: "resolved",
      current_node_id: "withdraw_end",
      result_key: "withdrawn",
    });
    expect(saved.map.tilesById[crashTile.id].revealedObjectIds).not.toContain(crashObject?.id);
  });

  it("shows non-urgent event calls as neutral connect entries without countdown", () => {
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 30,
        crew: [{ id: "garry", currentTile: "3-3", activeAction: null, hasIncoming: false }],
        tiles: initialTiles,
        map: createInitialMapState(),
        logs: initialLogs,
        resources: initialResources,
        active_calls: {
          "normal-event-call": createRuntimeCall({
            id: "normal-event-call",
            crew_id: "garry",
            severity: "medium",
            expires_at: 300,
            rendered_lines: [runtimeLine("Garry 报告矿脉里传出空声。", "garry")],
          }),
        },
      })),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    const callCard = within(runtimeCallPanel as HTMLElement).getByText("Garry 报告矿脉里传出空声。").closest("article");
    expect(callCard).not.toBeNull();

    expect(within(callCard as HTMLElement).getByRole("button", { name: "接通" })).toBeInTheDocument();
    expect(within(callCard as HTMLElement).getByText("普通")).toHaveClass("status-neutral");
    expect(within(callCard as HTMLElement).queryByText(/剩余/)).not.toBeInTheDocument();
    expect(within(callCard as HTMLElement).queryByText("无强制倒计时")).not.toBeInTheDocument();
  });

  it("shows urgent event calls as danger connect entries with countdown", () => {
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 95,
        crew: [{ id: "amy", currentTile: "2-3", activeAction: null, hasIncoming: false }],
        tiles: initialTiles,
        map: createInitialMapState(),
        logs: initialLogs,
        resources: initialResources,
        active_calls: {
          "urgent-event-call": createRuntimeCall({
            id: "urgent-event-call",
            crew_id: "amy",
            severity: "high",
            expires_at: 215,
            rendered_lines: [runtimeLine("Amy 压低声音：有个大型生物正在绕行。", "amy")],
          }),
        },
      })),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    const callCard = within(runtimeCallPanel as HTMLElement).getByText("Amy 压低声音：有个大型生物正在绕行。").closest("article");
    expect(callCard).not.toBeNull();

    expect(within(callCard as HTMLElement).getByRole("button", { name: "接通" })).toBeInTheDocument();
    expect(within(callCard as HTMLElement).getByText("紧急")).toHaveClass("status-danger");
    expect(within(callCard as HTMLElement).getByText("剩余 02:00")).toBeInTheDocument();
  });

  it("shows connect on a contact card when that crew has an active runtime call", () => {
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 10,
        crew: [
          { id: "amy", hasIncoming: false },
          { id: "garry", currentTile: "3-3", activeAction: null, hasIncoming: true },
        ],
        tiles: initialTiles,
        map: createInitialMapState(),
        logs: initialLogs,
        resources: initialResources,
        active_calls: {
          "priority-event-call": createRuntimeCall({
            id: "priority-event-call",
            crew_id: "garry",
            severity: "medium",
            rendered_lines: [runtimeLine("Garry 的事件频道等待接入。", "garry")],
          }),
        },
      })),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    const contactsPanel = screen.getByText("通讯录 · 1 条来电").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    expect(contactsPanel).not.toBeNull();
    const eventCallCard = within(runtimeCallPanel as HTMLElement).getByText("Garry 的事件频道等待接入。").closest("article");
    const contactCard = within(contactsPanel as HTMLElement).getByText("Garry，退休老大爷").closest("article");
    expect(eventCallCard).not.toBeNull();
    expect(contactCard).not.toBeNull();

    expect(screen.getAllByRole("button", { name: "接通" })).toHaveLength(2);
    fireEvent.click(within(contactCard as HTMLElement).getByRole("button", { name: "接通" }));
    expect(screen.getByRole("heading", { name: "通话页面：Garry 事件通话" })).toBeInTheDocument();
    expect(screen.getByText("Garry 的事件频道等待接入。")).toBeInTheDocument();
    expect((eventCallCard as HTMLElement).compareDocumentPosition(contactCard as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the resolved seeded forest camp trace on the map tile", () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        saveVersion: GAME_SAVE_VERSION,
        crew: [
          {
            id: "garry",
            currentTile: "2-3",
            location: "木材",
            coord: "(2,3)",
            status: "森林边缘待命。",
            statusTone: "neutral",
            hasIncoming: false,
            activeAction: null,
          },
        ],
        tiles: initialTiles,
        logs: initialLogs,
        resources: initialResources,
      })),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    let garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));
    fireEvent.click(screen.getByRole("button", { name: "调查当前区域" }));

    act(() => {
      vi.advanceTimersByTime(180_000);
    });

    fireEvent.click(lastElement(screen.getAllByRole("button", { name: "结束通话" })));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    fireEvent.click(within(runtimeCallPanel as HTMLElement).getByRole("button", { name: "接通" }));
    fireEvent.click(screen.getByRole("button", { name: "标记这处营地痕迹。" }));
    fireEvent.click(lastElement(screen.getAllByRole("button", { name: "结束通话" })));
    fireEvent.click(screen.getByRole("button", { name: "返回控制中心" }));
    fireEvent.click(screen.getByRole("button", { name: /卫星雷达/ }));
    fireEvent.click(screen.getByRole("button", { name: /\(-1,2\).*黑松林缘/ }));

    expect(screen.getAllByText("小型营地痕迹").length).toBeGreaterThan(0);
    expect(screen.getByText("一处森林小型营地痕迹已标记，等待后续复核。")).toBeInTheDocument();
  });

  it("shows seeded lost relic argument effects in Kael's crew detail", () => {
    const { eventState } = createLostRelicArgumentState();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 600,
        crew: [
          {
            id: "kael",
            hasIncoming: true,
            personalityTags: ["relic_sensitive"],
          },
        ],
        tiles: initialTiles,
        map: createInitialMapState(),
        logs: initialLogs,
        resources: initialResources,
        active_events: eventState.active_events,
        active_calls: eventState.active_calls,
      })),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    fireEvent.click(within(runtimeCallPanel as HTMLElement).getByRole("button", { name: "接通" }));
    fireEvent.click(screen.getByRole("button", { name: "信任 Kael，让他继续追查线索。" }));
    fireEvent.click(lastElement(screen.getAllByRole("button", { name: "结束通话" })));

    const kaelCard = screen
      .getAllByText("Kael，轨道城邦祭司学徒")
      .map((node) => node.closest("article"))
      .find((article) => article && within(article as HTMLElement).queryByRole("button", { name: "查看档案" }));
    expect(kaelCard).not.toBeNull();
    fireEvent.click(within(kaelCard as HTMLElement).getByRole("button", { name: "查看档案" }));

    expect(screen.getByText("relic_burdened")).toBeInTheDocument();
    expect(screen.getAllByText("Kael 保留了遗物线索，他的长期态度发生变化。").length).toBeGreaterThan(0);
  });

  it("completes a seeded volcanic runtime objective when its crew action finishes", () => {
    vi.useFakeTimers();
    const { eventId, objectiveId, actionId, eventState } = createVolcanicObjectiveState();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "garry",
            currentTile: "4-3",
            location: "火山灰沙漠",
            coord: "(4,3)",
            status: "等待火山灰复核结果。",
            statusTone: "neutral",
            hasIncoming: false,
            activeAction: null,
          },
          {
            id: "lin_xia",
            currentTile: "4-3",
            location: "火山灰沙漠",
            coord: "(4,3)",
            status: "复核火山灰轨迹中。",
            statusTone: "accent",
            hasIncoming: false,
            activeAction: {
              id: actionId,
              actionType: "survey",
              status: "inProgress",
              startTime: 0,
              durationSeconds: 1,
              finishTime: 1,
              targetTile: "4-3",
            },
          },
        ],
        tiles: volcanicTiles(),
        logs: initialLogs,
        resources: initialResources,
        active_events: eventState.active_events,
        objectives: eventState.objectives,
      })),
    );

    render(<App />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(saved.objectives[objectiveId].status).toBe("completed");
    expect(saved.active_events[eventId].status).toBe("resolved");
    expect(saved.active_events[eventId].current_node_id).toBe("ash_mapped_end");
    expect(saved.event_logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ summary: "第二名队员完成了火山灰痕迹测绘。" }),
      ]),
    );
  });

  it("bridges event-created move crew actions into active actions", () => {
    vi.useFakeTimers();
    const action = eventCrewAction({
      id: "event-move",
      crew_id: "mike",
      type: "move",
      from_tile_id: "1-1",
      target_tile_id: "1-2",
      path_tile_ids: ["1-2"],
      started_at: 10,
      duration_seconds: 30,
      action_params: { reason: "event order" },
    });
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 10,
        crew: [{ id: "mike", currentTile: "1-1", activeAction: null, hasIncoming: false }],
        tiles: initialTiles,
        logs: initialLogs,
        resources: initialResources,
        crew_actions: { [action.id]: action },
      })),
    );

    render(<App />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const mike = saved.crew.find((member: { id: string }) => member.id === "mike");
    expect(mike.activeAction).toMatchObject({
      id: "event-move",
      actionType: "move",
      status: "inProgress",
      startTime: 10,
      finishTime: 40,
      targetTile: "1-2",
    });
  });

  it("bridges event_waiting crew actions while keeping communication available", () => {
    vi.useFakeTimers();
    const action = eventCrewAction({
      id: "event-wait",
      crew_id: "amy",
      type: "event_waiting",
      target_tile_id: "2-3",
      started_at: 20,
      duration_seconds: 180,
      action_params: { reason: "beast_tracks" },
    });
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 20,
        crew: [{ id: "amy", currentTile: "2-3", activeAction: null, hasIncoming: false, unavailable: false, canCommunicate: true }],
        tiles: initialTiles,
        logs: initialLogs,
        resources: initialResources,
        crew_actions: { [action.id]: action },
      })),
    );

    render(<App />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const amy = saved.crew.find((member: { id: string }) => member.id === "amy");
    expect(amy.activeAction).toMatchObject({ id: "event-wait", actionType: "event" });
    expect(amy.unavailable).toBe(true);
    expect(amy.canCommunicate).toBe(true);
  });

  it("replaces existing active actions with event actions and logs the interruption", () => {
    vi.useFakeTimers();
    const action = eventCrewAction({
      id: "event-wait",
      crew_id: "amy",
      type: "event_waiting",
      target_tile_id: "2-3",
      started_at: 20,
      duration_seconds: 180,
    });
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 20,
        crew: [
          {
            id: "amy",
            currentTile: "2-3",
            hasIncoming: false,
            activeAction: {
              id: "amy-survey",
              actionType: "survey",
              status: "inProgress",
              startTime: 0,
              durationSeconds: 180,
              finishTime: 180,
              targetTile: "2-3",
            },
          },
        ],
        tiles: initialTiles,
        logs: initialLogs,
        resources: initialResources,
        crew_actions: { [action.id]: action },
      })),
    );

    render(<App />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const amy = saved.crew.find((member: { id: string }) => member.id === "amy");
    expect(amy.activeAction.id).toBe("event-wait");
    expect(saved.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tone: "accent",
          text: expect.stringContaining("被中断"),
        }),
      ]),
    );
  });

  it("does not bridge crew actions from non-event sources", () => {
    vi.useFakeTimers();
    const action = eventCrewAction({
      id: "player-action",
      crew_id: "mike",
      source: "player_command",
      type: "move",
      target_tile_id: "1-2",
      started_at: 10,
      duration_seconds: 30,
    });
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 10,
        crew: [{ id: "mike", currentTile: "1-1", activeAction: null, hasIncoming: false }],
        tiles: initialTiles,
        logs: initialLogs,
        resources: initialResources,
        crew_actions: { [action.id]: action },
      })),
    );

    render(<App />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const mike = saved.crew.find((member: { id: string }) => member.id === "mike");
    expect(mike.activeAction).toBeNull();
  });

  it("ignores legacy emergencyEvent fields when opening a call", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "lin_xia",
            status: "洞穴低光区域，等待指令。",
            statusTone: "danger",
            hasIncoming: true,
            emergencyEvent: createSavedEmergencyEvent("lin_xia", "emergency_mountain_cave_darkness"),
          },
        ],
        tiles: initialTiles,
        logs: initialLogs,
        resources: initialResources,
      })),
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: /通讯台/ }));
    const linCard = screen.getByText("林夏，前轨道麻醉医师").closest("article");
    expect(linCard).not.toBeNull();
    await user.click(within(linCard as HTMLElement).getByRole("button", { name: "通话" }));

    expect(screen.getByRole("heading", { name: "通话页面：林夏 状态确认" })).toBeInTheDocument();
    expect(screen.queryByText(/使用照明道具继续确认洞内路径/)).not.toBeInTheDocument();
    expect(screen.queryByText(/紧急倒计时/)).not.toBeInTheDocument();
  });

  it("does not fall back to legacy emergency choices for an expired runtime call", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 200,
        crew: [
          {
            id: "amy",
            currentTile: "2-3",
            location: "森林 / 山",
            coord: "(2,3)",
            status: "森林紧急频道等待接入。",
            statusTone: "danger",
            hasIncoming: true,
            emergencyEvent: createSavedEmergencyEvent("amy", "emergency_forest_beast"),
          },
        ],
        active_calls: {
          "expired-call": {
            id: "expired-call",
            event_id: "expired-event",
            event_node_id: "beast_first_call",
            call_template_id: "forest_beast_encounter.call.first",
            crew_id: "amy",
            status: "expired",
            created_at: 0,
            connected_at: null,
            ended_at: null,
            expires_at: 90,
            render_context_snapshot: {},
            rendered_lines: [
              {
                template_variant_id: "beast_first_opening_default",
              text: "Amy 压低声音：有个大型生物正在 2-3 周围绕行。",
                speaker_crew_id: "amy",
              },
            ],
            available_options: [
              {
                option_id: "fall_back",
                template_variant_id: "beast_fallback_default",
              text: "立刻后撤。",
                is_default: false,
              },
            ],
            selected_option_id: null,
            blocking_claim_id: null,
          },
        },
        tiles: initialTiles,
        logs: initialLogs,
        resources: initialResources,
      })),
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: /通讯台/ }));
    const amyCard = screen.getByText("Amy，千金大小姐").closest("article");
    expect(amyCard).not.toBeNull();
    await user.click(within(amyCard as HTMLElement).getByRole("button", { name: "通话" }));

    expect(screen.queryByRole("button", { name: "立刻撤离" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "立刻后撤。" })).not.toBeInTheDocument();
    expect(screen.queryByText(/紧急倒计时/)).not.toBeInTheDocument();
  });

  it("handles an incoming Amy call and settles a decision", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /通讯台/ }));
    expect(screen.getByRole("heading", { name: "通讯台" })).toBeInTheDocument();

    const amyCard = screen.getByText("Amy，千金大小姐").closest("article");
    expect(amyCard).not.toBeNull();
    await user.click(within(amyCard as HTMLElement).getByRole("button", { name: "通话" }));
    expect(screen.getByRole("heading", { name: "通话页面：Amy 状态确认" })).toBeInTheDocument();
    expect(screen.queryByText("队员压低声音报告：附近有大型野兽正在靠近。")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "返回通讯台" }).length).toBeGreaterThan(0);
  });

  it("shows coarse terrain, weather, and crew status for a crew-occupied frontier tile without revealing objects", () => {
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "amy",
            currentTile: "2-3",
            location: "黑松林缘",
            coord: "(-1,2)",
            status: "等待指令。",
            statusTone: "neutral",
            hasIncoming: false,
            canCommunicate: true,
            unavailable: false,
            activeAction: null,
          },
        ],
        tiles: initialTiles,
        map: createMapWithDiscoveredTiles("3-3"),
        logs: initialLogs,
        resources: initialResources,
      })),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /卫星雷达/ }));

    const grid = screen.getByLabelText(/雷达可见矩形/);
    const amyTile = within(grid).getByRole("button", { name: /\(-1,2\)/ });
    expect(within(amyTile).getByText("未探索信号")).toBeInTheDocument();
    expect(within(amyTile).getByText("地形：森林 / 山")).toBeInTheDocument();
    expect(within(amyTile).getByText("天气：薄雾")).toBeInTheDocument();
    expect(within(amyTile).getByText("Amy：等待指令。")).toBeInTheDocument();
    expect(within(amyTile).queryByText("黑松木材带")).not.toBeInTheDocument();

    fireEvent.click(amyTile);
    expect(screen.getByText("队员回传")).toBeInTheDocument();
    expect(screen.getByText("地形")).toBeInTheDocument();
    expect(screen.getAllByText("森林 / 山").length).toBeGreaterThan(0);
    expect(screen.getByText("天气")).toBeInTheDocument();
    expect(screen.getAllByText("薄雾").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Amy：等待指令。").length).toBeGreaterThan(0);
    expect(screen.queryByText("黑松木材带")).not.toBeInTheDocument();

    const saved = readSavedGameState();
    expect(saved.map.discoveredTileIds).not.toContain("2-3");
    expect(saved.map.tilesById["2-3"].discovered).toBe(false);
  });

  it("renders grouped base and revealed object actions for an idle crew member", () => {
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

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));

    expect(screen.getByText("基础行动")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "调查当前区域" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移动到指定区域" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "原地待命" })).toBeInTheDocument();
    expect(screen.getByText("铁矿床")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "调查 铁矿床" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "采集 铁矿床" })).toBeInTheDocument();
  });

  it("renders only busy-available call actions for a busy crew member", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));

    expect(screen.getByText("基础行动")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "原地待命" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止当前行动" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "调查当前区域" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "移动到指定区域" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "调查 铁矿床" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "采集 铁矿床" })).not.toBeInTheDocument();
  });

  it("selects a move target from the map and confirms movement in the call", async () => {
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
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));

    expect(screen.getByRole("heading", { name: /通话页面：Garry/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "移动到指定区域" }));
    expect(screen.getByText("请在地图中标记候选目的地。移动指令仍需回到通话中确认。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /地图二级菜单/ }));
    expect(screen.getByRole("heading", { name: "卫星雷达地图" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\(-1,0\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "标记为目的地，返回通话确认" }));

    expect(screen.getByText("移动确认")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /确认请求 Garry 前往 未探索信号（-1,0）/ }));

    expect(screen.getByText("移动请求已确认。队员开始按路线逐格推进，抵达后会原地待命。")).toBeInTheDocument();
    expect(savedCrew(JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}"), "garry").activeAction).toMatchObject({
      actionType: "move",
      status: "inProgress",
    });

    act(() => {
      vi.advanceTimersByTime(150_000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(saved.map.discoveredTileIds).toContain("4-3");

    const endButtons = screen.getAllByRole("button", { name: "结束通话" });
    fireEvent.click(endButtons[endButtons.length - 1]);
    expect(screen.getByRole("heading", { name: "通讯台" })).toBeInTheDocument();
    expect(screen.getByText("位于 (-1,0)，待命中。")).toBeInTheDocument();
  });

  it("advances an incomplete saved move action one route step at a time instead of jumping to the target", () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "mike",
            currentTile: "2-1",
            location: "浅水裂湖",
            coord: "(-3,2)",
            status: "正在前往目标地点，行进中。",
            statusTone: "muted",
            hasIncoming: false,
            canCommunicate: true,
            unavailable: false,
            activeAction: {
              id: "mike-move-4-5",
              actionType: "move",
              status: "inProgress",
              startTime: 0,
              durationSeconds: 360,
              finishTime: 360,
              fromTile: "2-1",
              targetTile: "4-5",
              route: ["4-5"],
              routeStepIndex: 0,
              stepStartedAt: 0,
              stepFinishTime: 360,
              totalDurationSeconds: 360,
            },
          },
        ],
        tiles: initialTiles,
        map: createMapWithDiscoveredTiles("2-1"),
        logs: initialLogs,
        resources: initialResources,
      })),
    );

    render(<App />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const saved = readSavedGameState();
    const mike = savedCrew(saved, "mike");
    expect(mike.currentTile).toBe("2-2");
    expect(mike.activeAction).toMatchObject({
      targetTile: "4-5",
      routeStepIndex: 1,
    });
    expect(saved.map.discoveredTileIds).toContain("2-2");
    expect(saved.map.tilesById["2-2"]).toMatchObject({
      discovered: true,
    });
    expect(saved.map.tilesById["2-2"].investigated).not.toBe(true);
    expect(saved.map.discoveredTileIds).not.toContain("4-5");

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    const afterLeaving = readSavedGameState();
    const movedMike = savedCrew(afterLeaving, "mike");
    expect(movedMike.currentTile).toBe("2-3");
    expect(afterLeaving.map.tilesById["2-2"].crew ?? []).not.toContain("mike");
    expect(afterLeaving.map.discoveredTileIds).toContain("2-2");
    expect(afterLeaving.map.tilesById["2-2"]).toMatchObject({
      discovered: true,
    });
    expect(afterLeaving.map.tilesById["2-2"].investigated).not.toBe(true);
    expect(afterLeaving.map.discoveredTileIds).not.toContain("4-5");
  });

  it("shows crew locations by area and player coordinates without resource names", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    expect(within(garryCard as HTMLElement).getByText("位置：丘陵矿带 (-1,1)")).toBeInTheDocument();
    expect(within(garryCard as HTMLElement).queryByText("iron_ore")).not.toBeInTheDocument();

    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "查看档案" }));
    expect(screen.getAllByText("丘陵矿带 (-1,1)").length).toBeGreaterThan(0);
    expect(screen.queryByText(/row|col/)).not.toBeInTheDocument();
  });

  it("lets the call page select frontier targets without revealing unknown details", () => {
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
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));
    fireEvent.click(screen.getByRole("button", { name: "移动到指定区域" }));

    const targetList = screen.getByLabelText("移动目标列表");
    expect(within(targetList).getByRole("button", { name: /坠毁区域 \(0,0\).*地形：平原/ })).toBeInTheDocument();
    const frontierTarget = within(targetList).getByRole("button", { name: /未探索信号（-1,0）/ });
    expect(frontierTarget).toBeEnabled();
    expect(screen.queryByText("坠毁西缘")).not.toBeInTheDocument();
    expect(screen.queryByText("沙漠")).not.toBeInTheDocument();
    expect(screen.queryByText("阴天")).not.toBeInTheDocument();

    fireEvent.click(frontierTarget);

    expect(screen.getByText(/已标记候选目的地 未探索信号（-1,0）/)).toBeInTheDocument();
    expect(screen.getAllByText("未探索信号（-1,0）").length).toBeGreaterThan(0);
    expect(screen.queryByText("坠毁西缘")).not.toBeInTheDocument();
    expect(screen.queryByText("沙漠")).not.toBeInTheDocument();
  });

  it("renders the map as a dynamic visible matrix without fixed grid copy", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /卫星雷达/ }));

    expect(screen.getByRole("heading", { name: "卫星雷达地图" })).toBeInTheDocument();
    expect(screen.queryByText(/4x4|4 x 4/)).not.toBeInTheDocument();

    const grid = screen.getByLabelText(/雷达可见矩形/);
    expect(grid).toHaveStyle({ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" });
    expect(screen.getAllByRole("button", { name: /未探索信号/ })).toHaveLength(8);
    expect(screen.getByRole("button", { name: /坠毁区域/ })).toHaveTextContent("地形：平原");
    expect(screen.getByRole("button", { name: /坠毁区域/ })).toHaveTextContent("天气：阴天");
    expect(screen.getByRole("button", { name: /坠毁区域/ })).toHaveTextContent("对象：坠毁残骸");
    expect(screen.queryByText("坠毁西缘")).not.toBeInTheDocument();
  });

  it("keeps frontier and unknown-hole map cells redacted", () => {
    const map = createInitialMapState();
    map.discoveredTileIds = ["4-4", "4-8"];
    map.tilesById["4-4"] = { ...map.tilesById["4-4"], discovered: true, investigated: true };
    map.tilesById["4-8"] = { ...map.tilesById["4-8"], discovered: true, investigated: true };
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        saveVersion: GAME_SAVE_VERSION,
        crew: [],
        tiles: initialTiles,
        map,
        logs: initialLogs,
        resources: initialResources,
      })),
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /卫星雷达/ }));

    const grid = screen.getByLabelText(/雷达可见矩形/);
    expect(grid).toHaveStyle({ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" });
    expect(screen.queryByText("东侧砾原")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /未探索信号/ }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /\(2,0\).*未探索信号/ }));
    const detailPanel = screen.getByRole("heading", { name: "坐标详情：(2,0)" }).closest("section");
    expect(detailPanel).not.toBeNull();
    expect(within(detailPanel as HTMLElement).getByText("信号未确认")).toBeInTheDocument();
    expect(within(detailPanel as HTMLElement).getByText("需通过通讯台联系队员前往或调查后确认详情")).toBeInTheDocument();
    expect(screen.queryByText("强风")).not.toBeInTheDocument();
  });

  it("opens a crew profile with attributes, tags, expertise, and diary entries", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const mikeCard = screen.getByText("Mike，特战干员").closest("article");
    expect(mikeCard).not.toBeNull();
    fireEvent.click(within(mikeCard as HTMLElement).getByRole("button", { name: "查看档案" }));

    expect(screen.getByRole("heading", { name: "Mike / 队员档案" })).toBeInTheDocument();
    expect(screen.getByText("5 维轻量属性")).toBeInTheDocument();
    expect(screen.getByText("嘴硬心软")).toBeInTheDocument();
    expect(screen.getByText("拾荒者")).toBeInTheDocument();
    expect(screen.getByText(/信号弹 x2/)).toBeInTheDocument();
    expect(screen.getByText(/湖的位置不对/)).toBeInTheDocument();
  });

  it("opens a read-only crew inventory modal with item details", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const mikeCard = screen.getByText("Mike，特战干员").closest("article");
    expect(mikeCard).not.toBeNull();
    fireEvent.click(within(mikeCard as HTMLElement).getByRole("button", { name: "查看背包" }));

    expect(screen.getByRole("heading", { name: "Mike / 背包" })).toBeInTheDocument();
    expect(screen.getByText("信号弹")).toBeInTheDocument();
    expect(screen.getByText("x2")).toBeInTheDocument();
    expect(screen.getAllByText("消耗品").length).toBeGreaterThan(0);
    expect(screen.getByText("信号 / 应急")).toBeInTheDocument();
    expect(screen.getByText("可在失联或救援相关事件中提供定位帮助。")).toBeInTheDocument();
    expect(screen.getAllByText("可用于响应").length).toBeGreaterThan(0);
    expect(screen.getAllByText("使用后消耗").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "使用" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "转移" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "丢弃" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "拆分" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "交易" })).not.toBeInTheDocument();
  });

  it("keeps player call entry as the primary action while inventory remains available", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const amyCard = screen.getByText("Amy，千金大小姐").closest("article");
    expect(amyCard).not.toBeNull();

    expect(within(amyCard as HTMLElement).getByRole("button", { name: "通话" })).toHaveClass("primary-button");
    expect(within(amyCard as HTMLElement).getByRole("button", { name: "查看背包" })).toBeInTheDocument();
  });

  it("shows an empty inventory message in the crew inventory modal", () => {
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        saveVersion: GAME_SAVE_VERSION,
        crew: [{ id: "mike", inventory: [] }],
        tiles: initialTiles,
        map: createInitialMapState(),
        logs: initialLogs,
        resources: initialResources,
      })),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const mikeCard = screen.getByText("Mike，特战干员").closest("article");
    expect(mikeCard).not.toBeNull();
    fireEvent.click(within(mikeCard as HTMLElement).getByRole("button", { name: "查看背包" }));

    expect(screen.getByRole("heading", { name: "Mike / 背包" })).toBeInTheDocument();
    expect(screen.getByText("未记录携带物。")).toBeInTheDocument();
  });

  it("rejects legacy saves and starts from the new event save schema", () => {
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify({
        elapsedGameSeconds: 12,
        saveVersion: GAME_SAVE_VERSION,
        crew: [{ id: "mike", bag: ["legacy item"] }],
        tiles: initialTiles,
        map: createInitialMapState(),
        logs: initialLogs,
        resources: { ...initialResources, iron: 7, wood: 3, food: 2, water: 4 },
      }),
    );

    render(<App />);

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(saved.schema_version).toBe(GAME_SAVE_SCHEMA_VERSION);
    expect(saved.elapsedGameSeconds).toBe(0);
    expect(saved.active_events).toEqual({});
    expect(saved.active_calls).toEqual({});
    expect(saved.baseInventory).toEqual([{ itemId: "iron_ore", quantity: 1240 }]);
    expect(saved.resources.food).toBe(0);
    expect(saved.resources.water).toBe(0);
    expect(saved.crew.find((member: { id: string }) => member.id === "mike").inventory).toEqual([
      { itemId: "folding_rifle", quantity: 1 },
      { itemId: "signal_flare", quantity: 2 },
      { itemId: "old_compass", quantity: 1 },
      { itemId: "ration", quantity: 1 },
    ]);
    expect(JSON.stringify(saved)).not.toContain("bag");
    expect(JSON.stringify(saved)).not.toContain("emergencyEvent");
  });

  it("uses the debug toolbox to accelerate game time", () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "[DEBUG]" }));
    fireEvent.click(screen.getByRole("button", { name: "4x" }));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("第 1 日 00 小时 00 分钟 04 秒")).toBeInTheDocument();
  });

  it("requires confirmation before resetting the save from debug toolbox", () => {
    vi.useFakeTimers();
    render(<App />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("第 1 日 00 小时 00 分钟 02 秒")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "[DEBUG]" }));
    fireEvent.click(screen.getByRole("button", { name: "重置存档" }));
    expect(screen.getByText("确定要重置吗？")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));
    expect(screen.getByText("第 1 日 00 小时 00 分钟 00 秒")).toBeInTheDocument();
  });
});

function createSavedEmergencyEvent(crewId: string, eventId: string) {
  return {
    instanceId: `${crewId}-${eventId}-test`,
    eventId,
    createdAt: 0,
    callReceivedTime: 0,
    dangerStage: 0,
    nextEscalationTime: 30,
    deadlineTime: 120,
    settled: false,
  };
}

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

function startAmyBeastEmergencyFromStandby() {
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
  fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
  const amyCard = screen.getByText("Amy，千金大小姐").closest("article");
  expect(amyCard).not.toBeNull();
  fireEvent.click(within(amyCard as HTMLElement).getByRole("button", { name: "通话" }));
  fireEvent.click(screen.getByRole("button", { name: "原地待命" }));
}

function findTileWithObjectTag(tag: string, filters: { visibility?: string } = {}) {
  const tile = defaultMapConfig.tiles.find((item) =>
    item.objects.some((object) => object.tags?.includes(tag) && (!filters.visibility || object.visibility === filters.visibility)),
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

function createLostRelicArgumentState() {
  const eventId = "lost_relic_argument:600";
  const callId = `${eventId}:relic_argument_call:call`;

  return {
    eventId,
    callId,
    eventState: {
      active_events: {
        [eventId]: {
          id: eventId,
          event_definition_id: "lost_relic_argument",
          event_definition_version: 1,
          status: "waiting_call",
          current_node_id: "relic_argument_call",
          primary_crew_id: "kael",
          related_crew_ids: [],
          primary_tile_id: "4-2",
          related_tile_ids: [],
          parent_event_id: null,
          child_event_ids: [],
          objective_ids: [],
          active_call_id: callId,
          selected_options: {},
          random_results: {},
          blocking_claim_ids: [],
          created_at: 600,
          updated_at: 600,
          deadline_at: 780,
          next_wakeup_at: null,
          trigger_context_snapshot: {
            trigger_type: "proximity",
            occurred_at: 600,
            source: "tile_system",
            crew_id: "kael",
            tile_id: "4-2",
            action_id: null,
            event_id: eventId,
            event_definition_id: "lost_relic_argument",
            node_id: null,
            call_id: null,
            objective_id: null,
            selected_option_id: null,
            world_flag_key: null,
            proximity: {
              origin_tile_id: "4-2",
              nearby_tile_ids: ["4-1", "4-3"],
              distance: 1,
            },
            payload: {
              relic_id: "lost_relic_alpha",
            },
          },
          history_keys: [],
          result_key: null,
          result_summary: null,
        },
      },
      active_calls: {
        [callId]: {
          id: callId,
          event_id: eventId,
          event_node_id: "relic_argument_call",
          call_template_id: "lost_relic_argument.call.argument",
          crew_id: "kael",
          status: "awaiting_choice",
          created_at: 600,
          connected_at: null,
          ended_at: null,
          expires_at: 780,
          render_context_snapshot: {
            crew_id: "kael",
            crew_display_name: "Kael",
            tile_id: "4-2",
            event_pressure: "urgent",
            personality_tags: ["relic_sensitive"],
          },
          rendered_lines: [
            {
              template_variant_id: "relic_opening_default",
              text: "Kael 拒绝把遗物装袋，除非基地先给出承诺。",
              speaker_crew_id: "kael",
            },
            {
              template_variant_id: "relic_body_default",
              text: "他说那东西属于一个再也没能回家的人。",
              speaker_crew_id: "kael",
            },
          ],
          available_options: [
            {
              option_id: "trust_kael",
              template_variant_id: "relic_trust_default",
              text: "信任 Kael，让他继续追查线索。",
              is_default: true,
            },
            {
              option_id: "secure_relic",
              template_variant_id: "relic_secure_default",
              text: "按基地规程封存遗物。",
              is_default: false,
            },
          ],
          selected_option_id: null,
          blocking_claim_id: null,
        },
      },
    },
  };
}

function createVolcanicObjectiveState() {
  const eventId = "volcanic_ash_trace:480";
  const objectiveId = `${eventId}:ash_cross_crew_objective:objective`;
  const actionId = "lin-xia-ash-survey";

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
          assigned_crew_id: "lin_xia",
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
          resources: ["火山灰"],
          crew: ["garry", "lin_xia"],
          danger: "灰线不稳定",
          status: "复核中",
        }
      : tile,
  );
}
