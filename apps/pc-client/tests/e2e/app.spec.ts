import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install();
});

const GAME_SAVE_KEY = "stellar-frontier-save-v2";
const GAME_SAVE_VERSION = 2;
const GAME_SAVE_SCHEMA_VERSION = "event-program-model-v1";
const initialResources = {
  energy: 620,
  iron: 1240,
  wood: 0,
  food: 0,
  water: 0,
  baseIntegrity: 71,
  sol: 37,
  power: 62,
  commWindow: "不稳定",
};
const initialLogs = [{ id: 1, time: "19:42", text: "卫星雷达返回 3 个低置信度信号。", tone: "neutral" }];
const initialTiles = [
  tile("2-3", "(2,3)", 2, 3, "森林 / 山", ["木材", "野生动物踪迹"], [], [], ["garry"], "大型野兽接近", "危险"),
  tile("4-3", "(4,3)", 4, 3, "沙漠", [], [], [], [], "未发现即时危险", "待命"),
];

test("PS-001 opens basic normal-call actions for Mike, Amy, and Garry", async ({ page }) => {
  await installSave(page, {
    elapsedGameSeconds: 0,
    crew: [
      idleCrew("mike", "4-4"),
      idleCrew("amy", "2-3", { status: "森林边缘待命。" }),
      idleCrew("garry", "3-3", { status: "矿带待命。" }),
    ],
    map: createMapWithDiscoveredTiles("2-3", "3-3", "4-4"),
    logs: initialLogs,
    resources: initialResources,
  });

  await page.goto("/");
  await page.getByRole("button", { name: /通讯台/ }).click();

  for (const crewLabel of ["Mike，特战干员", "Amy，千金大小姐", "Garry，退休老大爷"]) {
    await startNormalCrewCall(page, crewLabel);
    await expect(page.getByRole("heading", { name: /通话页面：.*状态确认/ })).toBeVisible();
    await expect(page.getByText("基础行动")).toBeVisible();
    await expect(page.getByRole("button", { name: "调查当前区域" })).toBeVisible();
    await expect(page.getByRole("button", { name: "移动到指定区域" })).toBeVisible();
    await expect(page.getByRole("button", { name: "原地待命" })).toBeVisible();
    await page.getByRole("button", { name: "返回通讯台" }).click();
  }
});

test("PS-002 changes Mike's dynamic object actions after investigation", async ({ page }) => {
  await installSave(page, {
    elapsedGameSeconds: 0,
    crew: [idleCrew("mike", "5-3", { status: "林地边缘待命。" })],
    map: createMapWithDiscoveredTiles("5-3"),
    logs: initialLogs,
    resources: initialResources,
    world_history: {
      "event:forest_trace_small_camp:mike:5-3": triggeredEventHistory("forest_trace_small_camp", "mike", "5-3"),
    },
  });

  await page.goto("/");
  await page.getByRole("button", { name: /通讯台/ }).click();
  await startNormalCrewCall(page, "Mike，特战干员");

  await expect(page.getByRole("button", { name: "调查当前区域" })).toBeVisible();
  await expect(page.getByRole("button", { name: "调查 潮湿木材" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "采集 潮湿木材" })).toHaveCount(0);

  await page.getByRole("button", { name: "调查当前区域" }).click();
  await page.clock.runFor(121_000);
  await page.getByRole("button", { name: "结束通话" }).last().click();
  await startNormalCrewCall(page, "Mike，特战干员");

  await expect(page.getByRole("heading", { name: "潮湿木材" })).toBeVisible();
  await expect(page.getByRole("button", { name: "调查 潮湿木材" })).toBeVisible();
  await expect(page.getByRole("button", { name: "采集 潮湿木材" })).toBeVisible();
});

