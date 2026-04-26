import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { crewDefinitions, eventDefinitionById, itemDefinitions } from "./content/contentData";
import { initialLogs, initialTiles, resources as initialResources } from "./data/gameData";
import { GAME_SAVE_KEY } from "./timeSystem";

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

  it("enables a light response choice when the caller has a usable light item", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify({
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
      }),
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: /通讯台/ }));
    const linCard = screen.getByText("林夏，前轨道麻醉医师").closest("article");
    expect(linCard).not.toBeNull();
    await user.click(within(linCard as HTMLElement).getByRole("button", { name: "接通" }));

    const lightButton = screen.getByRole("button", { name: /使用照明道具继续确认洞内路径/ });
    expect(lightButton).toBeEnabled();
    expect(screen.getByText("照明道具：将使用手持照明灯，不会消耗。")).toBeInTheDocument();

    await user.click(lightButton);
    expect(screen.getByText("照明稳定后，队员确认了洞内可通行路径和湿滑边界。")).toBeInTheDocument();
  });

  it("disables a light response choice when the caller has no usable light item", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "lin_xia",
            status: "洞穴低光区域，等待指令。",
            statusTone: "danger",
            hasIncoming: true,
            inventory: [],
            emergencyEvent: createSavedEmergencyEvent("lin_xia", "emergency_mountain_cave_darkness"),
          },
        ],
        tiles: initialTiles,
        logs: initialLogs,
        resources: initialResources,
      }),
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: /通讯台/ }));
    const linCard = screen.getByText("林夏，前轨道麻醉医师").closest("article");
    expect(linCard).not.toBeNull();
    await user.click(within(linCard as HTMLElement).getByRole("button", { name: "接通" }));

    expect(screen.getByRole("button", { name: /使用照明道具继续确认洞内路径/ })).toBeDisabled();
    expect(screen.getByText("需要可用的照明道具才能安全进入低光区域。")).toBeInTheDocument();
  });

  it("uses a signal response item and records the consumed item in the result logs", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify({
        elapsedGameSeconds: 0,
        crew: [
          {
            id: "kael",
            currentTile: "3-2",
            status: "通讯定位偏移，等待指令。",
            statusTone: "danger",
            hasIncoming: true,
            emergencyEvent: createSavedEmergencyEvent("kael", "emergency_signal_assist_comms"),
          },
        ],
        tiles: initialTiles,
        logs: initialLogs,
        resources: initialResources,
      }),
    );

    render(<App />);

    await user.click(screen.getByRole("button", { name: /通讯台/ }));
    const kaelCard = screen.getByText("Kael，轨道城邦祭司学徒").closest("article");
    expect(kaelCard).not.toBeNull();
    await user.click(within(kaelCard as HTMLElement).getByRole("button", { name: "接通" }));

    const signalButton = screen.getByRole("button", { name: /使用信号道具辅助定位/ });
    expect(signalButton).toBeEnabled();
    expect(screen.getByText("信号道具：将使用信号弹，使用后消耗。")).toBeInTheDocument();

    await user.click(signalButton);

    expect(screen.getByText("信号辅助后通讯噪声下降，定位坐标被重新校准，并回传了一段额外环境信息。")).toBeInTheDocument();
    const saved = JSON.parse(window.localStorage.getItem(GAME_SAVE_KEY) ?? "{}");
    expect(saved.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Kael 使用了信号弹，道具已消耗。" }),
        expect.objectContaining({ text: "信号辅助后通讯噪声下降，定位坐标被重新校准，并回传了一段额外环境信息。" }),
      ]),
    );
  });

  it("handles an incoming Amy call and settles a decision", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /通讯台/ }));
    expect(screen.getByRole("heading", { name: "通讯台" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "接通" }));
    expect(screen.getByRole("heading", { name: "通话页面：Amy 紧急事件" })).toBeInTheDocument();
    expect(screen.getByText("队员压低声音报告：附近有大型野兽正在靠近。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "立刻撤离" }));

    expect(screen.getByText("队员成功撤离。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立刻撤离" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "结束通话" })).toHaveLength(2);
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
      JSON.stringify({
        elapsedGameSeconds: 0,
        crew: [{ id: "mike", inventory: [] }],
        tiles: initialTiles,
        logs: initialLogs,
        resources: initialResources,
      }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const mikeCard = screen.getByText("Mike，特战干员").closest("article");
    expect(mikeCard).not.toBeNull();
    fireEvent.click(within(mikeCard as HTMLElement).getByRole("button", { name: "查看背包" }));

    expect(screen.getByRole("heading", { name: "Mike / 背包" })).toBeInTheDocument();
    expect(screen.getByText("未记录携带物。")).toBeInTheDocument();
  });

  it("normalizes legacy saves to base inventory and structured crew inventory", () => {
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
    expect(saved.baseInventory).toEqual([
      { itemId: "iron_ore", quantity: 7 },
      { itemId: "wood", quantity: 3 },
    ]);
    expect(saved.resources.food).toBe(2);
    expect(saved.resources.water).toBe(4);
    expect(saved.crew.find((member: { id: string }) => member.id === "mike").inventory).toEqual([
      { itemId: "folding_rifle", quantity: 1 },
      { itemId: "signal_flare", quantity: 2 },
      { itemId: "old_compass", quantity: 1 },
      { itemId: "ration", quantity: 1 },
    ]);
    expect(JSON.stringify(saved)).not.toContain("bag");
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
