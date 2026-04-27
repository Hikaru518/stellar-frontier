import { expect, test, type Page } from "@playwright/test";

const GAME_SAVE_KEY = "stellar-frontier-save-v1";
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

test("loads the app and opens the incoming Amy channel without legacy emergency choices", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "前沿基地控制中心" })).toBeVisible();
  await page.getByRole("button", { name: /通讯台/ }).click();

  await expect(page.getByRole("heading", { name: "通讯台", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "接通" }).click();

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

test("creates a manual Garry mine anomaly call after the default survey path", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");

  await page.getByRole("button", { name: /通讯台/ }).click();
  const garryCard = page.getByText("Garry，退休老大爷").locator("xpath=ancestor::article[1]");
  await garryCard.getByRole("button", { name: "通话" }).click();
  await page.getByRole("button", { name: /开展调查/ }).click();

  await page.clock.runFor(180_000);
  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return Object.values(save.active_events ?? {}).some(
      (event) => (event as { event_definition_id?: string }).event_definition_id === "garry_mine_anomaly_report",
    );
  }, GAME_SAVE_KEY);

  await page.getByRole("button", { name: "结束通话" }).last().click();
  const runtimeCallPanel = page.getByText("事件通话 · 1 条").locator("xpath=ancestor::section[1]");
  await runtimeCallPanel.getByRole("button", { name: "接通" }).click();
  await expect(page.getByText("Garry 报告 3-3 的矿床下方传来空洞回声。")).toBeVisible();
  await expect(page.getByRole("button", { name: "标记异常，交给工程复核。" })).toBeVisible();
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
    schema_version: GAME_SAVE_SCHEMA_VERSION,
    created_at_real_time: "2026-04-27T00:00:00.000Z",
    updated_at_real_time: "2026-04-27T00:00:00.000Z",
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