test("PS-003 resolves Mike's crash-site runtime call and reveals the wreckage object", async ({ page }) => {
  await installSave(page, {
    elapsedGameSeconds: 0,
    crew: [idleCrew("mike", "4-4", { status: "残骸附近待命。" })],
    map: createMapWithHiddenObject("4-4", "crash-site-wreckage"),
    logs: initialLogs,
    resources: initialResources,
  });

  await page.goto("/");
  await page.getByRole("button", { name: /通讯台/ }).click();
  await startNormalCrewCall(page, "Mike，特战干员");
  await page.getByRole("button", { name: "调查当前区域" }).click();
  await page.clock.runFor(121_000);
  await page.getByRole("button", { name: "结束通话" }).last().click();

  const runtimeCallPanel = page.getByText("事件通话 · 1 条").locator("xpath=ancestor::section[1]");
  await expect(runtimeCallPanel).toBeVisible();
  await expect(runtimeCallPanel.getByText("Mike 报告 4-4 的残骸内部仍有微弱信号。")).toBeVisible();
  await runtimeCallPanel.getByRole("button", { name: "接通" }).click();

  await expect(page.getByText("信号像是从断裂舱段深处反射出来，无法确认是否还在移动。")).toBeVisible();
  await page.getByRole("button", { name: "标记残骸内部信号。" }).click();

  const saved = await readSave(page);
  expect(saved.map.tilesById["4-4"].revealedObjectIds).toContain("crash-site-wreckage");
  expect(saved.event_logs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ summary: "Mike 已标记坠毁残骸内部的微弱信号。" }),
    ]),
  );
});

test("PS-003 resolves Amy's beast emergency and shows the urgent countdown", async ({ page }) => {
  await installSave(page, {
    elapsedGameSeconds: 0,
    crew: [idleCrew("amy", "2-3", { status: "森林边缘待命。" })],
    map: createForestBeastMap(),
    logs: initialLogs,
    resources: initialResources,
  });

  await page.goto("/");
  await page.getByRole("button", { name: /通讯台/ }).click();
  await startNormalCrewCall(page, "Amy，千金大小姐");
  await page.getByRole("button", { name: "原地待命" }).click();
  await page.getByRole("button", { name: "结束通话" }).last().click();

  const runtimeCallPanel = page.getByText("事件通话 · 1 条").locator("xpath=ancestor::section[1]");
  await expect(runtimeCallPanel).toBeVisible();
  await expect(runtimeCallPanel.getByText("紧急")).toBeVisible();
  await expect(runtimeCallPanel.getByText("剩余 03:00")).toBeVisible();
  await runtimeCallPanel.getByRole("button", { name: "接通" }).click();

  await expect(page.getByText("Amy 压低声音：大型野兽正在 2-3 周围逼近，我需要立刻指令。")).toBeVisible();
  await page.getByRole("button", { name: "撤离到开阔地。" }).click();

  const saved = await readSave(page);
  const event = findSavedRuntimeEvent(saved, "forest_beast_emergency");
  const amy = findSavedCrew(saved, "amy");
  expect(event).toMatchObject({ status: "resolved", current_node_id: "beast_evacuated_end" });
  expect(amy.activeAction).toBeUndefined();
  expect(amy.unavailable).toBe(false);
});

test("PS-003 resolves Garry's mine anomaly call and records the anomaly log", async ({ page }) => {
  await installSave(page, {
    elapsedGameSeconds: 0,
    crew: [idleCrew("garry", "3-3", { status: "矿带待命。" })],
    map: createMapWithDiscoveredTiles("3-3"),
    logs: initialLogs,
    resources: initialResources,
  });

  await page.goto("/");
  await page.getByRole("button", { name: /通讯台/ }).click();
  await startNormalCrewCall(page, "Garry，退休老大爷");
  await page.getByRole("button", { name: "采集 铁矿床" }).click();
  await page.clock.runFor(181_000);
  await page.getByRole("button", { name: "结束通话" }).last().click();

  const runtimeCallPanel = page.getByText("事件通话 · 1 条").locator("xpath=ancestor::section[1]");
  await expect(runtimeCallPanel).toBeVisible();
  await expect(runtimeCallPanel.getByText("Garry 报告 3-3 的矿脉深处传来异常空声。")).toBeVisible();
  await runtimeCallPanel.getByRole("button", { name: "接通" }).click();

  await expect(page.getByText("敲击回波不像实心矿体，更像有一段被掏空的裂腔。")).toBeVisible();
  await page.getByRole("button", { name: "记录矿脉异常，采矿流程保持不变。" }).click();

  const saved = await readSave(page);
  const garry = findSavedCrew(saved, "garry");
  expect(garry.conditions).toContain("noted_mine_anomaly");
  expect(saved.event_logs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ summary: "Garry 记录了铁脊矿带矿脉中的异常空声。" }),
    ]),
  );
});

