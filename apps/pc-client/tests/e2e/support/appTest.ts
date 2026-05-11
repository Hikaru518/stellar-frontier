import { expect, test as base, type Page } from "@playwright/test";

export { expect, type Page };

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install();
    await page.addInitScript(() => {
      window.localStorage.setItem("stellar-frontier-e2e-disable-animation", "1");
    });
    await use(page);
  },
});

export const GAME_SAVE_KEY = "stellar-frontier-save-v2";
export const CRASH_SITE_OBJECT_IDS = ["iafs_generator", "iafs_life_support", "iafs_shuttle_core"];

const GAME_SAVE_VERSION = 3;
const GAME_SAVE_SCHEMA_VERSION = "event-program-model-v1";
const MAP_CONFIG_ID = "default-map";
const MAP_CONFIG_VERSION = 3;
const MAP_ROWS = 256;
const MAP_COLS = 256;
const MAP_ORIGIN_TILE_ID = "129-129";

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

const initialLogs = [{ id: 1, time: "19:42", text: "游戏状态初始化完成。", tone: "neutral" }];

export async function installSave(page: Page, partial: Record<string, unknown>) {
  const save = {
    saveVersion: GAME_SAVE_VERSION,
    schema_version: GAME_SAVE_SCHEMA_VERSION,
    created_at_real_time: "2026-05-09T00:00:00.000Z",
    updated_at_real_time: "2026-05-09T00:00:00.000Z",
    elapsedGameSeconds: 0,
    crew: [idleMike()],
    baseInventory: [],
    map: createCompatibleMap(),
    tiles: [],
    logs: initialLogs,
    resources: initialResources,
    eventHistory: {},
    active_events: {},
    active_calls: {},
    objectives: {},
    event_logs: [],
    world_history: {},
    world_flags: {},
    crew_actions: {},
    inventories: {},
    quest_state: createInitialQuestStateForE2e(),
    rng_state: null,
    ...partial,
  };

  await page.addInitScript(
    ({ key, value }) => {
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    },
    { key: GAME_SAVE_KEY, value: save },
  );
}

export async function readSave(page: Page) {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), GAME_SAVE_KEY);
}

export async function waitForRuntimeEventStatus(page: Page, eventDefinitionId: string, status: string) {
  await page.waitForFunction(
    ({ key, expectedEventDefinitionId, expectedStatus }) => {
      const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      return Object.values(save.active_events ?? {}).some(
        (event) =>
          event &&
          typeof event === "object" &&
          (event as { event_definition_id?: string; status?: string }).event_definition_id === expectedEventDefinitionId &&
          (event as { status?: string }).status === expectedStatus,
      );
    },
    { key: GAME_SAVE_KEY, expectedEventDefinitionId: eventDefinitionId, expectedStatus: status },
  );
}

export async function startNormalMikeCall(page: Page) {
  await mikeCard(page).getByRole("button", { name: "通话" }).click();
}

export function mikeCard(page: Page) {
  return page.locator("article.console-crew-card").filter({ hasText: "Mike" }).first();
}

export function objectSection(page: Page, name: string) {
  return page.getByRole("heading", { name }).locator("xpath=ancestor::section[1]");
}

export async function selectMapTile(page: Page, tileId: string) {
  const match = /^(\d+)-(\d+)$/.exec(tileId);
  expect(match).not.toBeNull();
  const row = Number(match?.[1]);
  const col = Number(match?.[2]);
  const stage = page.locator(".console-ascii-map-stage");
  await expect(stage).toBeVisible();
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();

  await stage.click({
    position: {
      x: clamp(((col - 1 + 0.5) / MAP_COLS) * (box?.width ?? 1), 1, Math.max(1, (box?.width ?? 1) - 1)),
      y: clamp(((row - 1) / MAP_ROWS) * (box?.height ?? 1), 1, Math.max(1, (box?.height ?? 1) - 1)),
    },
  });
  await expect(stage).toHaveAttribute("data-focus-tile-id", tileId);
}

export async function setDebugTimeMultiplier(page: Page, multiplierLabel: "1x" | "2x" | "4x") {
  await page.getByRole("button", { name: "[DEBUG]" }).click();
  await page.getByRole("button", { name: multiplierLabel }).click();
  await page.getByRole("button", { name: "关闭" }).click();
}

export function idleMike(currentTile = MAP_ORIGIN_TILE_ID, overrides: Record<string, unknown> = {}) {
  return {
    id: "mike",
    currentTile,
    status: "待命中。",
    statusTone: "neutral",
    hasIncoming: false,
    canCommunicate: true,
    unavailable: false,
    conditions: [],
    ...overrides,
  };
}

export function createCompatibleMap(overrides: Record<string, unknown> = {}) {
  return {
    configId: MAP_CONFIG_ID,
    configVersion: MAP_CONFIG_VERSION,
    rows: MAP_ROWS,
    cols: MAP_COLS,
    originTileId: MAP_ORIGIN_TILE_ID,
    ...overrides,
  };
}

export function createRevealedCrashSiteMap() {
  return createCompatibleMap({
    tilesById: {
      [MAP_ORIGIN_TILE_ID]: {
        discovered: true,
        investigated: true,
        revealedObjectIds: CRASH_SITE_OBJECT_IDS,
      },
    },
    mapObjects: {
      iafs_generator: { id: "iafs_generator", status_enum: "damaged" },
      iafs_life_support: { id: "iafs_life_support", status_enum: "damaged" },
      iafs_shuttle_core: { id: "iafs_shuttle_core", status_enum: "damaged" },
    },
  });
}

export function runtimeCrewAction(overrides: Record<string, unknown>) {
  return {
    id: "runtime-action",
    crew_id: "mike",
    type: "move",
    status: "active",
    source: "player_command",
    parent_event_id: null,
    objective_id: null,
    action_request_id: null,
    from_tile_id: null,
    to_tile_id: null,
    target_tile_id: null,
    path_tile_ids: [],
    started_at: 0,
    ends_at: null,
    progress_seconds: 0,
    duration_seconds: 0,
    can_interrupt: true,
    interrupt_duration_seconds: 10,
    action_params: {},
    ...overrides,
  };
}

export function findSavedCrew(saved: { crew?: Array<Record<string, unknown>> }, crewId: string) {
  const member = saved.crew?.find((item) => item.id === crewId);
  expect(member).toBeDefined();
  return member!;
}

function createInitialQuestStateForE2e() {
  return {
    quests: {
      regroup_after_crash: {
        id: "regroup_after_crash",
        status: "incomplete",
        current_node_id: "crash_site_unsecured",
        updated_at: 0,
        completed_at: null,
        todos: {
          survey_crash_site: { id: "survey_crash_site", status: "incomplete", updated_at: 0, completed_at: null },
          repair_generator: { id: "repair_generator", status: "incomplete", updated_at: 0, completed_at: null },
          repair_life_support: { id: "repair_life_support", status: "incomplete", updated_at: 0, completed_at: null },
          repair_shuttle_core: { id: "repair_shuttle_core", status: "incomplete", updated_at: 0, completed_at: null },
        },
        subquests: {},
      },
    },
    updated_quest_ids: [],
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
