import { answerMikeIncomingCall, createCompatibleMap, expect, GAME_SAVE_KEY, installSave, readSave, startNormalMikeCall, test, type Page } from "./support/appTest";

test.describe.configure({ timeout: 60_000 });

test("shows the task page and supports status/category filters", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /任务/ }).click();
  await expect(page.getByRole("heading", { name: "任务追踪" })).toBeVisible();
  await expect(page.getByText("UNFINISHED 1 / MAIN 1")).toBeVisible();
  await expect(page.getByText("重整坠毁现场").first()).toBeVisible();

  await page.locator(".console-task-filter-group").filter({ hasText: "完成状态" }).getByRole("button", { name: "已完成" }).click();
  await expect(page.getByText("当前筛选下没有任务。").first()).toBeVisible();

  await page.locator(".console-task-filter-group").filter({ hasText: "完成状态" }).getByRole("button", { name: "全部" }).click();
  await page.locator(".console-task-filter-group").filter({ hasText: "任务类型" }).getByRole("button", { name: "次要" }).click();
  await expect(page.getByText("当前筛选下没有任务。").first()).toBeVisible();
});

test("clears the task update star after viewing task updates", async ({ page }) => {
  const questState = createInitialQuestStateForE2e();
  questState.updated_quest_ids = ["regroup_after_crash"];
  await installSave(page, { quest_state: questState });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "任务有更新 task" })).toBeVisible();

  await page.getByRole("button", { name: "任务有更新 task" }).click();
  await expect(page.getByRole("heading", { name: "任务追踪" })).toBeVisible();
  await expect(page.getByRole("button", { name: "任务有更新 task" })).toHaveCount(0);
  await expect(page.getByText("RECENT UPDATE: 重整坠毁现场")).toBeVisible();
  await expect(page.getByRole("button", { name: /重整坠毁现场 UPDATED/ })).toBeVisible();

  await page.getByRole("button", { name: /控制台/ }).click();
  await expect(page.getByRole("heading", { name: "前沿基地控制中心" })).toBeVisible();
  await expect(page.getByRole("button", { name: "任务有更新 task" })).toHaveCount(0);
  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return Array.isArray(save.quest_state?.updated_quest_ids) && save.quest_state.updated_quest_ids.length === 0;
  }, GAME_SAVE_KEY);
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
  await page.getByRole("button", { name: /任务/ }).click();

  await expect(page.getByText("奥德赛号坠毁点已稳定").first()).toBeVisible();
  await expect(page.getByText("麦克完成了 奥德赛号坠毁点的初步调查与关键设备修复。").first()).toBeVisible();
  await expect(page.getByText("发电机恢复基础供能。").first()).toBeVisible();
  await expect(page.getByText("维生系统重新上线。").first()).toBeVisible();
  await expect(page.getByText("穿梭机核心进入可评估状态。").first()).toBeVisible();
});

test("completes a quest todo through the crash-site event and preserves it after reload", async ({ page }) => {
  await installSave(page, {
    map: createCrashSiteSurveyMap(),
  });
  await page.goto("/");
  await page.getByRole("button", { name: /任务/ }).click();

  await expect(page.getByText("调查 奥德赛号坠毁点").first()).toBeVisible();
  await expect(page.getByText("维修奥德赛号发电机")).toHaveCount(0);

  await startNormalMikeCall(page);
  await page.getByRole("button", { name: "调查当前区域" }).click();
  await page.clock.runFor(45_000);
  await answerMikeIncomingCall(page);
  await expect(
    page.getByText("这里还有几套能辨认出来的关键设施，发电机、维生装置和穿梭机核心都还在，只是现在都散在撞击坑边上。").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认标记这些可用设施。" }).click();

  const saved = await readSave(page);
  expect(saved.quest_state.quests.regroup_after_crash.todos.survey_crash_site).toMatchObject({
    status: "completed",
  });
  expect(saved.quest_state.quests.regroup_after_crash.current_node_id).toBe("repair_targets_revealed");

  await page.reload();
  await page.getByRole("button", { name: /任务/ }).click();
  const surveyTodo = page.locator(".console-task-todo").filter({ hasText: "调查 奥德赛号坠毁点" });
  await expect(surveyTodo.getByText("已完成")).toBeVisible();
  await expect(page.getByText("维修奥德赛号发电机").first()).toBeVisible();
  await expect(page.getByText("维修维生系统").first()).toBeVisible();
  await expect(page.getByText("维修穿梭机核心").first()).toBeVisible();
});

test("quest navigation opens map context without starting calls or movement", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /任务/ }).click();

  await page.getByRole("button", { name: "查看 奥德赛号坠毁点" }).first().click();
  await expect(page.getByRole("heading", { name: "卫星雷达地图" })).toBeVisible();
  await expect(page.locator(".console-ascii-map-stage")).toHaveAttribute("data-focus-tile-id", "129-129");
  await expect(page.getByText("[TILE] 129-129 / 平原 / 晴朗")).toBeVisible();
  expect((await readSave(page)).crew_actions).toEqual({});
});

test("task page layout leaves core controls reachable on task, call, and map pages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /任务/ }).click();
  await expectConsoleLayoutHasRoom(page);

  await startNormalMikeCall(page);
  await expect(page.getByRole("heading", { name: "麦克 通话界面" })).toBeVisible();
  await expect(page.getByRole("button", { name: "调查当前区域" })).toBeVisible();
  await expectConsoleLayoutHasRoom(page);

  await page.getByRole("button", { name: /地图/ }).click();
  await expect(page.locator(".console-ascii-map-stage")).toBeVisible();
  await expectConsoleLayoutHasRoom(page);
});

async function expectConsoleLayoutHasRoom(page: Page) {
  const mainBox = await page.locator(".game-console-main").boundingBox();
  const screenBox = await page.locator(".console-screen-content").boundingBox();
  expect(mainBox).toBeTruthy();
  expect(screenBox).toBeTruthy();
  expect(screenBox?.width ?? 0).toBeGreaterThan(300);
  expect(screenBox?.height ?? 0).toBeGreaterThan(300);
}

function createCrashSiteSurveyMap() {
  return createCompatibleMap({
    tilesById: {
      "129-129": {
        discovered: true,
        investigated: false,
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