test("loads the app and opens the incoming Amy channel without legacy emergency choices", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "前沿基地控制中心" })).toBeVisible();
  await page.getByRole("button", { name: /通讯台/ }).click();

  await expect(page.getByRole("heading", { name: "通讯台", exact: true })).toBeVisible();
  const amyCard = page.getByText("Amy，千金大小姐").locator("xpath=ancestor::article[1]");
  await amyCard.getByRole("button", { name: "通话" }).click();

  await expect(page.getByRole("heading", { name: "通话页面：Amy 状态确认" })).toBeVisible();
  await expect(page.getByRole("button", { name: "立刻撤离" })).toHaveCount(0);
  await page.getByRole("button", { name: /地图二级菜单/ }).click();

  await expect(page.getByRole("heading", { name: "卫星雷达地图" })).toBeVisible();
  await page.getByRole("button", { name: "返回当前通话" }).click();
  await expect(page.getByRole("button", { name: "返回通讯台" }).last()).toBeVisible();
});

test("opens the communication station and shows a crew inventory", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /通讯台/ }).click();

  const mikeCard = page.getByText("Mike，特战干员").locator("xpath=ancestor::article[1]");
  await mikeCard.getByRole("button", { name: "查看背包" }).click();

  await expect(page.getByRole("heading", { name: "Mike / 背包" })).toBeVisible();
  await expect(page.getByText("信号弹")).toBeVisible();
  await expect(page.getByText("x2")).toBeVisible();
  await expect(page.getByText("可在失联或救援相关事件中提供定位帮助。")).toBeVisible();
});

test("shows the Yuan realtime link demo with WebRTC as LAN upgrade and WSS fallback", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /通讯台/ }).click();

  const phonePanel = page.getByText("手机私人终端").locator("xpath=ancestor::section[1]");
  await expect(phonePanel).toBeVisible();
  await expect(phonePanel.getByLabel("实时连接演示")).toBeVisible();
  await expect(phonePanel.getByText("局域网升级")).toBeVisible();
  await expect(phonePanel.getByText(/yuan-webrtc-datachannel/)).toBeVisible();
  await expect(phonePanel.getByText("公网兜底")).toBeVisible();
  await expect(phonePanel.getByText(/yuan-wss \/ 同区域/)).toBeVisible();
  await expect(phonePanel.getByText("enableWebRTC=true", { exact: true })).toBeVisible();
});

test("shows only the crash site and frontier window on a new map", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /卫星雷达/ }).click();

  const grid = page.getByLabel(/雷达可见矩形/);
  await expect(grid).toBeVisible();
  await expect(grid.getByRole("button")).toHaveCount(9);
  await expect(grid.getByRole("button", { name: /坠毁区域/ })).toBeVisible();
  await expect(grid.getByRole("button", { name: /未探索信号/ })).toHaveCount(8);
  await expect(page.getByText(/4x4|4 x 4/)).toHaveCount(0);
  await expect(grid.getByText("坠毁西缘")).toHaveCount(0);
  await expect(grid.getByText("北部玄武高地")).toHaveCount(0);
});

test("shows crew-returned coarse info on an occupied frontier tile without revealing objects", async ({ page }) => {
  await installSave(page, {
    elapsedGameSeconds: 0,
    crew: [idleCrew("amy", "2-3", { status: "等待指令。" })],
    map: createMapWithDiscoveredTiles("3-3"),
    logs: initialLogs,
    resources: initialResources,
  });

  await page.goto("/");
  await page.getByRole("button", { name: /卫星雷达/ }).click();

  const grid = page.getByLabel(/雷达可见矩形/);
  const amyTile = grid.getByRole("button", { name: /\(-1,2\)/ });
  await expect(amyTile.getByText("未探索信号")).toBeVisible();
  await expect(amyTile.getByText("地形：森林 / 山")).toBeVisible();
  await expect(amyTile.getByText("天气：薄雾")).toBeVisible();
  await expect(amyTile.getByText("Amy：等待指令。")).toBeVisible();
  await expect(amyTile.getByText("黑松木材带")).toHaveCount(0);

  await amyTile.click();
  const detail = page.locator(".map-detail");
  await expect(detail.getByText("队员回传")).toBeVisible();
  await expect(detail.getByText("森林 / 山")).toBeVisible();
  await expect(detail.getByText("薄雾")).toBeVisible();
  await expect(detail.getByText("Amy：等待指令。")).toBeVisible();
  await expect(page.getByText("黑松木材带")).toHaveCount(0);
});

