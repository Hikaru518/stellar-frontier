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
  startNormalMikeCall,
  test,
} from "./support/appTest";

test.describe.configure({ timeout: 75_000 });

test("shows the JSON-driven 256x256 radar map on a new game", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /地图/ }).click();

  await expect(page.locator(".map-grid")).toHaveCount(0);
  await expect(page.locator(".phaser-map-stage")).toHaveCount(0);
  const stage = page.locator(".console-ascii-map-stage");
  await expect(stage).toBeVisible();
  await expect(stage).toHaveAttribute("data-focus-tile-id", "129-129");
  await expect(page.getByText("render + function / 256 x 256")).toBeVisible();
  await expect(page.getByText("[TILE] 129-129 / 平原 / 晴朗")).toBeVisible();
  await expect(page.getByText(/\[FOCUS\] \(0,0\) \/ IAFS坠毁点/)).toBeVisible();
});

test("renders the console radar canvas inside a stable fixed map viewport", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /地图/ }).click();

  const stage = page.locator(".console-ascii-map-stage");
  const renderCanvas = stage.locator(".console-retro-map-render-layer");
  const functionCanvas = stage.locator(".console-retro-map-function-canvas");
  await expect(renderCanvas).toHaveCount(1);
  await expect(functionCanvas).toHaveCount(1);
  const initialBox = await stage.boundingBox();
  expect(initialBox?.height).toBeGreaterThan(0);
  expect(initialBox?.width).toBeGreaterThan(0);

  await page.clock.runFor(1_000);

  const laterBox = await stage.boundingBox();
  expect(laterBox?.height).toBeCloseTo(initialBox?.height ?? 0, 0);
  expect(laterBox?.width).toBeCloseTo(initialBox?.width ?? 0, 0);
});

test("shows authored crash-site radar metadata on the occupied origin tile", async ({ page }) => {
  await installSave(page, {
    map: createRevealedCrashSiteMap(),
  });

  await page.goto("/");
  await page.getByRole("button", { name: /地图/ }).click();
  await selectMapTile(page, "129-129");

  await expect(page.locator(".console-ascii-map-stage")).toHaveAttribute("data-focus-tile-id", "129-129");
  await expect(page.getByText("[TILE] 129-129 / 平原 / 晴朗")).toBeVisible();
  await expect(page.getByText(/\[FOCUS\] \(0,0\) \/ IAFS坠毁点/)).toBeVisible();
  await expect(page.getByText(/Mike/)).toBeVisible();
});

test("moves Mike after selecting a target tile from the console radar and confirming in call", async ({ page }) => {
  await page.goto("/");

  await startNormalMikeCall(page);
  await page.getByRole("button", { name: "移动到指定区域" }).click();

  await expect(page.getByRole("heading", { name: "卫星雷达地图" })).toBeVisible();
  await selectMapTile(page, "129-130");
  await page.getByRole("button", { name: "标记当前坐标" }).click();
  await expect(page.getByRole("heading", { name: "Mike 通话界面" })).toBeVisible();
  const confirmMoveButton = page.getByRole("button", { name: /确认请求 Mike 前往 坠毁东侧 \(1,0\)/ });
  await expect(confirmMoveButton).toBeVisible();
  await confirmMoveButton.click();
  await expect(page.getByText("移动请求已确认。队员开始按路线逐格推进，抵达后会原地待命。")).toBeVisible();

  await page.clock.runFor(61_000);
  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return save.crew?.find((member: { id: string }) => member.id === "mike")?.currentTile === "129-130";
  }, GAME_SAVE_KEY);

  await expect(page.getByText(/地点：坠毁东侧 \(1,0\)/)).toBeVisible();

  await page.getByRole("button", { name: /地图/ }).click();
  await expect(page.locator(".console-ascii-map-stage")).toBeVisible();
});

test("moves a seeded crew action along intermediate route steps", async ({ page }) => {
  await installSave(page, {
    crew: [idleMike("129-128", { status: "正在前往目标地点，行进中。", statusTone: "muted" })],
    crew_actions: {
      "mike-move-129-129": runtimeCrewAction({
        id: "mike-move-129-129",
        crew_id: "mike",
        type: "move",
        from_tile_id: "129-128",
        to_tile_id: "129-129",
        target_tile_id: "129-129",
        path_tile_ids: ["129-129"],
        started_at: 0,
        ends_at: 1,
        duration_seconds: 1,
        action_params: {
          route_step_index: 0,
          step_started_at: 0,
          step_finish_time: 1,
          step_durations_seconds: [1],
        },
      }),
    },
  });

  await page.goto("/");
  await page.clock.runFor(2_000);
  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return save.crew?.find((member: { id: string }) => member.id === "mike")?.currentTile === "129-129";
  }, GAME_SAVE_KEY);

  const saved = await readSave(page);
  expect(findSavedCrew(saved, "mike").currentTile).toBe("129-129");
  expect(saved.map.discoveredTileIds).toContain("129-129");
  expect(saved.crew_actions["mike-move-129-129"].action_params.route_step_index).toBe(1);
});

test("keeps the console radar stable while accelerated game time completes a move", async ({ page }) => {
  const consoleFailures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleFailures.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleFailures.push(error.message));

  await installSave(page, {
    crew: [idleMike("129-129", { status: "正在前往坠毁东侧。", statusTone: "muted" })],
    crew_actions: {
      "mike-move-129-130": runtimeCrewAction({
        id: "mike-move-129-130",
        crew_id: "mike",
        type: "move",
        from_tile_id: "129-129",
        to_tile_id: "129-130",
        target_tile_id: "129-130",
        path_tile_ids: ["129-130"],
        started_at: 0,
        ends_at: 1,
        duration_seconds: 1,
        action_params: {
          route_step_index: 0,
          step_started_at: 0,
          step_finish_time: 1,
          step_durations_seconds: [1],
        },
      }),
    },
  });

  await page.goto("/");
  await page.getByRole("button", { name: /地图/ }).click();

  const stage = page.locator(".console-ascii-map-stage");
  await expect(stage).toHaveAttribute("data-focus-tile-id", "129-129");
  await page.clock.runFor(2_000);
  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return save.crew?.find((member: { id: string }) => member.id === "mike")?.currentTile === "129-130";
  }, GAME_SAVE_KEY);
  expect(consoleFailures).toEqual([]);
});
