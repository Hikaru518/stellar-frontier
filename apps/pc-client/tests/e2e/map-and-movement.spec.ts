import {
  createRevealedCrashSiteMap,
  expect,
  findSavedCrew,
  GAME_SAVE_KEY,
  idleMike,
  installSave,
  readSave,
  runtimeCrewAction,
  selectMapTile,
  setDebugTimeMultiplier,
  startNormalMikeCall,
  test,
} from "./support/appTest";

test("shows the full authored IAFS map on a new game", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /卫星雷达/ }).click();

  await expect(page.locator(".map-grid")).toHaveCount(0);
  const stage = page.locator(".phaser-map-stage");
  await expect(stage).toBeVisible();
  await expect(stage).toHaveAttribute("data-zoom-level", "0");
  const semanticLayer = page.getByLabel("地图语义层");
  await expect(semanticLayer.getByRole("button")).toHaveCount(64);
  await expect(semanticLayer.getByRole("button", { name: /IAFS坠毁点/ })).toHaveCount(1);
  await expect(semanticLayer.getByRole("button", { name: /坠毁西侧/ })).toHaveCount(1);
  expect(await semanticLayer.getByRole("button", { name: /北侧山脊/ }).count()).toBeGreaterThan(0);
  await expect(page.getByText(/4x4|4 x 4/)).toHaveCount(0);
});

test("renders the Phaser canvas inside a stable fixed map viewport", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /卫星雷达/ }).click();

  const shell = page.locator(".phaser-map-canvas");
  const stage = page.locator(".phaser-map-stage");
  const canvas = stage.locator("canvas");
  await expect(canvas).toHaveCount(1);
  const initialBox = await shell.boundingBox();
  const canvasBox = await canvas.boundingBox();
  expect(initialBox?.height).toBeGreaterThan(0);
  expect(initialBox?.height).toBeLessThanOrEqual(431);
  expect(canvasBox?.width).toBeGreaterThan(0);
  expect(canvasBox?.height).toBeGreaterThan(0);

  await page.clock.runFor(1_000);

  const laterBox = await shell.boundingBox();
  expect(laterBox?.height).toBeCloseTo(initialBox?.height ?? 0, 0);
});

test("shows full tile info on the occupied revealed crash-site tile", async ({ page }) => {
  await installSave(page, {
    map: createRevealedCrashSiteMap(),
  });

  await page.goto("/");
  await page.getByRole("button", { name: /卫星雷达/ }).click();

  await expect(page.locator(".map-grid")).toHaveCount(0);
  await expect(page.locator(".phaser-map-stage")).toHaveAttribute("data-zoom-level", "0");
  await selectMapTile(page, "4-4");

  const detail = page.locator(".map-detail");
  await expect(detail.getByText("坐标详情：(0,0)")).toBeVisible();
  await expect(detail.getByText("IAFS坠毁点")).toBeVisible();
  await expect(detail.getByText("平原")).toBeVisible();
  await expect(detail.getByText("晴朗")).toBeVisible();
  await expect(detail.getByText("发电机 / 维生装置 / 穿梭机核心")).toBeVisible();
  await expect(detail.getByText("Mike：待命中。")).toBeVisible();
});

test("moves Mike to a full-map tile selected from the complete target list", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /通讯台/ }).click();
  await startNormalMikeCall(page);
  await page.getByRole("button", { name: "移动到指定区域" }).click();

  await page.getByRole("button", { name: /坠毁东侧 \(1,0\).*地形：平原/ }).click();
  await page.getByRole("button", { name: /确认请求 Mike 前往 坠毁东侧 \(1,0\)/ }).click();
  await expect(page.getByText("移动请求已确认。队员开始按路线逐格推进，抵达后会原地待命。")).toBeVisible();

  await page.clock.runFor(61_000);
  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return save.crew?.find((member: { id: string }) => member.id === "mike")?.currentTile === "4-5";
  }, GAME_SAVE_KEY);

  await expect(page.getByText(/地点：坠毁东侧 \(1,0\)/)).toBeVisible();

  await page.getByRole("button", { name: /地图二级菜单/ }).click();
  const semanticLayer = page.getByLabel("地图语义层");
  await expect(semanticLayer.getByRole("button", { name: /坠毁东侧/ })).toBeVisible();
  await expect(semanticLayer.getByRole("button")).toHaveCount(64);
});

test("moves a seeded crew action along intermediate route steps", async ({ page }) => {
  await installSave(page, {
    crew: [idleMike("4-3", { status: "正在前往目标地点，行进中。", statusTone: "muted" })],
    crew_actions: {
      "mike-move-4-5": runtimeCrewAction({
        id: "mike-move-4-5",
        crew_id: "mike",
        type: "move",
        from_tile_id: "4-3",
        to_tile_id: "4-5",
        target_tile_id: "4-5",
        path_tile_ids: ["4-4", "4-5"],
        started_at: 0,
        ends_at: 120,
        duration_seconds: 120,
        action_params: {
          route_step_index: 0,
          step_started_at: 0,
          step_finish_time: 60,
          step_durations_seconds: [60, 60],
        },
      }),
    },
  });

  await page.goto("/");
  await page.clock.runFor(60_000);
  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return save.crew?.find((member: { id: string }) => member.id === "mike")?.currentTile === "4-4";
  }, GAME_SAVE_KEY);

  const saved = await readSave(page);
  expect(findSavedCrew(saved, "mike").currentTile).toBe("4-4");
  expect(saved.map.discoveredTileIds).toContain("4-4");
  expect(saved.crew_actions["mike-move-4-5"].action_params.route_step_index).toBe(1);
});

test("keeps the Phaser map stable while accelerated game time completes a move", async ({ page }) => {
  const consoleFailures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleFailures.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleFailures.push(error.message));

  await installSave(page, {
    crew: [idleMike("4-4", { status: "正在前往坠毁东侧。", statusTone: "muted" })],
    crew_actions: {
      "mike-move-4-5": runtimeCrewAction({
        id: "mike-move-4-5",
        crew_id: "mike",
        type: "move",
        from_tile_id: "4-4",
        to_tile_id: "4-5",
        target_tile_id: "4-5",
        path_tile_ids: ["4-5"],
        started_at: 0,
        ends_at: 60,
        duration_seconds: 60,
        action_params: {
          route_step_index: 0,
          step_started_at: 0,
          step_finish_time: 60,
          step_durations_seconds: [60],
        },
      }),
    },
  });

  await page.goto("/");
  await setDebugTimeMultiplier(page, "1x");
  await setDebugTimeMultiplier(page, "2x");
  await setDebugTimeMultiplier(page, "4x");
  await page.getByRole("button", { name: /卫星雷达/ }).click();

  const stage = page.locator(".phaser-map-stage");
  await expect(stage).toHaveAttribute("data-zoom-level", "0");
  await page.clock.runFor(15_000);
  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return save.crew?.find((member: { id: string }) => member.id === "mike")?.currentTile === "4-5";
  }, GAME_SAVE_KEY);
  expect(consoleFailures).toEqual([]);
});