test("moves a crew member along intermediate route steps instead of jumping to the target", async ({ page }) => {
  await installSave(page, {
    elapsedGameSeconds: 0,
    crew: [
      idleCrew("mike", "2-1", {
        location: "浅水裂湖",
        coord: "(-3,2)",
        status: "正在前往目标地点，行进中。",
        statusTone: "muted",
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
      }),
    ],
    map: createMapWithDiscoveredTiles("2-1"),
    logs: initialLogs,
    resources: initialResources,
  });

  await page.goto("/");
  await page.clock.runFor(60_000);
  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return save.crew?.find((member: { id: string }) => member.id === "mike")?.currentTile === "2-2";
  }, GAME_SAVE_KEY);

  const saved = await readSave(page);
  const mike = findSavedCrew(saved, "mike");
  expect(mike.currentTile).toBe("2-2");
  expect((mike.activeAction as { routeStepIndex?: number }).routeStepIndex).toBe(1);
  expect(saved.map.discoveredTileIds).toContain("2-2");
  expect(saved.map.tilesById["2-2"]).toMatchObject({ discovered: true });
  expect(saved.map.tilesById["2-2"].investigated).not.toBe(true);
  expect(saved.map.discoveredTileIds).not.toContain("4-5");

  await page.getByRole("button", { name: /通讯台/ }).click();
  await expect(page.getByText("位置：浅水裂湖 (-2,2)")).toBeVisible();

  await page.clock.runFor(120_000);
  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return save.crew?.find((member: { id: string }) => member.id === "mike")?.currentTile === "2-3";
  }, GAME_SAVE_KEY);

  const afterLeaving = await readSave(page);
  const movedMike = findSavedCrew(afterLeaving, "mike");
  expect(movedMike.currentTile).toBe("2-3");
  expect(afterLeaving.map.tilesById["2-2"].crew ?? []).not.toContain("mike");
  expect(afterLeaving.map.discoveredTileIds).toContain("2-2");
  expect(afterLeaving.map.tilesById["2-2"]).toMatchObject({ discovered: true });
  expect(afterLeaving.map.tilesById["2-2"].investigated).not.toBe(true);
  expect(afterLeaving.map.discoveredTileIds).not.toContain("4-5");
});

test("moves Garry to a frontier tile and expands the visible map", async ({ page }) => {
  await installSave(page, {
    elapsedGameSeconds: 0,
    crew: [idleCrew("garry", "4-4", { status: "坠毁区域待命。" })],
    map: createMapWithDiscoveredTiles("4-4"),
    logs: initialLogs,
    resources: initialResources,
  });

  await page.goto("/");

  await page.getByRole("button", { name: /通讯台/ }).click();
  const garryCard = page.getByText("Garry，退休老大爷").locator("xpath=ancestor::article[1]");
  await garryCard.getByRole("button", { name: "通话" }).click();
  await page.getByRole("button", { name: "移动到指定区域" }).click();

  await page.getByRole("button", { name: /未探索信号（-1,0）/ }).click();
  await page.getByRole("button", { name: /确认请求 Garry 前往 未探索信号（-1,0）/ }).click();
  await expect(page.getByText("移动请求已确认。队员开始按路线逐格推进，抵达后会原地待命。")).toBeVisible();

  await page.clock.runFor(150_000);
  await expect(page.getByText(/地点：坠毁西缘 \(-1,0\)/)).toBeVisible();

  await page.getByRole("button", { name: /地图二级菜单/ }).click();
  const grid = page.getByLabel(/雷达可见矩形/);
  await expect(grid.getByRole("button", { name: /坠毁西缘/ })).toBeVisible();
  await expect(grid.getByRole("button")).toHaveCount(25);
});

