import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { crewDefinitions, eventDefinitionById, itemDefinitions } from "./content/contentData";
import { initialLogs, initialTiles, resources as initialResources } from "./data/gameData";
import { createEmptyEventRuntimeState } from "./events/types";
import { GAME_SAVE_KEY, GAME_SAVE_SCHEMA_VERSION } from "./timeSystem";

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

  it("advances game time while the app is running", () => {
    vi.useFakeTimers();

    render(<App />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("第 1 日 00 小时 00 分钟 01 秒")).toBeInTheDocument();
  });

  it("settles Garry mining into Garry's inventory from the time system", () => {
    vi.useFakeTimers();

    render(<App />);

    act(() => {
      vi.advanceTimersByTime(300_000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const garry = saved.crew.find((member: { id: string }) => member.id === "garry");
    expect(garry.inventory).toContainEqual({ itemId: "iron_ore", quantity: 9 });
    expect(saved.resources.iron).toBe(1240);
    expect(screen.getByText(/Garry 完成了 1 轮铁矿采集/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "查看背包" }));

    expect(screen.getByRole("heading", { name: "Garry / 背包" })).toBeInTheDocument();
    expect(screen.getByText("铁矿石")).toBeInTheDocument();
    expect(screen.getByText("x9")).toBeInTheDocument();
  });

  it("settles Garry survey expertise rewards into Garry's inventory", () => {
    vi.useFakeTimers();

    render(<App />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));
    fireEvent.click(screen.getByRole("button", { name: /开展调查/ }));

    act(() => {
      vi.advanceTimersByTime(180_000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const garry = saved.crew.find((member: { id: string }) => member.id === "garry");
    expect(garry.inventory).toContainEqual({ itemId: "iron_ore", quantity: 5 });
    expect(saved.resources.iron).toBe(1240);
    expect(saved.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Garry 敲了三下岩壁，找出一条地图没有标注的铁矿细脉。" }),
      ]),
    );
  });

  it("keeps the MVP item and event content slice wired through content data", () => {
    const lightItem = itemDefinitions.find((item) => item.tags.includes("light") && item.usableInResponse);
    expect(lightItem).toBeDefined();
    expect(
      crewDefinitions.some((member) => member.inventory.some((entry) => entry.itemId === lightItem?.itemId && entry.quantity > 0)),
    ).toBe(true);

    expect(itemDefinitions.some((item) => item.tags.includes("clue"))).toBe(true);

    expect(eventDefinitionById.get("survey_forest_scattered_wood")?.effects).toEqual(
      expect.arrayContaining([{ type: "addItem", itemId: "wood", target: "crewInventory", amount: 2 }]),
    );
    expect(eventDefinitionById.get("survey_hill_loose_ore")?.effects).toEqual(
      expect.arrayContaining([{ type: "addItem", itemId: "iron_ore", target: "crewInventory", amount: 1 }]),
    );

    const lightChoice = eventDefinitionById.get("emergency_mountain_cave_darkness")?.choices.find((choice) => choice.choiceId === "use_light");
    expect(lightChoice?.usesItemTag).toBe("light");
    expect(lightChoice?.effects).toEqual(expect.arrayContaining([{ type: "useItemByTag", itemTag: "light" }]));

    const signalChoice = eventDefinitionById.get("emergency_signal_assist_comms")?.choices.find((choice) => choice.choiceId === "boost_with_signal");
    expect(signalChoice?.usesItemTag).toBe("signal");
    expect(signalChoice?.effects).toEqual(expect.arrayContaining([{ type: "useItemByTag", itemTag: "signal" }]));
    expect(signalChoice?.effects?.some((effect) => effect.type === "addLog" && /通讯|定位|额外信息/.test(effect.text ?? ""))).toBe(true);
  });

  it("creates a runtime event when a crew member completes a sample trigger action", () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "garry",
            currentTile: "2-3",
            location: "木材",
            coord: "(2,3)",
            status: "森林边缘待命。",
            statusTone: "neutral",
            hasIncoming: false,
            activeAction: undefined,
          },
        ],
        tiles: initialTiles,
        logs: initialLogs,
        resources: initialResources,
      })),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));
    fireEvent.click(screen.getByRole("button", { name: /开展调查/ }));

    act(() => {
      vi.advanceTimersByTime(180_000);
    });

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(Object.values(saved.active_events).map((event) => (event as { event_definition_id: string }).event_definition_id)).toContain(
      "forest_trace_small_camp",
    );
    expect(Object.keys(saved.active_calls)).toContain("forest_trace_small_camp:180:trace_report:call");
  });

  it("opens an active runtime call from the station and submits its stable option_id", () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "garry",
            currentTile: "2-3",
            location: "木材",
            coord: "(2,3)",
            status: "森林边缘待命。",
            statusTone: "neutral",
            hasIncoming: false,
            activeAction: undefined,
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
    fireEvent.click(screen.getByRole("button", { name: /开展调查/ }));

    act(() => {
      vi.advanceTimersByTime(180_000);
    });

    const endButtons = screen.getAllByRole("button", { name: "结束通话" });
    fireEvent.click(endButtons[endButtons.length - 1]);
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    fireEvent.click(within(runtimeCallPanel as HTMLElement).getByRole("button", { name: "接通" }));

    expect(screen.getByText("Garry reports a small camp trace near 2-3.")).toBeInTheDocument();
    expect(screen.getByText("No movement, just old ash and a tied branch.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mark the camp trace." }));

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const call = saved.active_calls["forest_trace_small_camp:180:trace_report:call"];
    const event = saved.active_events["forest_trace_small_camp:180"];

    expect(call.status).toBe("ended");
    expect(call.selected_option_id).toBe("mark_camp");
    expect(event.status).toBe("resolved");
    expect(event.current_node_id).toBe("trace_resolved");
    expect(event.selected_options).toEqual({ trace_report: "mark_camp" });
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
    await user.click(within(linCard as HTMLElement).getByRole("button", { name: "接通" }));

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
                text: "Amy whispers: something large is circling 2-3.",
                speaker_crew_id: "amy",
              },
            ],
            available_options: [
              {
                option_id: "fall_back",
                template_variant_id: "beast_fallback_default",
                text: "Fall back now.",
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
    await user.click(within(amyCard as HTMLElement).getByRole("button", { name: "接通" }));

    expect(screen.queryByRole("button", { name: "立刻撤离" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fall back now." })).not.toBeInTheDocument();
    expect(screen.queryByText(/紧急倒计时/)).not.toBeInTheDocument();
  });

  it("handles an incoming Amy call and settles a decision", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /通讯台/ }));
    expect(screen.getByRole("heading", { name: "通讯台" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "接通" }));
    expect(screen.getByRole("heading", { name: "通话页面：Amy 状态确认" })).toBeInTheDocument();
    expect(screen.queryByText("队员压低声音报告：附近有大型野兽正在靠近。")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "返回通讯台" }).length).toBeGreaterThan(0);
  });

  it("selects a move target from the map and confirms movement in the call", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));

    expect(screen.getByRole("heading", { name: "通话页面：Garry 普通状态" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /请求前往/ }));
    expect(screen.getByText("请在地图中标记候选目的地。移动指令仍需回到通话中确认。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /地图二级菜单/ }));
    expect(screen.getByRole("heading", { name: "卫星雷达地图" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\(3,2\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "标记为目的地，返回通话确认" }));

    expect(screen.getByText("移动确认")).toBeInTheDocument();
    expect(screen.getByText(/当前采集，未完成的一轮不会结算/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /确认请求 Garry 前往 \(3,2\)/ }));

    expect(screen.getByText("移动请求已确认。队员开始按路线逐格推进，抵达后会原地待命。")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const endButtons = screen.getAllByRole("button", { name: "结束通话" });
    fireEvent.click(endButtons[endButtons.length - 1]);
    expect(screen.getByRole("heading", { name: "通讯台" })).toBeInTheDocument();
    expect(screen.getByText("位于 (3,2)，待命中。")).toBeInTheDocument();
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

  it("keeps incoming call connect as the primary action while inventory remains available", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const amyCard = screen.getByText("Amy，千金大小姐").closest("article");
    expect(amyCard).not.toBeNull();

    expect(within(amyCard as HTMLElement).getByRole("button", { name: "接通" })).toHaveClass("primary-button");
    expect(within(amyCard as HTMLElement).getByRole("button", { name: "查看背包" })).toBeInTheDocument();
  });

  it("shows an empty inventory message in the crew inventory modal", () => {
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify(createCompatibleSavedGameState({
        elapsedGameSeconds: 0,
        crew: [{ id: "mike", inventory: [] }],
        tiles: initialTiles,
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
        crew: [{ id: "mike", bag: ["legacy item"] }],
        tiles: initialTiles,
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

function createCompatibleSavedGameState(state: Record<string, unknown>) {
  return {
    schema_version: GAME_SAVE_SCHEMA_VERSION,
    created_at_real_time: "2026-04-27T00:00:00.000Z",
    updated_at_real_time: "2026-04-27T00:00:00.000Z",
    ...createEmptyEventRuntimeState(),
    ...state,
  };
}
