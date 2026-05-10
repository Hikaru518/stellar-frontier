import { createCompatibleMap, expect, installSave, readSave, startNormalMikeCall, test, type Page } from "./support/appTest";

test("shows the quest sidebar on the control center and supports collapse, expansion, and filters", async ({ page }) => {
  await page.goto("/");

  const sidebar = page.getByLabel("任务侧边栏");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText("未完成 1")).toBeVisible();
  await expect(sidebar.getByText("主要 1")).toBeVisible();

  await sidebar.getByRole("button", { name: "展开任务" }).click();
  await expect(sidebar.getByRole("heading", { name: "任务追踪" })).toBeVisible();
  await expect(sidebar.getByRole("heading", { name: "重整坠毁现场" })).toBeVisible();

  await sidebar.getByRole("group", { name: "完成状态" }).getByRole("button", { name: "已完成" }).click();
  await expect(sidebar.getByText("当前筛选下没有任务。")).toBeVisible();

  await sidebar.getByRole("group", { name: "完成状态" }).getByRole("button", { name: "全部" }).click();
  await sidebar.getByRole("group", { name: "任务类型" }).getByRole("button", { name: "次要" }).click();
  await expect(sidebar.getByText("当前筛选下没有任务。")).toBeVisible();

  await sidebar.getByRole("button", { name: "折叠" }).click();
  await expect(sidebar.getByRole("button", { name: "展开任务" })).toBeVisible();
});

test("shows completion result for completed crash-site quest from authored content", async ({ page }) => {
  const questState = createInitialQuestStateForE2e();
  questState.quests.regroup_after_crash.status = "completed";
  questState.quests.regroup_after_crash.current_node_id = "repair_targets_revealed";
  questState.quests.regroup_after_crash.completed_at = 120;
  for (const todo of Object.values(questState.quests.regroup_after_crash.todos)) {
    todo.status = "completed";
    todo.completed_at = 120;
  }

  await installSave(page, {
    elapsedGameSeconds: 120,
    map: createCompatibleMap(),
    quest_state: questState,
  });
  await page.goto("/");

  const sidebar = page.getByLabel("任务侧边栏");
  await sidebar.getByRole("button", { name: "展开任务" }).click();

  await expect(sidebar.getByRole("heading", { name: "坠毁点已稳定" })).toBeVisible();
  await expect(sidebar.getByText("Mike 完成了 IAFS 坠毁点的初步调查与关键设备修复。")).toBeVisible();
  await expect(sidebar.getByText("发电机恢复基础供能。")).toBeVisible();
  await expect(sidebar.getByText("维生系统重新上线。")).toBeVisible();
  await expect(sidebar.getByText("穿梭机核心进入可评估状态。")).toBeVisible();
  await expect(sidebar.getByText("维修 IAFS 发电机")).toBeVisible();
});

test("completes a quest todo through the crash-site event and preserves it after reload", async ({ page }) => {
  await installSave(page, {
    map: createCrashSiteSurveyMap(),
  });
  await page.goto("/");

  await page.getByLabel("任务侧边栏").getByRole("button", { name: "展开任务" }).click();
  await expect(page.getByText("调查 IAFS 坠毁点")).toBeVisible();
  await expect(page.getByText("维修 IAFS 发电机")).toHaveCount(0);

  await page.getByRole("button", { name: "通讯台 查看通讯录" }).click();
  await startNormalMikeCall(page);
  await page.getByRole("button", { name: "调查当前区域" }).click();
  await page.clock.runFor(16_000);
  await page.getByRole("button", { name: /返回通讯台|结束通话/ }).last().click();

  const runtimeCallPanel = page.getByText("事件通话 · 1 条").locator("xpath=ancestor::section[1]");
  await runtimeCallPanel.getByRole("button", { name: "接通" }).click();
  await page.getByRole("button", { name: "标记这些可用设施。" }).click();

  const saved = await readSave(page);
  expect(saved.quest_state.quests.regroup_after_crash.todos.survey_crash_site).toMatchObject({
    status: "completed",
  });
  expect(saved.quest_state.quests.regroup_after_crash.current_node_id).toBe("repair_targets_revealed");

  await page.reload();
  await page.getByLabel("任务侧边栏").getByRole("button", { name: "展开任务" }).click();
  const surveyTodo = page.locator(".quest-todo").filter({ hasText: "调查 IAFS 坠毁点" });
  await expect(surveyTodo.getByText("已完成")).toBeVisible();
  await expect(page.getByText("维修 IAFS 发电机")).toBeVisible();
  await expect(page.getByText("维修维生系统")).toBeVisible();
  await expect(page.getByText("维修穿梭机核心")).toBeVisible();
});