test("creates a manual Garry mine anomaly call after the default survey path", async ({ page }) => {
  await installSave(page, {
    elapsedGameSeconds: 0,
    crew: [idleCrew("garry", "3-3", { status: "矿带待命。" })],
    map: createMapWithDiscoveredTiles("3-3"),
    logs: initialLogs,
    resources: initialResources,
  });

  await page.goto("/");

  await page.getByRole("button", { name: /通讯台/ }).click();
  const garryCard = page.getByText("Garry，退休老大爷").locator("xpath=ancestor::article[1]");
  await garryCard.getByRole("button", { name: "通话" }).click();
  await page.getByRole("button", { name: "采集 铁矿床" }).click();

  await page.clock.runFor(180_000);

  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return Object.values(save.active_events ?? {}).some(
      (event) => (event as { event_definition_id?: string }).event_definition_id === "mine_anomaly_report",
    );
  }, GAME_SAVE_KEY);

  await page.getByRole("button", { name: "结束通话" }).last().click();
  const runtimeCallPanel = page.getByText("事件通话 · 1 条").locator("xpath=ancestor::section[1]");
  await runtimeCallPanel.getByRole("button", { name: "接通" }).click();
  await expect(page.getByText("Garry 报告 3-3 的矿脉深处传来异常空声。")).toBeVisible();
  await expect(page.getByRole("button", { name: "记录矿脉异常，采矿流程保持不变。" })).toBeVisible();
});

test("opens an investigation report from the log with environment fields", async ({ page }) => {
  await installSave(page, {
    elapsedGameSeconds: 120,
    crew: [idleCrew("garry", "3-3", { status: "矿带待命。" })],
    map: {
      ...createMapWithDiscoveredTiles("3-3"),
      investigationReportsById: {
        "report-3-3": createIronRidgeReport(),
      },
    },
    logs: [
      ...initialLogs,
      { id: 2, time: "第 1 日 00 小时 02 分钟 00 秒", text: "Garry 完成一轮调查。", tone: "neutral", reportId: "report-3-3" },
    ],
    resources: initialResources,
  });

  await page.goto("/");

  await page.getByRole("button", { name: "查看报告" }).first().click();
  await expect(page.getByRole("heading", { name: "调查报告" })).toBeVisible();
  await expect(page.getByText("铁脊矿带")).toBeVisible();
  await expect(page.getByText("18 °C")).toBeVisible();
  await expect(page.getByText("32%")).toBeVisible();
  await expect(page.getByText("72 μT")).toBeVisible();
});

test("submits a seeded forest runtime call option through the communication UI", async ({ page }) => {
  const { callId, eventId, eventState } = createForestRuntimeCallState();
  await installSave(page, {
    elapsedGameSeconds: 180,
    crew: [
      {
        id: "garry",
        currentTile: "2-3",
        location: "木材",
        coord: "(2,3)",
        status: "森林边缘待命。",
        statusTone: "neutral",
        hasIncoming: true,
        activeAction: undefined,
      },
    ],
    tiles: initialTiles,
    logs: initialLogs,
    resources: initialResources,
    active_events: eventState.active_events,
    active_calls: eventState.active_calls,
  });

  await page.goto("/");
  await page.getByRole("button", { name: /通讯台/ }).click();

  const runtimeCallPanel = page.getByText("事件通话 · 1 条").locator("xpath=ancestor::section[1]");
  await runtimeCallPanel.getByRole("button", { name: "接通" }).click();
  await expect(page.getByText("Garry 报告 2-3 附近有一处小型营地痕迹。")).toBeVisible();

  await page.getByRole("button", { name: "标记这处营地痕迹。" }).click();

  const saved = await readSave(page);
  expect(saved.active_calls[callId].status).toBe("ended");
  expect(saved.active_calls[callId].selected_option_id).toBe("mark_camp");
  expect(saved.active_events[eventId].status).toBe("resolved");
  expect(saved.active_events[eventId].current_node_id).toBe("trace_resolved");
});

