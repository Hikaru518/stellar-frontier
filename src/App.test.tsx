import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { crewDefinitions, eventProgramDefinitions, itemDefinitions } from "./content/contentData";
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

  it("creates a manual runtime call when default Garry mine survey finishes", () => {
    vi.useFakeTimers();

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
      "garry_mine_anomaly_report",
    );
    expect(saved.active_calls["garry_mine_anomaly_report:180:mine_anomaly_call:call"].status).toBe("awaiting_choice");

    fireEvent.click(lastElement(screen.getAllByRole("button", { name: "结束通话" })));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    fireEvent.click(within(runtimeCallPanel as HTMLElement).getByRole("button", { name: "接通" }));

    expect(screen.getByText("Garry 报告 3-3 的矿床下方传来空洞回声。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "标记异常，交给工程复核。" })).toBeInTheDocument();
  });

  it("keeps items and all five approved event program samples wired through content data", () => {
    const lightItem = itemDefinitions.find((item) => item.tags.includes("light") && item.usableInResponse);
    expect(lightItem).toBeDefined();
    expect(
      crewDefinitions.some((member) => member.inventory.some((entry) => entry.itemId === lightItem?.itemId && entry.quantity > 0)),
    ).toBe(true);

    expect(itemDefinitions.some((item) => item.tags.includes("clue"))).toBe(true);

    expect(eventProgramDefinitions.map((definition) => definition.id)).toEqual(
      expect.arrayContaining([
        "forest_trace_small_camp",
        "forest_beast_encounter",
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

  it("creates the seeded forest trace sample when Garry is placed on a forest tile", () => {
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

  it("opens the seeded forest trace runtime call from the station and submits its stable option_id", () => {
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

    expect(screen.getByText("Garry 报告 2-3 附近有一处小型营地痕迹。")).toBeInTheDocument();
    expect(screen.getByText("没有活动迹象，只有冷灰和一根被绑过的树枝。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "标记这处营地痕迹。" }));

    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    const call = saved.active_calls["forest_trace_small_camp:180:trace_report:call"];
    const event = saved.active_events["forest_trace_small_camp:180"];

    expect(call.status).toBe("ended");
    expect(call.selected_option_id).toBe("mark_camp");
    expect(event.status).toBe("resolved");
    expect(event.current_node_id).toBe("trace_resolved");
    expect(event.selected_options).toEqual({ trace_report: "mark_camp" });
  });

  it("shows the resolved seeded forest camp trace on the map tile", () => {
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

    fireEvent.click(lastElement(screen.getAllByRole("button", { name: "结束通话" })));
    const runtimeCallPanel = screen.getByText("事件通话 · 1 条").closest("section");
    expect(runtimeCallPanel).not.toBeNull();
    fireEvent.click(within(runtimeCallPanel as HTMLElement).getByRole("button", { name: "接通" }));
    fireEvent.click(screen.getByRole("button", { name: "标记这处营地痕迹。" }));
    fireEvent.click(lastElement(screen.getAllByRole("button", { name: "结束通话" })));
    fireEvent.click(screen.getByRole("button", { name: "返回控制中心" }));
    fireEvent.click(screen.getByRole("button", { name: /卫星雷达/ }));
    fireEvent.click(screen.getByRole("button", { name: /\(2,3\)/ }));

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
            activeAction: undefined,
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
    await user.click(within(amyCard as HTMLElement).getByRole("button", { name: "接通" }));

    expect(screen.queryByRole("button", { name: "立刻撤离" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "立刻后撤。" })).not.toBeInTheDocument();
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

function lastElement<T>(items: T[]): T {
  return items[items.length - 1];
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
