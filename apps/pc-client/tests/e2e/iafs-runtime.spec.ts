import {
  CRASH_SITE_OBJECT_IDS,
  expect,
  findSavedCrew,
  GAME_SAVE_KEY,
  idleMike,
  installSave,
  objectSection,
  readSave,
  startNormalMikeCall,
  test,
  waitForRuntimeEventStatus,
  createRevealedCrashSiteMap,
} from "./support/appTest";

test("surveys the IAFS crash site and reveals the three repair actions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("第 1 日 00 小时 00 分钟 00 秒")).toBeVisible();
  await page.getByRole("button", { name: /通讯台/ }).click();
  await startNormalMikeCall(page);

  await expect(page.getByText(/地点：IAFS坠毁点 \(0,0\)/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "发电机" })).toHaveCount(0);

  await page.getByRole("button", { name: "调查当前区域" }).click();
  await expect(page.getByText("调查指令已提交，预计 00:15 后回传结果。")).toBeVisible();
  await page.clock.runFor(16_000);

  await expect(
    page.getByText("这里还有几套能辨认出来的关键设施，发电机、维生装置和穿梭机核心都还在，只是现在都散在撞击坑边上。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "标记这些可用设施。" }).click();
  await waitForRuntimeEventStatus(page, "iafs_crash_site_survey_reveal", "resolved");

  const savedAfterSurvey = await readSave(page);
  expect(savedAfterSurvey.map.tilesById["4-4"].revealedObjectIds).toEqual(CRASH_SITE_OBJECT_IDS);

  await page.getByRole("button", { name: "结束通话" }).last().click();
  await startNormalMikeCall(page);

  await expect(page.getByRole("heading", { name: "发电机" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "维生装置" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "穿梭机核心" })).toBeVisible();
  await expect(page.getByRole("button", { name: "维修" })).toHaveCount(3);
});

test("dispatches a revealed generator repair into a timed crew action", async ({ page }) => {
  await installSave(page, {
    map: createRevealedCrashSiteMap(),
  });

  await page.goto("/");
  await page.getByRole("button", { name: /通讯台/ }).click();
  await startNormalMikeCall(page);

  await objectSection(page, "发电机").getByRole("button", { name: "维修" }).click();

  await expect(page.getByText("维修指令已提交。")).toBeVisible();
  await page.waitForFunction((key) => {
    const save = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return Object.values(save.crew_actions ?? {}).some((action) => {
      if (!action || typeof action !== "object") {
        return false;
      }

      const crewAction = action as { type?: string; action_params?: { object_id?: string } };
      return crewAction.type === "repair" && crewAction.action_params?.object_id === "iafs_generator";
    });
  }, GAME_SAVE_KEY);

  const saved = await readSave(page);
  const repairActions = Object.values(saved.crew_actions ?? {}) as Array<{
    type: string;
    action_params?: { object_id?: string };
  }>;
  expect(repairActions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "repair",
        action_params: expect.objectContaining({ object_id: "iafs_generator" }),
      }),
    ]),
  );
  expect(findSavedCrew(saved, "mike")).toMatchObject({ status: "正在维修发电机。" });
});

test("opens a damaged crash-site object inspection runtime call", async ({ page }) => {
  await installSave(page, {
    map: createRevealedCrashSiteMap(),
  });

  await page.goto("/");
  await page.getByRole("button", { name: /通讯台/ }).click();
  await startNormalMikeCall(page);

  await objectSection(page, "发电机").getByRole("button", { name: "调查" }).click();

  await expect(page.getByText("外壳撕裂，几根主供电线还在断续打火。现在贸然启动只会让发电机继续烧坏。")).toBeVisible();
  await page.getByRole("button", { name: "收到，继续记录。" }).click();
  await waitForRuntimeEventStatus(page, "iafs_generator_inspect_damaged", "resolved");
});

test("default survey away from the crash site reports no new clue", async ({ page }) => {
  await installSave(page, {
    crew: [idleMike("4-3", { status: "坠毁西侧待命。" })],
  });

  await page.goto("/");
  await page.getByRole("button", { name: /通讯台/ }).click();
  await startNormalMikeCall(page);
  await page.getByRole("button", { name: "调查当前区域" }).click();
  await page.clock.runFor(16_000);

  await expect(page.getByText("暂时没有发现值得特别关注的新东西，至少眼下没有。")).toBeVisible();
  await page.getByRole("button", { name: "收到，继续保持观察。" }).click();
  await waitForRuntimeEventStatus(page, "iafs_default_survey_nothing_found", "resolved");
});