test("completes a seeded assigned objective when its crew action finishes", async ({ page }) => {
  const { eventId, objectiveId, actionId, eventState } = createVolcanicObjectiveState();
  await installSave(page, {
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
  });

  await page.goto("/");
  await expect(page.getByText("1 条事件目标")).toBeVisible();
  await page.waitForFunction(
    ({ key, id }) => JSON.parse(window.localStorage.getItem(key) ?? "{}").objectives?.[id]?.status === "completed",
    { key: GAME_SAVE_KEY, id: objectiveId },
  );

  const saved = await readSave(page);
  expect(saved.objectives[objectiveId].status).toBe("completed");
  expect(saved.active_events[eventId].status).toBe("resolved");
  expect(saved.active_events[eventId].current_node_id).toBe("ash_mapped_end");
  expect(saved.event_logs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ summary: "第二名队员完成了火山灰痕迹测绘。" }),
    ]),
  );
});

async function installSave(page: Page, partial: Record<string, unknown>) {
  const save = {
    saveVersion: GAME_SAVE_VERSION,
    schema_version: GAME_SAVE_SCHEMA_VERSION,
    created_at_real_time: "2026-04-27T00:00:00.000Z",
    updated_at_real_time: "2026-04-27T00:00:00.000Z",
    map: createInitialMapState(),
    ...createEmptyEventRuntimeState(),
    ...partial,
  };

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: GAME_SAVE_KEY, value: save },
  );
}

async function readSave(page: Page) {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), GAME_SAVE_KEY);
}

async function startNormalCrewCall(page: Page, crewLabel: string) {
  const crewCard = page.getByText(crewLabel).locator("xpath=ancestor::article[1]");
  await crewCard.getByRole("button", { name: "通话" }).click();
}

function idleCrew(
  id: string,
  currentTile: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    currentTile,
    status: "待命中。",
    statusTone: "neutral",
    hasIncoming: false,
    canCommunicate: true,
    unavailable: false,
    activeAction: null,
    ...overrides,
  };
}

function findSavedCrew(saved: { crew?: Array<Record<string, unknown>> }, crewId: string) {
  const member = saved.crew?.find((item) => item.id === crewId);
  expect(member).toBeDefined();
  return member!;
}

function findSavedRuntimeEvent(saved: { active_events?: Record<string, unknown> }, eventDefinitionId: string) {
  const event = Object.values(saved.active_events ?? {}).find(
    (item) => (item as { event_definition_id?: string }).event_definition_id === eventDefinitionId,
  );
  expect(event).toBeDefined();
  return event as Record<string, unknown>;
}

function triggeredEventHistory(eventDefinitionId: string, crewId: string, tileId: string) {
  const key = `event:${eventDefinitionId}:${crewId}:${tileId}`;
  return {
    key,
    scope: "crew_tile",
    event_definition_id: eventDefinitionId,
    event_id: `${eventDefinitionId}:seeded`,
    crew_id: crewId,
    tile_id: tileId,
    objective_id: null,
    first_triggered_at: 0,
    last_triggered_at: 0,
    trigger_count: 1,
    last_result: "seeded",
    cooldown_until: null,
    value: "seeded",
  };
}

function createIronRidgeReport() {
  return {
    id: "report-3-3",
    tileId: "3-3",
    crewId: "garry",
    createdAtGameSeconds: 120,
    areaName: "铁脊矿带",
    playerCoord: "(-1,1)",
    terrain: "丘陵",
    weather: "晴朗",
    environment: {
      temperatureCelsius: 18,
      humidityPercent: 32,
      magneticFieldMicroTesla: 72,
      radiationLevel: "low",
      toxicityLevel: "none",
      atmosphericPressureKpa: 92,
    },
    revealedObjects: [{ id: "iron-ridge-deposit", name: "铁矿床", kind: "resourceNode" }],
    revealedSpecialStates: [],
  };
}