test("quest navigation opens context without starting calls or movement", async ({ page }) => {
  await page.goto("/");

  const sidebar = page.getByLabel("任务侧边栏");
  await sidebar.getByRole("button", { name: "展开任务" }).click();

  await sidebar.getByRole("button", { name: "查看 IAFS 坠毁点" }).first().click();
  await expect(page.getByRole("heading", { name: "卫星雷达地图" })).toBeVisible();
  await expect(page.getByText("坐标详情：(0,0)")).toBeVisible();
  expect((await readSave(page)).crew_actions).toEqual({});
});

test("quest sidebar layout leaves core controls reachable on station, call, and map pages", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("任务侧边栏").getByRole("button", { name: "展开任务" }).click();
  await expectQuestLayoutDoesNotOverlap(page);

  await page.getByRole("button", { name: "通讯台 查看通讯录" }).click();
  await expect(page.getByRole("heading", { name: "通讯台", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /通话/ }).first()).toBeVisible();
  await expectQuestLayoutDoesNotOverlap(page);

  await startNormalMikeCall(page);
  await expect(page.getByRole("heading", { name: /通话页面：Mike/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "调查当前区域" })).toBeVisible();
  await expectQuestLayoutDoesNotOverlap(page);

  await page.getByRole("button", { name: /地图二级菜单/ }).click();
  await expect(page.locator(".phaser-map-stage")).toBeVisible();
  await expect(page.getByLabel("任务侧边栏").getByRole("button", { name: "折叠" })).toBeVisible();
  await expectQuestLayoutDoesNotOverlap(page);
});

async function expectQuestLayoutDoesNotOverlap(page: Page) {
  const mainBox = await page.locator(".quest-layout-main").boundingBox();
  const sidebarBox = await page.getByLabel("任务侧边栏").boundingBox();
  expect(mainBox).toBeTruthy();
  expect(sidebarBox).toBeTruthy();
  expect((mainBox?.x ?? 0) + (mainBox?.width ?? 0)).toBeLessThanOrEqual((sidebarBox?.x ?? 0) + 1);
}

function createCrashSiteSurveyMap() {
  return createCompatibleMap({
    tilesById: {
      "4-4": {
        discovered: true,
        investigated: false,
        revealedObjectIds: [],
        revealedSpecialStateIds: [],
      },
    },
  });
}

function createInitialQuestStateForE2e() {
  return {
    quests: {
      regroup_after_crash: {
        id: "regroup_after_crash",
        status: "incomplete",
        current_node_id: "crash_site_unsecured",
        updated_at: 0,
        completed_at: null as number | null,
        todos: {
          survey_crash_site: { id: "survey_crash_site", status: "incomplete", updated_at: 0, completed_at: null as number | null },
          repair_generator: { id: "repair_generator", status: "incomplete", updated_at: 0, completed_at: null as number | null },
          repair_life_support: { id: "repair_life_support", status: "incomplete", updated_at: 0, completed_at: null as number | null },
          repair_shuttle_core: { id: "repair_shuttle_core", status: "incomplete", updated_at: 0, completed_at: null as number | null },
        },
        subquests: {},
      },
    },
    updated_quest_ids: [],
  };
}