function createForestRuntimeCallState() {
  const eventId = "forest_trace_small_camp:180";
  const callId = `${eventId}:trace_report:call`;

  return {
    eventId,
    callId,
    eventState: {
      active_events: {
        [eventId]: {
          id: eventId,
          event_definition_id: "forest_trace_small_camp",
          event_definition_version: 1,
          status: "waiting_call",
          current_node_id: "trace_report",
          primary_crew_id: "garry",
          related_crew_ids: [],
          primary_tile_id: "2-3",
          related_tile_ids: [],
          parent_event_id: null,
          child_event_ids: [],
          objective_ids: [],
          active_call_id: callId,
          selected_options: {},
          random_results: {},
          blocking_claim_ids: [],
          created_at: 180,
          updated_at: 180,
          deadline_at: 360,
          next_wakeup_at: null,
          trigger_context_snapshot: {
            trigger_type: "action_complete",
            occurred_at: 180,
            source: "crew_action",
            crew_id: "garry",
            tile_id: "2-3",
            action_id: "garry-survey-2-3",
            event_id: eventId,
            event_definition_id: "forest_trace_small_camp",
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
      active_calls: {
        [callId]: {
          id: callId,
          event_id: eventId,
          event_node_id: "trace_report",
          call_template_id: "forest_trace_small_camp.call.report",
          crew_id: "garry",
          status: "awaiting_choice",
          created_at: 180,
          connected_at: null,
          ended_at: null,
          expires_at: 360,
          render_context_snapshot: {
            crew_id: "garry",
            crew_display_name: "Garry",
            tile_id: "2-3",
            event_pressure: "normal",
          },
          rendered_lines: [
            {
              template_variant_id: "trace_opening_default",
              text: "Garry 报告 2-3 附近有一处小型营地痕迹。",
              speaker_crew_id: "garry",
            },
            {
              template_variant_id: "trace_body_default",
              text: "没有活动迹象，只有冷灰和一根被绑过的树枝。",
              speaker_crew_id: "garry",
            },
          ],
          available_options: [
            {
              option_id: "mark_camp",
              template_variant_id: "trace_mark_default",
              text: "标记这处营地痕迹。",
              is_default: true,
            },
            {
              option_id: "note_only",
              template_variant_id: "trace_note_default",
              text: "记录下来，继续行动。",
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

function createEmptyEventRuntimeState() {
  return {
    active_events: {},
    active_calls: {},
    objectives: {},
    event_logs: [],
    world_history: {},
    world_flags: {},
    crew_actions: {},
    inventories: {},
    rng_state: null,
  };
}

function createInitialMapState() {
  return {
    configId: "default-map",
    configVersion: 1,
    rows: 8,
    cols: 8,
    originTileId: "4-4",
    discoveredTileIds: ["4-4"],
    investigationReportsById: {},
    tilesById: Object.fromEntries(
      Array.from({ length: 8 }, (_, rowIndex) =>
        Array.from({ length: 8 }, (_, colIndex) => {
          const id = `${rowIndex + 1}-${colIndex + 1}`;
          return [
            id,
            {
              discovered: id === "4-4",
              investigated: id === "4-4",
              activeSpecialStateIds: [],
              revealedObjectIds: [],
              revealedSpecialStateIds: [],
            },
          ];
        }),
      ).flat(),
    ),
  };
}

function createMapWithDiscoveredTiles(...tileIds: string[]) {
  const map = createInitialMapState();
  for (const tileId of tileIds) {
    const previous = map.tilesById[tileId] ?? {};
    map.discoveredTileIds = Array.from(new Set([...map.discoveredTileIds, tileId]));
    map.tilesById[tileId] = {
      ...previous,
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

function createForestBeastMap() {
  const map = createMapWithDiscoveredTiles("2-3");
  map.tilesById["2-3"] = {
    ...map.tilesById["2-3"],
    activeSpecialStateIds: ["beast-approach"],
    revealedSpecialStateIds: ["beast-approach"],
  };
  return map;
}

function tile(
  id: string,
  coord: string,
  row: number,
  col: number,
  terrain: string,
  resources: string[],
  buildings: string[],
  instruments: string[],
  crew: string[],
  danger: string,
  status: string,
) {
  return {
    id,
    coord,
    row,
    col,
    terrain,
    resources,
    buildings,
    instruments,
    crew,
    danger,
    status,
    investigated: false,
  };
}
